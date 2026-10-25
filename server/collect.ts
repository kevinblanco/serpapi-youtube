// The audit pipeline: channel info, every tab page, per-video details for the
// videos that matter, then the analysis and the remake shortlist.

import type { Audit, AuditOptions, ChannelInfo, ProgressEvent, Video, VideoFormat } from "../lib/types";
import type {
  ChannelShort,
  ChannelVideo,
  YouTubeChannelResponse,
  YouTubeSearchResponse,
  YouTubeVideoResponse,
} from "../lib/serpapi-types";
import {
  dateDaysBefore,
  daysBetween,
  parseAbsoluteDate,
  parseCount,
  parseDuration,
  relativeAgeDays,
  thumbnailUrl,
  videoIdFromLink,
} from "../lib/parse";
import { analyze } from "../lib/analyze";
import { buildCandidate, demandFromSearch, rankCandidates, searchQueryFor, shortlist } from "../lib/candidates";
import { DEFAULT_OPTIONS, EXTRA_UNCHECKED_CANDIDATES, normalizeChannel } from "../lib/options";
import { isEmptyResult, type Params, type SearchClient } from "./serpapi";

const TAB_PARAM: Record<VideoFormat, string> = { video: "videos", short: "shorts", stream: "streams" };
const CONCURRENCY = 4;

type Emit = (event: ProgressEvent) => void;

/**
 * One search for the channel's details. With about=true the response also
 * carries the first page of the videos tab (latest first) and its pagination,
 * so it doubles as page 1 of that tab.
 */
export async function fetchChannelInfo(
  client: SearchClient,
  options: AuditOptions,
): Promise<{ channel: ChannelInfo; firstVideosPage: YouTubeChannelResponse }> {
  const channel = normalizeChannel(options.channel);
  const res = await client.search<YouTubeChannelResponse>({
    engine: "youtube_channel",
    channel_id: channel,
    about: true,
    gl: options.gl,
    hl: options.hl,
  });
  if (res.error) throw new Error(`Couldn't read channel ${channel}: ${res.error}`);
  const info = res.channel_results ?? {};
  const channelInfo: ChannelInfo = {
    query: channel,
    title: info.title ?? channel,
    handle: info.handle ?? (channel.startsWith("UC") ? null : `@${channel}`),
    channelId: info.external_id ?? (channel.startsWith("UC") ? channel : null),
    link: info.link ?? null,
    thumbnail: info.thumbnail ?? info.thumbnails?.[0]?.url ?? null,
    description: info.description ?? null,
    subscribers: info.subscribers ?? parseCount(info.subscribers_text),
    totalViews: info.total_views ?? parseCount(info.total_views_text),
    videoCount: info.video_count ?? parseCount(info.videos_text),
    joinedDate: info.joined_date ?? null,
    country: info.country ?? null,
  };
  return { channel: channelInfo, firstVideosPage: res };
}

/**
 * The parameters of SerpApi's own serpapi_pagination.next link, minus `about`:
 * the link after an about=true page repeats it, but the API answers 400 when
 * `about` and `next_page_token` arrive together.
 */
export function nextPageParams(res: YouTubeChannelResponse): Params | null {
  const next = res.serpapi_pagination?.next;
  if (!next) return null;
  const params: Params = Object.fromEntries(new URL(next).searchParams);
  delete params.api_key;
  delete params.about;
  return params.next_page_token ? params : null;
}

function toVideo(item: ChannelVideo | ChannelShort, format: VideoFormat, snapshot: Date): Video | null {
  const id = item.video_id ?? videoIdFromLink(item.link);
  if (!id) return null;
  const label = "published_date" in item ? (item.published_date ?? null) : null;
  const age = relativeAgeDays(label);
  return {
    id,
    title: item.title ?? "(untitled)",
    link: item.link ?? `https://www.youtube.com/watch?v=${id}`,
    format,
    thumbnail: thumbnailUrl(item.thumbnail) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    views: item.extracted_views ?? parseCount(item.views),
    durationSec: "length" in item ? parseDuration(item.length) : null,
    publishedLabel: label,
    publishedAt: age !== null ? dateDaysBefore(snapshot, age) : null,
    datePrecision: age !== null ? "relative" : "unknown",
    ageDays: age,
    enriched: false,
    likes: null,
    comments: null,
    chapters: [],
    descriptionLength: null,
    descriptionLinks: null,
  };
}

