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
import { isEmptyResult, type SearchClient } from "./serpapi";

const TAB_PARAM: Record<VideoFormat, string> = { video: "videos", short: "shorts", stream: "streams" };
const CONCURRENCY = 4;

type Emit = (event: ProgressEvent) => void;

export async function fetchChannelInfo(client: SearchClient, options: AuditOptions): Promise<ChannelInfo> {
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
  return {
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

async function fetchTab(
  client: SearchClient,
  channel: ChannelInfo,
  format: VideoFormat,
  options: AuditOptions,
  snapshot: Date,
  emit: Emit,
): Promise<Video[]> {
  const videos: Video[] = [];
  let token: string | undefined;
  for (let page = 1; page <= options.maxPagesPerTab; page++) {
    const res = await client.search<YouTubeChannelResponse>({
      engine: "youtube_channel",
      channel_id: channel.channelId ?? channel.query,
      tab: TAB_PARAM[format],
      ...(format !== "short" && !token ? { sort: "latest" } : {}),
      next_page_token: token,
      gl: options.gl,
      hl: options.hl,
    });
    if (res.error) {
      if (isEmptyResult(res.error)) break;
      emit({ type: "warning", message: `${TAB_PARAM[format]} tab, page ${page}: ${res.error}` });
      break;
    }
    const items =
      format === "video" ? res.videos_results : format === "short" ? res.shorts_results : res.streams_results;
    for (const item of items ?? []) {
      if ("upcoming" in item && item.upcoming) continue;
      const video = toVideo(item, format, snapshot);
      if (video) videos.push(video);
    }
    emit({ type: "progress", label: `${TAB_PARAM[format]} tab`, done: videos.length, total: 0 });
    token = res.serpapi_pagination?.next_page_token;
    if (!token || !items?.length) break;
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

export async function runAudit(input: Partial<AuditOptions>, client: SearchClient, emit: Emit): Promise<Audit> {
  const options: AuditOptions = { ...DEFAULT_OPTIONS, ...input };
  const snapshot = new Date();
  const notes: string[] = [];

  emit({ type: "step", message: `Reading channel ${normalizeChannel(options.channel)}` });
  const channel = await fetchChannelInfo(client, options);

  const byId = new Map<string, Video>();
  for (const format of options.tabs) {
    emit({ type: "step", message: `Listing the ${TAB_PARAM[format]} tab` });
    for (const video of await fetchTab(client, channel, format, options, snapshot, emit)) {
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
  const candidates = [];
  if (options.demandChecks > 0 && weakest.length) {
    emit({ type: "step", message: `Searching YouTube for ${Math.min(options.demandChecks, weakest.length)} candidate topics` });
  }
  for (const [i, video] of weakest.entries()) {
    if (i >= options.demandChecks) {
      candidates.push(buildCandidate(video, channel, null));
      continue;
    }
    const query = searchQueryFor(video.title, channel);
    const res = await client.search<YouTubeSearchResponse>({ engine: "youtube", search_query: query, gl: options.gl, hl: options.hl });
    if (res.error && !isEmptyResult(res.error)) emit({ type: "warning", message: `Search "${query}": ${res.error}` });
    const demand = res.error && !isEmptyResult(res.error) ? null : demandFromSearch(video, query, res, channel, snapshot.toISOString());
    candidates.push(buildCandidate(video, channel, demand, query));
    emit({ type: "progress", label: "topic searches", done: i + 1, total: Math.min(options.demandChecks, weakest.length) });
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
