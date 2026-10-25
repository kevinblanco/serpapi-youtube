import type {
  AgeModel,
  ChannelInfo,
  GroupStat,
  MonthBucket,
  ScoredVideo,
  Summary,
  TitleFeatureStat,
  Video,
} from "./types";
import { clamp, median, theilSen } from "./stats";
import { findThemes } from "./themes";

/** Videos younger than this are still collecting their first views. */
export const MIN_AGE_DAYS = 14;

/**
 * Fits log(views) against log(age) on regular uploads old enough to count.
 * Shorts and live streams follow different curves, so they stay out of the fit.
 * With fewer than 8 usable videos the model falls back to the channel median,
 * so "performance" becomes plain views / median views.
 */
export function fitAgeModel(videos: readonly Video[]): AgeModel | null {
  const usable = videos.filter(
    (v) => v.format === "video" && v.views !== null && v.views > 0 && v.ageDays !== null && v.ageDays >= MIN_AGE_DAYS,
  );
  if (usable.length === 0) return null;
  const xs = usable.map((v) => Math.log(v.ageDays!));
  const ys = usable.map((v) => Math.log(v.views!));

  const fit = usable.length >= 8 ? theilSen(xs, ys) : null;
  if (!fit) {
    return { method: "median", intercept: median(ys)!, slope: 0, sampleSize: usable.length, minAgeDays: MIN_AGE_DAYS };
  }
  // A channel can grow so fast that newer videos beat older ones; allow a
  // negative slope but keep it in a range that can't explode on extrapolation.
  return {
    method: "theil-sen",
    intercept: fit.intercept,
    slope: clamp(fit.slope, -1, 2),
    sampleSize: usable.length,
    minAgeDays: MIN_AGE_DAYS,
  };
}

export function expectedViews(model: AgeModel, ageDays: number): number {
  return Math.exp(model.intercept + model.slope * Math.log(Math.max(ageDays, 1)));
}

export function scoreVideos(videos: readonly Video[], model: AgeModel | null): ScoredVideo[] {
  return videos.map((video) => {
    const scorable = model && video.format !== "short" && video.ageDays !== null && video.views !== null;
    const expected = scorable ? expectedViews(model, video.ageDays!) : null;
    return {
      ...video,
      expectedViews: expected,
      performance: expected && video.views !== null ? video.views / expected : null,
      tooNew: video.ageDays !== null && video.ageDays < MIN_AGE_DAYS,
    };
  });
}

function groupStat(key: string, label: string, members: readonly ScoredVideo[]): GroupStat {
  return {
    key,
    label,
    count: members.length,
    medianPerformance: median(members.flatMap((v) => (v.performance !== null && !v.tooNew ? [v.performance] : []))),
    medianViews: median(members.flatMap((v) => (v.views !== null ? [v.views] : []))),
    totalViews: members.reduce((sum, v) => sum + (v.views ?? 0), 0),
    videoIds: members.map((v) => v.id),
  };
}

const DURATION_BUCKETS: { key: string; label: string; max: number }[] = [
  { key: "lt2", label: "Under 2 min", max: 120 },
  { key: "2to5", label: "2 to 5 min", max: 300 },
  { key: "5to10", label: "5 to 10 min", max: 600 },
  { key: "10to20", label: "10 to 20 min", max: 1200 },
  { key: "20to40", label: "20 to 40 min", max: 2400 },
  { key: "40plus", label: "40 min and up", max: Infinity },
];

export function durationStats(longForm: readonly ScoredVideo[]): GroupStat[] {
  return DURATION_BUCKETS.map((bucket, i) => {
    const min = i === 0 ? 0 : DURATION_BUCKETS[i - 1]!.max;
    const members = longForm.filter((v) => v.durationSec !== null && v.durationSec >= min && v.durationSec < bucket.max);
    return groupStat(bucket.key, bucket.label, members);
  });
}

