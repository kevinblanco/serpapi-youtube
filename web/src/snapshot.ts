// A read-only build of the dashboard (npm run snapshot) ships the audit, any
// transcripts already fetched, and the thumbnails inside the HTML file, so it
// works without the local API and on pages that can't load outside images.

import type { Audit } from "../../lib/types";
import type { Opening } from "./api";

export interface Snapshot {
  audit: Audit;
  openings: Record<string, Opening>;
  /** Video id (or "channel") to a data: URI. */
  images: Record<string, string>;
  repoUrl: string;
}

export const snapshot: Snapshot | null =
  (globalThis as { __AUDIT_SNAPSHOT__?: Snapshot }).__AUDIT_SNAPSHOT__ ?? null;

export const isSnapshot = snapshot !== null;

/** The embedded copy of an image in a snapshot, otherwise the original URL. */
export function imageFor(key: string, url: string | null): string | null {
  return snapshot ? (snapshot.images[key] ?? null) : url;
}
