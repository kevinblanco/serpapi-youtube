import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { relative, resolve } from "node:path";
import { PORT, ROOT } from "./env";
import { SerpApiClient } from "./serpapi";
import { runAudit } from "./collect";
import { fetchOpening, recheckDemand } from "./deep-dive";
import { listAudits, loadAudit, saveAudit, slugFor } from "./store";
import { DEFAULT_OPTIONS, normalizeChannel } from "../lib/options";
import type { AuditOptions, ProgressEvent, VideoFormat } from "../lib/types";

const app = new Hono();
let auditRunning = false;

app.onError((error, c) => c.json({ error: error.message }, 500));

app.get("/api/health", (c) => c.json({ ok: true, hasKey: Boolean(process.env.SERPAPI_API_KEY) }));

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
    channel: normalizeChannel(String(body.channel || DEFAULT_OPTIONS.channel)),
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
  if (auditRunning) return c.json({ error: "An audit is already running." }, 409);
  const options = parseOptions(await c.req.json().catch(() => ({})));
  auditRunning = true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ProgressEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const audit = await runAudit(options, new SerpApiClient({ refresh: options.refresh }), send);
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

app.get("/api/videos/:id/opening", async (c) => {
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

if (process.env.NODE_ENV === "production") {
  const dist = relative(process.cwd(), resolve(ROOT, "dist"));
  app.use("/*", serveStatic({ root: dist }));
  app.get("*", serveStatic({ path: `${dist}/index.html` }));
}

// Localhost only: every request this server makes spends your SerpApi searches.
serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" }, ({ port }) => {
  console.log(`API on http://localhost:${port}`);
});
