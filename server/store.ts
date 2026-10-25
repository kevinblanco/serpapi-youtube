import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "./env";
import type { Audit } from "../lib/types";

const AUDIT_DIR = join(DATA_DIR, "audits");

export function slugFor(channel: string): string {
  return channel.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_-]+/g, "-").slice(0, 80) || "channel";
}

export async function saveAudit(audit: Audit): Promise<string> {
  await mkdir(AUDIT_DIR, { recursive: true });
  const slug = slugFor(audit.channel.handle ?? audit.channel.query);
  await writeFile(join(AUDIT_DIR, `${slug}.json`), JSON.stringify(audit, null, 2));
  return slug;
}

export async function loadAudit(slug: string): Promise<Audit | null> {
  const text = await readFile(join(AUDIT_DIR, `${slugFor(slug)}.json`), "utf8").catch(() => null);
  return text ? (JSON.parse(text) as Audit) : null;
}

export async function listAudits(): Promise<{ slug: string; title: string; createdAt: string; videos: number }[]> {
  const files = await readdir(AUDIT_DIR).catch(() => [] as string[]);
  const audits = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        const audit = await loadAudit(f.replace(/\.json$/, ""));
        return audit
          ? { slug: f.replace(/\.json$/, ""), title: audit.channel.title, createdAt: audit.createdAt, videos: audit.videos.length }
          : null;
      }),
  );
  return audits.filter((a) => a !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
