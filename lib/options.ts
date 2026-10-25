import type { AuditOptions } from "./types";

export const DEFAULT_OPTIONS: AuditOptions = {
  channel: "serpapi",
  maxPagesPerTab: 20,
  tabs: ["video", "short", "stream"],
  enrich: 40,
  demandChecks: 5,
  gl: "us",
  hl: "en",
  refresh: false,
};

/**
 * SerpApi's channel_id takes a bare handle ("serpapi") or a UC... channel id,
 * never a URL or a leading @, so everything the user types becomes one of those.
 */
export function normalizeChannel(input: string): string {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/youtube\.com\/(?:channel\/(UC[\w-]{22})|@([\w.-]+))/i);
  if (fromUrl) return fromUrl[1] ?? fromUrl[2]!;
  if (/^UC[\w-]{22}$/.test(trimmed)) return trimmed;
  return trimmed.replace(/^@/, "");
}

/** Weak videos listed beyond the ones that get an automatic topic search. */
export const EXTRA_UNCHECKED_CANDIDATES = 6;

/**
 * A rough count of the searches an audit will spend, shown before it runs.
 * The real number is usually lower: tabs end early, and anything already in
 * the local cache is free. Shorts and streams are guessed at 3 pages each.
 */
export function estimateSearches(options: AuditOptions, videoCount: number | null): number {
  const videoPages = videoCount ? Math.min(options.maxPagesPerTab, Math.ceil(videoCount / 30)) : options.maxPagesPerTab;
  // Page 1 of the videos tab comes free with the channel details.
  const tabPages = options.tabs.reduce((sum, tab) => sum + (tab === "video" ? videoPages - 1 : Math.min(3, options.maxPagesPerTab)), 0);
  const candidateLookups = options.demandChecks + EXTRA_UNCHECKED_CANDIDATES;
  return 1 + tabPages + options.enrich + candidateLookups + options.demandChecks;
}
