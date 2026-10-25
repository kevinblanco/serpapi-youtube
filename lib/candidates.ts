// Picks the videos most worth remaking: ones that underperformed the channel's
// own baseline on a topic people clearly watch elsewhere on YouTube.

import type { ChannelInfo, DemandCheck, RemakeCandidate, ScoredVideo } from "./types";
import type { YouTubeSearchResponse } from "./serpapi-types";
import { median } from "./stats";
import { parseCount } from "./parse";
import { formatAge, formatFull, formatMultiple } from "./format";

/** A remake target needs time to have proven itself... */
export const MIN_CANDIDATE_AGE_DAYS = 60;
/** ...but past three years the product and the channel have usually moved on. */
export const MAX_CANDIDATE_AGE_DAYS = 1096;
/** Tutorial length. Clips under a minute and talks over 30 minutes aren't remakes. */
export const MIN_CANDIDATE_SECONDS = 60;
export const MAX_CANDIDATE_SECONDS = 1800;
/** How many search results count as "the competition". */
export const COMPETITOR_WINDOW = 10;
/** Fewer competing videos than this says more about the query than about demand. */
export const MIN_COMPETITORS = 5;

// Words that make a title clickable but nobody types into a search box.
const FILLER =
  /\b(simple|easy|fast|quick(ly)?|new|free|tutorial|step by step|in (a few )?minutes|no code required|for beginners|explained)\b/gi;

/**
 * Turns a title into the search a viewer would type: drops the channel's own
 * name and the words that tie it to the title ("with SerpApi"), years and
 * punctuation. The dashboard lets you edit it before spending a search.
 */
