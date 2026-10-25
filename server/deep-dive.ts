// One-off lookups the dashboard triggers for a single video: its opening
// transcript, and a fresh topic search with a query you edited.

import type { Audit, RemakeCandidate } from "../lib/types";
import type { YouTubeSearchResponse, YouTubeTranscriptResponse } from "../lib/serpapi-types";
import { buildCandidate, demandFromSearch, rankCandidates } from "../lib/candidates";
import { isEmptyResult, type SearchClient } from "./serpapi";

export interface Opening {
  videoId: string;
  language: string | null;
  segments: { startSec: number; text: string }[];
  wordsInFirst30s: number;
  chapters: { title: string; startSec: number }[];
}

/** The first `seconds` of the transcript: how the video opens. */
export async function fetchOpening(client: SearchClient, videoId: string, seconds = 60): Promise<Opening> {
  const res = await client.search<YouTubeTranscriptResponse>({ engine: "youtube_video_transcript", v: videoId });
  if (res.error) throw new Error(res.error);
  const lines = res.transcript ?? [];
  const segments = lines
    .filter((l) => (l.start_ms ?? 0) < seconds * 1000)
    .map((l) => ({ startSec: Math.round((l.start_ms ?? 0) / 1000), text: (l.snippet ?? "").replace(/\s+/g, " ").trim() }));
  const wordsInFirst30s = lines
    .filter((l) => (l.start_ms ?? 0) < 30_000)
    .reduce((n, l) => n + (l.snippet ?? "").split(/\s+/).filter(Boolean).length, 0);
  return {
    videoId,
    language: res.available_transcripts?.find((t) => t.selected)?.language_name ?? null,
    segments,
    wordsInFirst30s,
    chapters: (res.chapters ?? []).map((c) => ({ title: c.chapter ?? "", startSec: Math.round((c.start_ms ?? 0) / 1000) })),
  };
}

/** Runs the topic search for one video and re-ranks the audit's candidates. */
export async function recheckDemand(
  client: SearchClient,
  audit: Audit,
  videoId: string,
  query: string,
): Promise<{ audit: Audit; candidate: RemakeCandidate }> {
  const video = audit.videos.find((v) => v.id === videoId);
  if (!video) throw new Error(`Video ${videoId} isn't in this audit.`);
  const res = await client.search<YouTubeSearchResponse>({
    engine: "youtube",
    search_query: query,
    gl: audit.options.gl,
    hl: audit.options.hl,
  });
  if (res.error && !isEmptyResult(res.error)) throw new Error(res.error);
  const demand = demandFromSearch(video, query, res, audit.channel, new Date().toISOString());
  const candidate = buildCandidate(video, audit.channel, demand, query);
  const others = audit.candidates.filter((c) => c.videoId !== videoId);
  return { audit: { ...audit, candidates: rankCandidates([...others, candidate]) }, candidate };
}
