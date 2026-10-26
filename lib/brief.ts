// Drafts a remake brief: audience, ICP, goals and metrics, chapters, script
// and visual brief. Everything the data can answer is filled in; everything
// that needs a person (ICP, script, visuals) stays as a visible [TO WRITE].

import type { Audit, RemakeCandidate } from "./types";
import { formatAge, formatDuration, formatFull, formatMultiple } from "./format";

export interface OpeningExcerpt {
  segments: { startSec: number; text: string }[];
  wordsInFirst30s: number;
}

const per1k = (part: number | null, views: number | null) =>
  part !== null && views ? `${((part / views) * 1000).toFixed(1)}` : "–";

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function draftBrief(audit: Audit, candidate: RemakeCandidate, opening?: OpeningExcerpt | null): string {
  const video = audit.videos.find((v) => v.id === candidate.videoId);
  if (!video) throw new Error(`Video ${candidate.videoId} isn't in this audit.`);
  const { summary, channel } = audit;
  const demand = candidate.demand;
  const snapshot = audit.createdAt.slice(0, 10);
  const competitors = demand?.topResults.filter((r) => !r.isOwn).slice(0, 3) ?? [];

  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  push(
    `# Remake brief: ${video.title}`,
    "",
    `Drafted from an audit of ${channel.title} (${channel.handle ?? channel.query}) taken ${snapshot} with SerpApi's YouTube engines.`,
    "",
    "## Why this video",
    "",
    "| | |",
    "|---|---|",
    `| Original | [${cell(video.title)}](${video.link}) |`,
    `| Published | ${video.publishedAt ?? "unknown"}${video.datePrecision === "relative" ? " (estimated)" : ""}, ${formatAge(video.ageDays)} before the audit |`,
    `| Length | ${formatDuration(video.durationSec)} |`,
    `| Views | ${formatFull(video.views)} |`,
    `| Expected for its age on this channel | ${formatFull(video.expectedViews)} |`,
    `| Performance | ${formatMultiple(video.performance)} expected |`,
    `| Likes per 1,000 views | ${per1k(video.likes, video.views)} (channel median ${summary.likesPer1kViews?.toFixed(1) ?? "–"}) |`,
    `| Chapters | ${video.enriched ? video.chapters.length : "not checked"} |`,
  );
  // youtube_video only returns comment counts on its follow-up comments request, so this row is often empty.
  if (video.comments !== null) {
    push(`| Comments per 1,000 views | ${per1k(video.comments, video.views)} (channel median ${summary.commentsPer1kViews?.toFixed(1) ?? "–"}) |`);
  }
  if (demand) {
    push(
      `| YouTube search "${cell(demand.query)}" | ${demand.ownRank ? `ranks #${demand.ownRank}` : `not in the first ${demand.topResults.length} results`} |`,
      `| Median views, top ${demand.competitorCount} other videos | ${formatFull(demand.competitorMedianViews)} |`,
    );
  }
  push("", ...candidate.reasons.map((r) => `- ${r}`), "");

  if (opening?.segments.length) {
    push(
      "### The original opening",
      "",
      `${opening.wordsInFirst30s} words in the first 30 seconds.`,
      "",
      ...opening.segments.filter((s) => s.startSec < 30).map((s) => `> ${formatDuration(s.startSec)} ${s.text}`),
      "",
    );
  }

  push(
    "## At a glance",
    "",
    "| | |",
    "|---|---|",
    "| Runtime | [TO WRITE] |",
    "| Format | [TO WRITE: resolution, aspect ratio, frame rate] |",
    `| Target question | [TO WRITE: the question a viewer types${demand ? `, starting from "${cell(demand.query)}"` : ""}] |`,
    "| Audience | [TO WRITE] |",
    "| Demo or example | [TO WRITE] |",
    "| Primary CTA | [TO WRITE] |",
    "",
    "## ICP",
    "",
    "[TO WRITE: one named person. Role, the job they're trying to finish, where they search, what they tried before finding this video.]",
    "",
    "## Goals and metrics",
    "",
    "| Metric | Baseline | Target | Source |",
    "|---|---|---|---|",
    `| Views at day 28 | ${formatFull(summary.expectedViewsAt28Days)} (channel's expected views at 28 days) | [N] | YouTube Studio |`,
    `| Views at day 365 | ${formatFull(summary.expectedViewsAt365Days)} expected; the original has ${formatFull(video.views)} at ${formatAge(video.ageDays)} | [N] | YouTube Studio |`,
    `| Rank for "${cell(demand?.query ?? candidate.query)}" | ${demand ? (demand.ownRank ? `#${demand.ownRank}` : "not ranked") : "not checked"} | Top 3 | SerpApi youtube engine, re-run weekly |`,
    `| Likes per 1,000 views | ${per1k(video.likes, video.views)} | [N] | SerpApi youtube_video engine |`,
    "| Average percentage viewed | [N] from the original | [N] | YouTube Studio |",
    "| Clicks to your site | [N] | [N] | UTM link in the description |",
    "",
    "## Chapter list",
    "",
    "| # | Chapter | In–Out | Duration | On screen |",
    "|---|---|---|---|---|",
    "| 1 | [TO WRITE] | | | |",
    "",
    "## Script",
    "",
    "[TO WRITE]",
    "",
    "## Visual brief",
    "",
    "[TO WRITE: the look, what's on screen in each chapter, animation, references.]",
    "",
    "## Resources",
    "",
    `- Original video: ${video.link}`,
    ...competitors.map((c) => `- Competing video: [${c.title}](${c.link}) by ${c.channel}, ${formatFull(c.views)} views`),
    "- Links for the description: [TO WRITE]",
    "",
  );
  return lines.join("\n");
}