export function searchQueryFor(title: string, channel: ChannelInfo): string {
  const brands = [channel.title, channel.handle?.replace(/^@/, "")]
    .filter((s): s is string => Boolean(s && s.trim().length > 1))
    .map((s) => s.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  let query = ` ${title} `;
  if (brands.length) {
    const brand = `(?:${brands.join("|")})(?:'s)?`;
    query = query.replace(new RegExp(`\\s(?:with|using|via|by|from|and|on|in|\\+|&)?\\s*${brand}\\b(?:\\s+api)?`, "gi"), " ");
  }
  return query
    .replace(/#[\p{L}\p{N}_]+/gu, " ") // series hashtags
    .replace(/\b(episode|ep\.?)\s*#?\d+\b/gi, " ")
    .replace(FILLER, " ")
    .replace(/\b(a|an)\s+(?=api\b)/gi, "") // "a simple API" minus "simple"
    .replace(/[|:–—!?"“”()[\]{},]/g, " ")
    .replace(/\s[-+&]\s/g, " ")
    .replace(/\b(19|20)\d\d\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function eligibleForRemake(video: ScoredVideo): boolean {
  const length = video.durationSec;
  return (
    video.format === "video" &&
    video.performance !== null &&
    !video.tooNew &&
    video.ageDays !== null &&
    video.ageDays >= MIN_CANDIDATE_AGE_DAYS &&
    video.ageDays <= MAX_CANDIDATE_AGE_DAYS &&
    (length === null || (length >= MIN_CANDIDATE_SECONDS && length <= MAX_CANDIDATE_SECONDS))
  );
}

/** The weakest eligible videos first: these get the paid demand checks. */
export function shortlist(videos: readonly ScoredVideo[], size: number): ScoredVideo[] {
  return videos
    .filter((v) => eligibleForRemake(v) && v.performance! < 1)
    .sort((a, b) => a.performance! - b.performance!)
    .slice(0, size);
}

export function isOwnResult(result: { channel?: { name?: string; link?: string } }, channel: ChannelInfo): boolean {
  const link = result.channel?.link?.toLowerCase() ?? "";
  const name = result.channel?.name?.trim().toLowerCase() ?? "";
  const handle = channel.handle?.replace(/^@/, "").toLowerCase();
  return Boolean(
    (channel.channelId && link.includes(channel.channelId.toLowerCase())) ||
      (handle && link.includes(`@${handle}`)) ||
      (name && name === channel.title.trim().toLowerCase()),
  );
}

export function demandFromSearch(
  video: ScoredVideo,
  query: string,
  response: YouTubeSearchResponse,
  channel: ChannelInfo,
  checkedAt: string,
): DemandCheck {
  const topResults = (response.video_results ?? []).slice(0, 20).map((r, i) => ({
    rank: i + 1,
    title: r.title ?? "",
    link: r.link ?? "",
    channel: r.channel?.name ?? "",
    views: parseCount(r.views),
    publishedLabel: r.published_date ?? null,
    isOwn: isOwnResult(r, channel),
    videoId: r.video_id ?? null,
  }));
  const competitors = topResults.slice(0, COMPETITOR_WINDOW).filter((r) => !r.isOwn && r.views !== null);
  const ownRank = topResults.find((r) => r.videoId === video.id)?.rank ?? null;
  return {
    videoId: video.id,
    query,
    checkedAt,
    competitorCount: competitors.length,
    competitorMedianViews: median(competitors.map((r) => r.views!)),
    ownRank,
    topResults: topResults.map(({ videoId: _videoId, ...rest }) => rest),
  };
}

const log2 = (x: number) => Math.log(x) / Math.LN2;

/**
 * Score in "doublings": how many times the video would have to double to hit
 * the channel's own expectation, plus (when a search was run) how many times
 * the median competing video out-views it, capped at 6 so one huge creator
 * can't decide the ranking alone. A video already ranking in the top 3 for the
 * query loses a point: the problem there is probably not discovery.
 */
export function scoreCandidate(video: ScoredVideo, demand: DemandCheck | null): number {
  const under = Math.max(0, -log2(video.performance ?? 1));
  if (!demand || demand.competitorMedianViews === null || demand.competitorCount < MIN_COMPETITORS) return under;
  const gap = Math.min(6, Math.max(0, log2(demand.competitorMedianViews / Math.max(video.views ?? 0, 1))));
  const rankPenalty = demand.ownRank !== null && demand.ownRank <= 3 ? 1 : 0;
  return under + gap - rankPenalty;
}

export function reasonsFor(video: ScoredVideo, demand: DemandCheck | null): string[] {
  const reasons: string[] = [];
  if (video.performance !== null) {
    reasons.push(`Got ${formatMultiple(video.performance)} the views this channel usually gets at ${formatAge(video.ageDays)}.`);
  }
  if (demand && demand.competitorCount < MIN_COMPETITORS) {
    reasons.push(
      `Only ${demand.competitorCount} other videos came up for "${demand.query}", too few to judge demand. Try a broader query.`,
    );
  } else if (demand && demand.competitorMedianViews !== null) {
    reasons.push(
      `The top ${demand.competitorCount} other videos for "${demand.query}" have a median of ${formatFull(demand.competitorMedianViews)} views.`,
    );
    reasons.push(
      demand.ownRank === null
        ? `This video isn't in the first ${demand.topResults.length} results for that search.`
        : `This video ranks #${demand.ownRank} for that search.`,
    );
  }
  if (video.enriched && video.chapters.length === 0 && (video.durationSec ?? 0) > 300) {
    reasons.push("No chapters on a video longer than 5 minutes.");
  }
  return reasons;
}

export function buildCandidate(
  video: ScoredVideo,
  channel: ChannelInfo,
  demand: DemandCheck | null,
  query = demand?.query ?? searchQueryFor(video.title, channel),
): RemakeCandidate {
  return {
    videoId: video.id,
    query,
    reasons: reasonsFor(video, demand),
    score: scoreCandidate(video, demand),
    demand,
  };
}

export function rankCandidates(candidates: RemakeCandidate[]): RemakeCandidate[] {
  return candidates.slice().sort((a, b) => b.score - a.score);
}
