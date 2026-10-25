import type { Audit, AuditOptions, ProgressEvent, RemakeCandidate } from "../../lib/types";
import type { AccountResponse } from "../../lib/serpapi-types";

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

export const api = {
  health: () => fetch("/api/health").then((r) => json<{ ok: boolean; hasKey: boolean }>(r)),
  account: () => fetch("/api/account").then((r) => json<AccountResponse>(r)),
  audits: () => fetch("/api/audits").then((r) => json<SavedAudit[]>(r)),
  audit: (slug: string) => fetch(`/api/audits/${encodeURIComponent(slug)}`).then((r) => json<Audit>(r)),
  opening: (videoId: string) => fetch(`/api/videos/${videoId}/opening`).then((r) => json<Opening>(r)),
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

export function slugFor(audit: Audit): string {
  return (audit.channel.handle ?? audit.channel.query).toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_-]+/g, "-");
}
