import type { Audit, AuditOptions, ProgressEvent, RemakeCandidate } from "../../lib/types";
import type { AccountResponse } from "../../lib/serpapi-types";
import { snapshot } from "./snapshot";

export interface Opening {
  videoId: string;
  language: string | null;
  segments: { startSec: number; text: string }[];
  wordsInFirst30s: number;
  chapters: { title: string; startSec: number }[];
}

export interface SavedAudit {
  slug: string;
  title: string;
  createdAt: string;
  videos: number;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

const live = {
  health: () => fetch("/api/health").then((r) => json<{ ok: boolean; hasKey: boolean }>(r)),
  account: () => fetch("/api/account").then((r) => json<AccountResponse>(r)),
  audits: () => fetch("/api/audits").then((r) => json<SavedAudit[]>(r)),
  audit: (slug: string) => fetch(`/api/audits/${encodeURIComponent(slug)}`).then((r) => json<Audit>(r)),
  opening: (videoId: string) =>
    fetch(`/api/videos/${encodeURIComponent(videoId)}/opening`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(
      (r) => json<Opening>(r),
    ),
  demand: (slug: string, videoId: string, query: string) =>
    fetch(`/api/audits/${encodeURIComponent(slug)}/demand`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId, query }),
    }).then((r) => json<{ audit: Audit; candidate: RemakeCandidate }>(r)),

  /** Starts an audit and reads its newline-delimited progress stream. */
  async run(options: Partial<AuditOptions>, onEvent: (event: ProgressEvent) => void): Promise<void> {
    const res = await fetch("/api/audits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(options),
    });
    if (!res.ok || !res.body) await json(res);
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as ProgressEvent);
    }
  },
};

const READ_ONLY = "This is a read-only snapshot. Run the dashboard locally to call SerpApi.";

/** In a snapshot build, reads come from the embedded data and anything live is refused. */
const offline: typeof live = {
  health: async () => ({ ok: true, hasKey: true }),
  account: async () => Promise.reject(new Error(READ_ONLY)),
  audits: async () => [
    { slug: slugFor(snapshot!.audit), title: snapshot!.audit.channel.title, createdAt: snapshot!.audit.createdAt, videos: snapshot!.audit.videos.length },
  ],
  audit: async () => snapshot!.audit,
  opening: async (videoId) => snapshot!.openings[videoId] ?? Promise.reject(new Error(READ_ONLY)),
  demand: async () => Promise.reject(new Error(READ_ONLY)),
  run: async () => Promise.reject(new Error(READ_ONLY)),
};

export const api = snapshot ? offline : live;

export function slugFor(audit: Audit): string {
  return (audit.channel.handle ?? audit.channel.query).toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_-]+/g, "-");
}
