import type { AuditOptions } from "./types";

export const DEFAULT_OPTIONS: AuditOptions = {
  channel: "",
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
  const fromUrl = trimmed.match(/youtube\.com\/(?:channel\/(UC[\w-]{22})|@([^/?#\s]+))/i);
  if (fromUrl) return fromUrl[1] ?? decode(fromUrl[2]!);
  if (/^UC[\w-]{22}$/.test(trimmed)) return trimmed;
  return trimmed.replace(/^@/, "");
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Why the input can't be looked up, in words the user can act on, or null when it can. */
export function channelInputError(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return "Enter a channel: its @handle, its UC… channel id, or its URL.";
  if (/youtu\.be\/|youtube\.com\/(?:watch|shorts\/|live\/|embed\/)/i.test(trimmed)) {
    return "That's a link to a video. Open the channel page and copy its address instead.";
  }
  if (/youtube\.com\/(?:c|user)\//i.test(trimmed)) {
    return "Old /c/ and /user/ links can't be looked up. Use the channel's @handle, or its UC… id (About, then Share channel, then Copy channel ID).";
  }
  const channel = normalizeChannel(trimmed);
  // YouTube handles are 3 to 30 letters, digits, underscores, hyphens or periods, in any script.
  if (/^UC[\w-]{22}$/.test(channel) || /^[\p{L}\p{N}_.-]{3,30}$/u.test(channel)) return null;
  return "That doesn't look like a YouTube channel. Use its @handle, its UC… channel id, or its URL.";
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
