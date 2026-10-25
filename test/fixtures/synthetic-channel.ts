// A made-up channel served through a stub client, shaped like SerpApi's
// documented responses. It exercises the whole pipeline without spending
// searches. None of these titles or numbers describe a real channel.

import type { Params, SearchClient } from "../../server/serpapi";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOPICS = [
  "Scrape Google Maps reviews",
  "Google Search results in Python",
  "Track Google Shopping prices",
  "Build an AI agent with web search",
  "Google Jobs listings to CSV",
  "Bing News monitoring in Node.js",
  "Google Scholar citations in Ruby",
  "Rank tracking for SEO",
  "YouTube search results in Python",
  "Google Trends data for a dashboard",
];
const SUFFIXES = ["with Test Channel", "in 5 minutes", "step by step", "(2025)", "for beginners", "with Test Channel API"];

export interface SyntheticVideo {
  id: string;
  title: string;
  ageDays: number;
  views: number;
  lengthSec: number;
  likes: number;
  comments: number;
  chapters: number;
}

export function syntheticVideos(count = 72, seed = 7): SyntheticVideo[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => {
    const ageDays = Math.round(3 + i * 24 + rand() * 20);
    const topic = TOPICS[i % TOPICS.length]!;
    const pull = 1 + (i % TOPICS.length) * 0.08; // later topics do a bit better
    const noise = Math.exp((rand() - 0.5) * 2.6);
    const views = Math.max(20, Math.round(180 * ageDays ** 0.45 * pull * noise));
    return {
      id: `syn${String(i).padStart(8, "0")}`,
      title: `${topic} ${SUFFIXES[i % SUFFIXES.length]}`,
      ageDays,
      views,
      lengthSec: Math.round(90 + rand() * 1800),
      likes: Math.round(views * (0.01 + rand() * 0.03)),
      comments: Math.round(views * rand() * 0.004),
      chapters: rand() > 0.5 ? 0 : 4,
    };
  });
}

function relativeLabel(days: number): string {
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30.44)} months ago`;
  return `${Math.floor(days / 365.25)} years ago`;
}

function absoluteLabel(days: number, now: Date): string {
  const d = new Date(now.getTime() - days * 86_400_000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export class SyntheticClient implements SearchClient {
  readonly stats = { liveRequests: 0, cachedRequests: 0 };
  readonly calls: Params[] = [];
  readonly videos: SyntheticVideo[];

  constructor(
    private readonly now = new Date(),
    count = 72,
  ) {
    this.videos = syntheticVideos(count);
  }

  async search<T>(params: Params): Promise<T> {
    this.calls.push(params);
    this.stats.liveRequests++;
    return this.respond(params) as T;
  }

  private respond(params: Params): unknown {
    const pageSize = 30;
    if (params.engine === "youtube_channel" && params.about) {
      return {
        channel_results: {
          title: "Test Channel",
          handle: "@testchannel",
          external_id: "UCtesttesttesttesttest00",
          link: "https://www.youtube.com/@testchannel",
          subscribers: 12_400,
          total_views: this.videos.reduce((s, v) => s + v.views, 0),
          video_count: this.videos.length + 8,
          joined_date: "Joined Mar 4, 2019",
          country: "United States",
        },
      };
    }
    if (params.engine === "youtube_channel" && params.tab === "videos") {
      const page = params.next_page_token ? Number(params.next_page_token) : 0;
      const slice = this.videos.slice(page * pageSize, (page + 1) * pageSize);
      const more = (page + 1) * pageSize < this.videos.length;
      return {
        videos_results: slice.map((v, i) => ({
          position: page * pageSize + i + 1,
          title: v.title,
          link: `https://www.youtube.com/watch?v=${v.id}`,
          video_id: v.id,
          views: `${v.views.toLocaleString("en-US")} views`,
          extracted_views: v.views,
          published_date: relativeLabel(v.ageDays),
          length: `${Math.floor(v.lengthSec / 60)}:${String(v.lengthSec % 60).padStart(2, "0")}`,
        })),
        serpapi_pagination: more ? { next_page_token: String(page + 1) } : {},
      };
    }
    if (params.engine === "youtube_channel" && params.tab === "shorts") {
      return {
        shorts_results: Array.from({ length: 8 }, (_, i) => ({
          title: `Short ${i + 1}: one SERP trick`,
          link: `https://www.youtube.com/shorts/short${String(i).padStart(6, "0")}`,
          video_id: `short${String(i).padStart(6, "0")}`,
          extracted_views: 400 + i * 350,
        })),
      };
    }
    if (params.engine === "youtube_channel" && params.tab === "streams") {
      return { error: "YouTube hasn't returned any results for this query." };
    }
    if (params.engine === "youtube_video") {
      const v = this.videos.find((x) => x.id === params.v);
      if (!v) return { error: "Video not found." };
      return {
        title: v.title,
        extracted_views: v.views,
        extracted_likes: v.likes,
        extracted_comment_count: v.comments,
        published_date: absoluteLabel(v.ageDays, this.now),
        description: { content: "x".repeat(300), links: [{ url: "https://example.com" }] },
        chapters: Array.from({ length: v.chapters }, (_, i) => ({ title: `Part ${i + 1}`, time_start: i * 90 })),
      };
    }
    if (params.engine === "youtube") {
      return {
        video_results: Array.from({ length: 12 }, (_, i) => ({
          position_on_page: i + 1,
          title: `${String(params.search_query)} result ${i + 1}`,
          link: `https://www.youtube.com/watch?v=other${String(i).padStart(6, "0")}`,
          video_id: `other${String(i).padStart(6, "0")}`,
          channel: { name: `Creator ${i + 1}`, link: `https://www.youtube.com/@creator${i + 1}` },
          views: 60_000 - i * 4_000,
          published_date: "1 year ago",
        })),
      };
    }
    if (params.engine === "youtube_video_transcript") {
      return {
        transcript: [
          { start_ms: 0, end_ms: 4000, snippet: "Hey everyone, welcome back to the channel." },
          { start_ms: 4000, end_ms: 9000, snippet: "Today we're looking at how to pull reviews out of Google Maps." },
          { start_ms: 40_000, end_ms: 45_000, snippet: "First, grab your API key." },
        ],
      };
    }
    return { error: `Unexpected call: ${JSON.stringify(params)}` };
  }
}