// Every tab is requested with the identifier the about call succeeded with.
// Tested Oct 2026: tab=videos with a UC... channel id answered "This channel
// doesn't have any videos" for a channel with 121 of them, with or without
// sort, while the handle worked. No sort parameter: latest is the default.
async function fetchTab(
  client: SearchClient,
  channel: ChannelInfo,
  format: VideoFormat,
  options: AuditOptions,
  snapshot: Date,
  emit: Emit,
  firstPage?: YouTubeChannelResponse,
): Promise<Video[]> {
  const videos: Video[] = [];
  let params: Params | null = {
    engine: "youtube_channel",
    channel_id: channel.query,
    tab: TAB_PARAM[format],
    gl: options.gl,
    hl: options.hl,
  };
  for (let page = 1; page <= options.maxPagesPerTab && params; page++) {
    const res: YouTubeChannelResponse =
      page === 1 && firstPage ? firstPage : await client.search<YouTubeChannelResponse>(params);
    if (res.error) {
      if (!isEmptyResult(res.error)) emit({ type: "warning", message: `${TAB_PARAM[format]} tab, page ${page}: ${res.error}` });
      break;
    }
    const items =
      format === "video" ? res.videos_results : format === "short" ? res.shorts_results : res.streams_results;
    if (!items?.length) {
      // SerpApi explains an empty tab in search_information, e.g. "This channel doesn't have any streams".
      const state = Object.values(res.search_information ?? {}).find((v) => typeof v === "string");
      if (page === 1 && state) emit({ type: "step", message: `${TAB_PARAM[format]} tab: ${state}` });
      break;
    }
    for (const item of items) {
      if ("upcoming" in item && item.upcoming) continue;
      const video = toVideo(item, format, snapshot);
      if (video) videos.push(video);
    }
    emit({ type: "progress", label: `${TAB_PARAM[format]} tab`, done: videos.length, total: 0 });
    params = nextPageParams(res);
  }
  return videos;
}

/** Adds exact date, likes, comments, chapters and description stats from youtube_video. */
async function enrichVideo(client: SearchClient, video: Video, options: AuditOptions, snapshot: Date): Promise<string | null> {
  const res = await client.search<YouTubeVideoResponse>({ engine: "youtube_video", v: video.id, gl: options.gl, hl: options.hl });
  if (res.error) return res.error;
  const exact = parseAbsoluteDate(res.published_date);
  if (exact) {
    video.publishedAt = exact;
    video.ageDays = daysBetween(exact, snapshot);
    video.datePrecision = "exact";
  }
  video.views = res.extracted_views ?? parseCount(res.views) ?? video.views;
  video.likes = res.extracted_likes ?? parseCount(res.likes);
  video.comments = res.extracted_comment_count ?? parseCount(res.comment_count);
  video.chapters = (res.chapters ?? []).map((c) => ({ title: c.title ?? "", startSec: c.time_start ?? 0 }));
  video.descriptionLength = res.description?.content?.length ?? null;
  video.descriptionLinks = res.description?.links?.length ?? null;
  video.enriched = true;
  return null;
}

async function pool<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await work(items[next++]!);
  });
  await Promise.all(workers);
}

async function enrichMany(
  client: SearchClient,
  videos: readonly Video[],
  options: AuditOptions,
  snapshot: Date,
  emit: Emit,
  label: string,
): Promise<void> {
  let done = 0;
  await pool(videos, CONCURRENCY, async (video) => {
    const error = await enrichVideo(client, video, options, snapshot).catch((e: Error) => e.message);
    if (error) emit({ type: "warning", message: `Video ${video.id}: ${error}` });
    emit({ type: "progress", label, done: ++done, total: videos.length });
  });
}

/**
 * Runs a full audit. Pass the channel's previous audit to keep the topic
 * queries someone edited in the dashboard; their results are usually cached.
 */
