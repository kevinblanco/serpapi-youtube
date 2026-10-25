// Synthetic videos only: these check the math, they say nothing about any real channel.

import { describe, expect, it } from "vitest";
import { analyze, expectedViews, fitAgeModel, monthPrecisionHorizon } from "../lib/analyze";
import { median, theilSen } from "../lib/stats";
import { findThemes } from "../lib/themes";
import type { ChannelInfo, Video } from "../lib/types";

const channel: ChannelInfo = {
  query: "@testchannel",
  title: "Test Channel",
  handle: "@testchannel",
  channelId: "UC0000000000000000000000",
  link: null,
  thumbnail: null,
  description: null,
  subscribers: null,
  totalViews: null,
  videoCount: null,
  joinedDate: null,
  country: null,
};

function video(id: string, title: string, ageDays: number, views: number, extra: Partial<Video> = {}): Video {
  return {
    id,
    title,
    link: `https://www.youtube.com/watch?v=${id}`,
    format: "video",
    thumbnail: null,
    views,
    durationSec: 600,
    publishedLabel: null,
    publishedAt: "2026-01-01",
    datePrecision: "exact",
    ageDays,
    enriched: true,
    likes: Math.round(views * 0.02),
    comments: Math.round(views * 0.002),
    chapters: [],
    descriptionLength: 500,
    descriptionLinks: 3,
    ...extra,
  };
}

// views = 100 * age^0.5 exactly, plus one 10x hit and one 0.1x miss.
const ages = [20, 40, 60, 90, 120, 180, 240, 300, 400, 500, 600, 700];
const base = ages.map((age, i) => video(`vid${String(i).padStart(8, "0")}`, `Topic ${i}`, age, Math.round(100 * Math.sqrt(age))));
const hit = video("hitvideo000", "Scrape Google Maps reviews with Python", 300, Math.round(1000 * Math.sqrt(300)));
const miss = video("missvideo00", "Scrape Google Maps places with Node.js", 300, Math.round(10 * Math.sqrt(300)));

describe("stats", () => {
  it("median handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("theil-sen ignores a single outlier", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    const ys = xs.map((x) => 2 * x + 1);
    ys[3] = 100;
    const fit = theilSen(xs, ys)!;
    expect(fit.slope).toBeCloseTo(2, 5);
    expect(fit.intercept).toBeCloseTo(1, 5);
  });
});

describe("age model", () => {
  it("recovers the curve and isn't pulled by the hit or the miss", () => {
    const model = fitAgeModel([...base, hit, miss])!;
    expect(model.method).toBe("theil-sen");
    expect(model.slope).toBeCloseTo(0.5, 1);
    expect(expectedViews(model, 100)).toBeGreaterThan(900);
    expect(expectedViews(model, 100)).toBeLessThan(1100);
  });

  it("falls back to the median with too few videos", () => {
    const model = fitAgeModel(base.slice(0, 4))!;
    expect(model.method).toBe("median");
    expect(model.slope).toBe(0);
  });

  it("leaves Shorts out of the fit", () => {
    const shorts = ages.map((age, i) => video(`short${String(i).padStart(6, "0")}`, "s", age, 1_000_000, { format: "short" }));
    expect(fitAgeModel([...base, ...shorts])!.sampleSize).toBe(base.length);
  });
});

describe("analyze", () => {
  const result = analyze([...base, hit, miss], channel, new Date("2026-10-25T00:00:00Z"));

  it("scores the hit near 10x and the miss near 0.1x", () => {
    const byId = new Map(result.videos.map((v) => [v.id, v]));
    expect(byId.get("hitvideo000")!.performance!).toBeGreaterThan(7);
    expect(byId.get("missvideo00")!.performance!).toBeLessThan(0.15);
  });

  it("summarizes engagement per 1,000 views", () => {
    expect(result.summary.likesPer1kViews).toBeCloseTo(20, 0);
    expect(result.summary.commentsPer1kViews).toBeCloseTo(2, 0);
  });
});

describe("monthPrecisionHorizon", () => {
  it("stops where the first year-level label could start", () => {
    const recent = video("recent00000", "a", 200, 100);
    const vague = video("vague000000", "b", 548, 100, { datePrecision: "relative", publishedLabel: "1 year ago" });
    expect(monthPrecisionHorizon([recent, vague])).toBeCloseTo(365.25, 2);
    expect(monthPrecisionHorizon([recent])).toBe(Infinity);
  });
});

describe("themes", () => {
  it("prefers a bigram over the words inside it", () => {
    const videos = [
      { id: "1", title: "Scrape Google Maps reviews" },
      { id: "2", title: "Google Maps places with Python" },
      { id: "3", title: "Google Maps API in Node.js" },
      { id: "4", title: "Google Search results in Python" },
      { id: "5", title: "Python Google Shopping scraper" },
    ];
    const themes = findThemes(videos, { minCount: 3 });
    const keys = themes.map((t) => t.key);
    expect(keys).toContain("google maps");
    expect(keys).toContain("python");
    expect(keys).not.toContain("maps");
  });

  it("never joins words across a stopword", () => {
    const videos = [1, 2, 3].map((i) => ({ id: String(i), title: `Google Search results in Python, part ${i}` }));
    const keys = findThemes(videos, { minCount: 3 }).map((t) => t.key);
    expect(keys).toContain("google search result");
    expect(keys).toContain("python");
    expect(keys.some((k) => k.includes("result python"))).toBe(false);
  });

  it("drops a word that appears in most titles of a big catalogue", () => {
    const videos = Array.from({ length: 30 }, (_, i) => ({ id: String(i), title: `Google ${i % 2 ? "Maps" : "Shopping"} trick` }));
    const keys = findThemes(videos, { minCount: 3 }).map((t) => t.key);
    expect(keys).not.toContain("google");
    expect(keys).toContain("google maps trick");
  });

  it("keeps generic words out unless they're part of a phrase, and merges no-code spellings", () => {
    const videos = [
      { id: "1", title: "Bing search scraper, no code" },
      { id: "2", title: "Bing search results (No-Code)" },
      { id: "3", title: "Bing search in Excel, nocode" },
    ];
    const keys = findThemes(videos, { minCount: 3 }).map((t) => t.label);
    expect(keys).toContain("Bing search");
    expect(keys).toContain("No-code");
    expect(keys).not.toContain("Search");
    expect(findThemes([1, 2, 3].map((i) => ({ id: String(i), title: `Web search result ${i}` })), { minCount: 3 })).toEqual([]);
  });

  it("keeps a hashtag's own casing", () => {
    const videos = [1, 2, 3].map((i) => ({ id: String(i), title: `Talk ${i} | #SerpApiPodcast` }));
    expect(findThemes(videos, { minCount: 3 }).map((t) => t.label)).toContain("#SerpApiPodcast");
  });

  it("drops the channel's own name", () => {
    const videos = [1, 2, 3].map((i) => ({ id: String(i), title: `SerpApi trick ${i}` }));
    const keys = findThemes(videos, { minCount: 3, extraStopwords: new Set(["serpapi"]) }).map((t) => t.key);
    expect(keys).toEqual(["trick"]);
  });
});
