// The audit model shared by the collector, the API server and the dashboard.

export type VideoFormat = "video" | "short" | "stream";

/** How we know when a video was published. */
export type DatePrecision =
  | "exact" // absolute date from the youtube_video engine ("Jan 26, 2017")
  | "relative" // YouTube's relative label ("3 months ago"), turned into a midpoint estimate
  | "unknown";

export interface Video {
  id: string;
  title: string;
  link: string;
  format: VideoFormat;
  thumbnail: string | null;
  views: number | null;
  durationSec: number | null;
  publishedLabel: string | null;
  publishedAt: string | null; // ISO date (yyyy-mm-dd)
  datePrecision: DatePrecision;
  ageDays: number | null; // days between publishedAt and the snapshot
  // Filled when the video was enriched with the youtube_video engine.
  enriched: boolean;
  likes: number | null;
  comments: number | null;
  chapters: { title: string; startSec: number }[];
  descriptionLength: number | null;
  descriptionLinks: number | null;
}

export interface ChannelInfo {
  query: string; // what the user typed: handle or UC id
  title: string;
  handle: string | null;
  channelId: string | null;
  link: string | null;
  thumbnail: string | null;
  description: string | null;
  subscribers: number | null;
  totalViews: number | null;
  videoCount: number | null;
  joinedDate: string | null;
  country: string | null;
}

/** log(views) = intercept + slope * log(ageDays), fitted on long-form videos. */
export interface AgeModel {
  method: "theil-sen" | "median";
  intercept: number;
  slope: number;
  sampleSize: number;
  minAgeDays: number;
}

export interface ScoredVideo extends Video {
  expectedViews: number | null;
  /** views / expectedViews. 1 means "what this channel usually gets at this age". */
  performance: number | null;
  tooNew: boolean;
}

export interface GroupStat {
  key: string;
  label: string;
  count: number;
  medianPerformance: number | null;
  medianViews: number | null;
  totalViews: number;
  videoIds: string[];
}

export interface TitleFeatureStat {
  key: string;
  label: string;
  withCount: number;
  withoutCount: number;
  withMedian: number | null;
  withoutMedian: number | null;
}

export interface MonthBucket {
  month: string; // yyyy-mm
  uploads: number;
  medianPerformance: number | null;
}

export interface DemandCheck {
  videoId: string;
  query: string;
  checkedAt: string;
  competitorCount: number;
  competitorMedianViews: number | null;
  ownRank: number | null; // 1-based position in the search results, null when absent
  topResults: {
    rank: number;
    title: string;
    link: string;
    channel: string;
    views: number | null;
    publishedLabel: string | null;
    isOwn: boolean;
  }[];
}

export interface RemakeCandidate {
  videoId: string;
  query: string;
  reasons: string[];
  /** Higher is a better remake target. See lib/candidates.ts for the formula. */
  score: number;
  demand: DemandCheck | null;
}

export interface Summary {
  longFormCount: number;
  shortsCount: number;
  streamsCount: number;
  enrichedCount: number;
  medianViews: number | null;
  medianShortViews: number | null;
  uploadsLast90Days: number;
  medianDaysBetweenUploads: number | null;
  likesPer1kViews: number | null;
  commentsPer1kViews: number | null;
  expectedViewsAt28Days: number | null;
  expectedViewsAt365Days: number | null;
}

export interface Audit {
  version: 1;
  createdAt: string;
  channel: ChannelInfo;
  options: AuditOptions;
  usage: { liveRequests: number; cachedRequests: number };
  videos: ScoredVideo[];
  model: AgeModel | null;
  summary: Summary;
  themes: GroupStat[];
  durations: GroupStat[];
  titleFeatures: TitleFeatureStat[];
  months: MonthBucket[];
  candidates: RemakeCandidate[];
  notes: string[];
}

export interface AuditOptions {
  channel: string;
  maxPagesPerTab: number;
  tabs: VideoFormat[];
  enrich: number; // how many long-form videos get a youtube_video lookup
  demandChecks: number; // how many remake candidates get a YouTube search
  gl: string;
  hl: string;
  refresh: boolean; // ignore the local cache
}

export type ProgressEvent =
  | { type: "step"; message: string }
  | { type: "progress"; label: string; done: number; total: number } // total 0: unknown
  | { type: "warning"; message: string }
  | { type: "done"; audit: Audit }
  | { type: "error"; message: string };