export async function runAudit(
  input: Partial<AuditOptions>,
  client: SearchClient,
  emit: Emit,
  previous: Audit | null = null,
): Promise<Audit> {
  const options: AuditOptions = { ...DEFAULT_OPTIONS, ...input };
  const remembered = new Map(previous?.candidates.filter((c) => c.demand).map((c) => [c.videoId, c.query]) ?? []);
  const snapshot = new Date();
  const notes: string[] = [];

  emit({ type: "step", message: `Reading channel ${normalizeChannel(options.channel)}` });
  const { channel, firstVideosPage } = await fetchChannelInfo(client, options);

  const byId = new Map<string, Video>();
  for (const format of options.tabs) {
    emit({ type: "step", message: `Listing the ${TAB_PARAM[format]} tab` });
    const firstPage = format === "video" ? firstVideosPage : undefined;
    for (const video of await fetchTab(client, channel, format, options, snapshot, emit, firstPage)) {
      if (!byId.has(video.id)) byId.set(video.id, video);
    }
  }
  const videos = [...byId.values()];
  if (videos.length === 0) throw new Error(`No videos found for ${channel.query}.`);

  // Most recent long-form first, the order the videos tab returns them in.
  const longForm = videos.filter((v) => v.format !== "short");
  const toEnrich = longForm.slice(0, options.enrich);
  if (toEnrich.length) {
    emit({ type: "step", message: `Reading details for ${toEnrich.length} videos` });
    await enrichMany(client, toEnrich, options, snapshot, emit, "video details");
  }

  // A first pass finds the weak videos; they need full details before scoring.
  const firstPass = analyze(videos, channel, snapshot);
  const shortlistSize = options.demandChecks + EXTRA_UNCHECKED_CANDIDATES;
  const missing = shortlist(firstPass.videos, shortlistSize)
    .map((s) => byId.get(s.id)!)
    .filter((v) => !v.enriched);
  if (missing.length) {
    emit({ type: "step", message: `Reading details for ${missing.length} remake candidates` });
    await enrichMany(client, missing, options, snapshot, emit, "candidate details");
  }

  const result = analyze(videos, channel, snapshot);
  const weakest = shortlist(result.videos, shortlistSize);
  // The weakest few get a topic search, plus any candidate whose query was edited before.
  const toSearch = weakest.filter((v, i) => i < options.demandChecks || remembered.has(v.id));
  if (toSearch.length) emit({ type: "step", message: `Searching YouTube for ${toSearch.length} candidate topics` });
  const candidates = [];
  for (const video of weakest) {
    if (!toSearch.includes(video)) {
      candidates.push(buildCandidate(video, channel, null));
      continue;
    }
    const query = remembered.get(video.id) ?? searchQueryFor(video.title, channel);
    const res = await client.search<YouTubeSearchResponse>({ engine: "youtube", search_query: query, gl: options.gl, hl: options.hl });
    if (res.error && !isEmptyResult(res.error)) emit({ type: "warning", message: `Search "${query}": ${res.error}` });
    const demand = res.error && !isEmptyResult(res.error) ? null : demandFromSearch(video, query, res, channel, snapshot.toISOString());
    candidates.push(buildCandidate(video, channel, demand, query));
    emit({ type: "progress", label: "topic searches", done: candidates.filter((c) => c.demand).length, total: toSearch.length });
  }

  const relative = result.videos.filter((v) => v.format !== "short" && v.datePrecision === "relative").length;
  if (relative) {
    notes.push(
      `${relative} long-form videos weren't looked up individually, so their age comes from YouTube's relative label ("2 years ago") and is an estimate.`,
    );
  }
  if (result.model?.method === "median") {
    notes.push("Fewer than 8 videos were old enough to fit an age curve, so performance is views divided by the channel median.");
  }
  notes.push("Shorts and live streams are kept out of the age model; Shorts are reported on their own.");

  return {
    version: 1,
    createdAt: snapshot.toISOString(),
    channel,
    options,
    usage: { ...client.stats },
    ...result,
    candidates: rankCandidates(candidates),
    notes,
  };
}