const LANGUAGES = /\b(python|javascript|node\.?js|typescript|ruby|golang|go|java|php|rust|c#|\.net|rails|django|flask)\b/i;

export function titleFeatureStats(longForm: readonly ScoredVideo[], channel: ChannelInfo): TitleFeatureStat[] {
  const brand = brandPattern(channel);
  const features: { key: string; label: string; test: (title: string) => boolean }[] = [
    { key: "how-to", label: "Starts with \"How to\"", test: (t) => /^how to\b/i.test(t.trim()) },
    { key: "question", label: "Asks a question", test: (t) => t.includes("?") },
    { key: "number", label: "Has a number", test: (t) => /\d/.test(t) },
    { key: "year", label: "Has a year", test: (t) => /\b20\d\d\b/.test(t) },
    { key: "language", label: "Names a language", test: (t) => LANGUAGES.test(t) },
    { key: "brand", label: "Names the brand", test: (t) => (brand ? brand.test(t) : false) },
    { key: "long", label: "Over 60 characters", test: (t) => t.length > 60 },
  ];
  const scored = longForm.filter((v) => v.performance !== null && !v.tooNew);
  return features.map(({ key, label, test }) => {
    const withF = scored.filter((v) => test(v.title));
    const withoutF = scored.filter((v) => !test(v.title));
    return {
      key,
      label,
      withCount: withF.length,
      withoutCount: withoutF.length,
      withMedian: median(withF.map((v) => v.performance!)),
      withoutMedian: median(withoutF.map((v) => v.performance!)),
    };
  });
}

export function brandPattern(channel: ChannelInfo): RegExp | null {
  const names = [channel.title, channel.handle?.replace(/^@/, "")]
    .filter((s): s is string => Boolean(s && s.trim().length > 1))
    .map((s) => s.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return names.length ? new RegExp(`\\b(${names.join("|")})\\b`, "i") : null;
}

export function brandStopwords(channel: ChannelInfo): Set<string> {
  const words = [channel.title, channel.handle?.replace(/^@/, "")]
    .filter((s): s is string => Boolean(s))
    .flatMap((s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u))
    .filter((w) => w.length > 1);
  return new Set(words);
}

/**
 * How many days back upload dates are good to the month. Looked-up videos have
 * exact dates and YouTube labels anything under a year "n months ago", but
 * "1 year ago" can mean 12 to 23 months. The chart stops where the first such
 * label could start: n whole years back.
 */
export function monthPrecisionHorizon(videos: readonly Video[]): number {
  const yearLabels = videos.filter(
    (v) => v.format !== "short" && v.datePrecision === "relative" && /year/i.test(v.publishedLabel ?? "") && v.ageDays !== null,
  );
  if (yearLabels.length === 0) return Infinity;
  return Math.min(...yearLabels.map((v) => Math.floor(v.ageDays! / 365.25) * 365.25));
}

export function monthBuckets(videos: readonly ScoredVideo[], snapshot: Date, months = 18): MonthBucket[] {
  const horizon = monthPrecisionHorizon(videos);
  const earliest = snapshot.getTime() - horizon * 86_400_000;
  const buckets: MonthBucket[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(snapshot.getUTCFullYear(), snapshot.getUTCMonth() - i, 1));
    if (d.getTime() < earliest) continue;
    const month = d.toISOString().slice(0, 7);
    const members = videos.filter((v) => v.format !== "short" && v.publishedAt?.startsWith(month));
    buckets.push({
      month,
      uploads: members.length,
      medianPerformance: median(members.flatMap((v) => (v.performance !== null && !v.tooNew ? [v.performance] : []))),
    });
  }
  return buckets;
}

export function summarize(videos: readonly ScoredVideo[], model: AgeModel | null): Summary {
  const longForm = videos.filter((v) => v.format === "video");
  const shorts = videos.filter((v) => v.format === "short");
  const enriched = longForm.filter((v) => v.enriched && v.views);

  const uploadDates = longForm
    .filter((v) => v.datePrecision === "exact" && v.publishedAt)
    .map((v) => Date.parse(v.publishedAt!))
    .sort((a, b) => b - a);
  const gaps = uploadDates.slice(1).map((t, i) => (uploadDates[i]! - t) / 86_400_000);

  const per1k = (pick: (v: ScoredVideo) => number | null) =>
    median(enriched.flatMap((v) => (pick(v) !== null ? [(pick(v)! / v.views!) * 1000] : [])));

  return {
    longFormCount: longForm.length,
    shortsCount: shorts.length,
    streamsCount: videos.filter((v) => v.format === "stream").length,
    enrichedCount: longForm.filter((v) => v.enriched).length,
    medianViews: median(longForm.flatMap((v) => (v.views !== null ? [v.views] : []))),
    medianShortViews: median(shorts.flatMap((v) => (v.views !== null ? [v.views] : []))),
    uploadsLast90Days: longForm.filter((v) => v.ageDays !== null && v.ageDays <= 90).length,
    // Only exact dates: relative labels are too coarse to measure gaps between uploads.
    medianDaysBetweenUploads: gaps.length >= 3 ? median(gaps) : null,
    likesPer1kViews: per1k((v) => v.likes),
    commentsPer1kViews: per1k((v) => v.comments),
    expectedViewsAt28Days: model ? expectedViews(model, 28) : null,
    expectedViewsAt365Days: model ? expectedViews(model, 365) : null,
  };
}

export function analyze(videos: readonly Video[], channel: ChannelInfo, snapshot: Date) {
  const model = fitAgeModel(videos);
  const scored = scoreVideos(videos, model);
  const longForm = scored.filter((v) => v.format !== "short");
  const themes = findThemes(longForm, { extraStopwords: brandStopwords(channel) }).map((theme) =>
    groupStat(
      theme.key,
      theme.label,
      longForm.filter((v) => theme.videoIds.includes(v.id)),
    ),
  );
  return {
    model,
    videos: scored,
    summary: summarize(scored, model),
    themes,
    durations: durationStats(longForm),
    titleFeatures: titleFeatureStats(longForm, channel),
    months: monthBuckets(scored, snapshot),
  };
}
