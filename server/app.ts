import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { relative } from "node:path";
import { SerpApiClient } from "./serpapi";
import { runAudit } from "./collect";
import { fetchOpening, recheckDemand } from "./deep-dive";
import { listAudits, loadAudit, saveAudit, slugFor } from "./store";
import { DEFAULT_OPTIONS, channelInputError, normalizeChannel } from "../lib/options";
import type { AuditOptions, ProgressEvent, VideoFormat } from "../lib/types";

export const app = new Hono();
let auditRunning = false;

app.onError((error, c) => c.json({ error: error.message }, 500));

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLocal(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Most of these routes spend your SerpApi searches, and any web page you open
 * can send requests to localhost. So the API answers only this dashboard and
 * local tools such as curl:
 *  - Host must be localhost, which stops DNS rebinding (a foreign domain that
 *    resolves to 127.0.0.1).
 *  - Sec-Fetch-Site and Origin, when the browser sends them, must be local.
 *  - Writes must be JSON, which a cross-site form or no-cors fetch can't send
 *    without a CORS preflight, and this server answers no preflights.
 */
app.use("/api/*", async (c, next) => {
  const site = c.req.header("sec-fetch-site");
  const origin = c.req.header("origin");
  if (
    !isLocal(`http://${c.req.header("host") ?? ""}`) ||
    (site !== undefined && site !== "same-origin" && site !== "none") ||
    (origin !== undefined && !isLocal(origin))
  ) {
    return c.json({ error: "This API only answers the dashboard on localhost." }, 403);
  }
  if (c.req.method !== "GET" && !c.req.header("content-type")?.startsWith("application/json")) {
    return c.json({ error: "Send JSON." }, 415);
  }
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true, hasKey: Boolean(process.env.SERPAPI_API_KEY?.trim()) }));

// Free: SerpApi doesn't count Account API calls against the plan.
app.get("/api/account", async (c) => c.json(await new SerpApiClient().account()));

app.get("/api/audits", async (c) => c.json(await listAudits()));

app.get("/api/audits/:slug", async (c) => {
  const audit = await loadAudit(c.req.param("slug"));
  return audit ? c.json(audit) : c.json({ error: "No audit saved for that channel yet." }, 404);
});

const int = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

function parseOptions(body: Record<string, unknown>): AuditOptions {
  const tabs = Array.isArray(body.tabs)
    ? body.tabs.filter((t): t is VideoFormat => t === "video" || t === "short" || t === "stream")
    : DEFAULT_OPTIONS.tabs;
  return {
    channel: normalizeChannel(String(body.channel ?? "")),
    maxPagesPerTab: int(body.maxPagesPerTab, DEFAULT_OPTIONS.maxPagesPerTab, 1, 50),
    tabs: tabs.length ? tabs : ["video"],
    enrich: int(body.enrich, DEFAULT_OPTIONS.enrich, 0, 500),
    demandChecks: int(body.demandChecks, DEFAULT_OPTIONS.demandChecks, 0, 20),
    gl: /^[a-z]{2}$/i.test(String(body.gl)) ? String(body.gl).toLowerCase() : DEFAULT_OPTIONS.gl,
    hl: /^[a-z]{2}(-[a-z0-9]+)?$/i.test(String(body.hl)) ? String(body.hl) : DEFAULT_OPTIONS.hl,
    refresh: body.refresh === true,
  };
}

// Streams progress as newline-delimited JSON, then the finished audit.
app.post("/api/audits", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const problem = channelInputError(String(body.channel ?? ""));
  if (problem) return c.json({ error: problem }, 400);
  if (auditRunning) return c.json({ error: "An audit is already running." }, 409);
  const options = parseOptions(body);
  auditRunning = true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ProgressEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const previous = await loadAudit(options.channel);
        const audit = await runAudit(options, new SerpApiClient({ refresh: options.refresh }), send, previous);
        await saveAudit(audit);
        send({ type: "done", audit });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : String(error) });
      } finally {
        auditRunning = false;
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
});

// POST, though it only reads: it spends a search, so it shouldn't be a link.
app.post("/api/videos/:id/opening", async (c) => {
  const id = c.req.param("id");
  if (!/^[\w-]{11}$/.test(id)) return c.json({ error: "That isn't a YouTube video id." }, 400);
  return c.json(await fetchOpening(new SerpApiClient(), id));
});

app.post("/api/audits/:slug/demand", async (c) => {
  const slug = slugFor(c.req.param("slug"));
  const audit = await loadAudit(slug);
  if (!audit) return c.json({ error: "No audit saved for that channel yet." }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { videoId?: string; query?: string };
  const query = String(body.query ?? "").trim().slice(0, 150);
  if (!body.videoId || !query) return c.json({ error: "Send a videoId and a query." }, 400);
  const result = await recheckDemand(new SerpApiClient(), audit, body.videoId, query);
  await saveAudit(result.audit);
  return c.json(result);
});

app.all("/api/*", (c) => c.json({ error: "Not found." }, 404));

/** Serves the built dashboard (npm run build) from the same port as the API. */
export function serveDashboard(dist: string): void {
  const root = relative(process.cwd(), dist);
  app.use("/*", serveStatic({ root }));
  app.get("*", serveStatic({ path: `${root}/index.html` }));
}
