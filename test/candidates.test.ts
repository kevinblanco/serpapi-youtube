// Synthetic search results only: shaped like SerpApi's youtube engine response.

import { describe, expect, it } from "vitest";
import { demandFromSearch, eligibleForRemake, isOwnResult, scoreCandidate, searchQueryFor } from "../lib/candidates";
import type { ChannelInfo, ScoredVideo } from "../lib/types";

const channel: ChannelInfo = {
  query: "@serpapi",
  title: "SerpApi",
  handle: "@serpapi",
  channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
  link: null,
  thumbnail: null,
  description: null,
  subscribers: null,
  totalViews: null,
  videoCount: null,
  joinedDate: null,
  country: null,
};

const weak: ScoredVideo = {
  id: "weakvideo00",
  title: "How to Scrape Google Maps Reviews with SerpApi",
  link: "",
  format: "video",
  thumbnail: null,
  views: 500,
  durationSec: 600,
  publishedLabel: null,
  publishedAt: null,
  datePrecision: "exact",
  ageDays: 400,
  enriched: true,
  likes: 10,
  comments: 1,
  chapters: [],
  descriptionLength: 100,
  descriptionLinks: 2,
  expectedViews: 2000,
  performance: 0.25,
  tooNew: false,
};

describe("searchQueryFor", () => {
  it.each([
    ["How to Scrape Google Maps Reviews with SerpApi", "how to scrape google maps reviews"],
    ["SerpApi's Google Search API in Python (2024)", "google search api in python"],
    ["Scrape Google Jobs | SerpApi", "scrape google jobs"],
    ["Using SerpApi API and n8n: build an SEO agent!", "and n8n build an seo agent"],
    ["CSS vs XPath for web scraping | #SerpApiPodcast", "css vs xpath for web scraping"],
    ["Work-Life Balance w/ Dmytro | #SerpApiPodcast Ep.10", "work-life balance w/ dmytro"],
    ["Scrape Amazon Products Data using Python (Tutorial 2026)", "scrape amazon products data using python"],
    ["Scrape Bing Search with Python and a Simple API", "scrape bing search with python and api"],
  ])("%s", (title, expected) => {
    expect(searchQueryFor(title, channel)).toBe(expected);
  });
});

describe("demandFromSearch", () => {
  const response = {
    video_results: [
      { title: "A", link: "a", video_id: "aaaaaaaaaaa", views: 40_000, channel: { name: "Someone", link: "https://www.youtube.com/@someone" } },
      { title: "B", link: "b", video_id: "weakvideo00", views: 500, channel: { name: "SerpApi", link: "https://www.youtube.com/@serpapi" } },
      { title: "C", link: "c", video_id: "ccccccccccc", views: "12K views", channel: { name: "Other", link: "https://www.youtube.com/@other" } },
      { title: "D", link: "d", video_id: "ddddddddddd", views: 8000, channel: { name: "Third", link: "https://www.youtube.com/@third" } },
    ],
  };

  it("finds our rank and the competitors' median, skipping our own results", () => {
    const demand = demandFromSearch(weak, "scrape google maps reviews", response, channel, "2026-10-25T00:00:00Z");
    expect(demand.ownRank).toBe(2);
    expect(demand.competitorCount).toBe(3);
    expect(demand.competitorMedianViews).toBe(12_000);
    expect(demand.topResults[1]!.isOwn).toBe(true);
  });

  it("matches our channel by handle, id or name", () => {
    expect(isOwnResult({ channel: { link: "https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa" } }, channel)).toBe(true);
    expect(isOwnResult({ channel: { name: "serpapi" } }, channel)).toBe(true);
    expect(isOwnResult({ channel: { name: "Not SerpApi", link: "https://www.youtube.com/@x" } }, channel)).toBe(false);
  });
});

describe("eligibleForRemake", () => {
  it("keeps tutorials between a minute and 30 minutes, 60 days to 3 years old", () => {
    expect(eligibleForRemake(weak)).toBe(true);
    expect(eligibleForRemake({ ...weak, durationSec: 4500 })).toBe(false); // a podcast episode
    expect(eligibleForRemake({ ...weak, durationSec: 45 })).toBe(false);
    expect(eligibleForRemake({ ...weak, ageDays: 1500 })).toBe(false);
    expect(eligibleForRemake({ ...weak, ageDays: 30 })).toBe(false);
  });
});

describe("scoreCandidate", () => {
  it("adds the demand gap to the underperformance, in doublings", () => {
    expect(scoreCandidate(weak, null)).toBeCloseTo(2, 5); // 0.25x = two doublings short
    const demand = {
      videoId: weak.id,
      query: "q",
      checkedAt: "",
      competitorCount: 5,
      competitorMedianViews: 8000, // 16x our 500 views = 4 doublings
      ownRank: null,
      topResults: [],
    };
    expect(scoreCandidate(weak, demand)).toBeCloseTo(6, 5);
    expect(scoreCandidate(weak, { ...demand, ownRank: 1 })).toBeCloseTo(5, 5);
    expect(scoreCandidate(weak, { ...demand, competitorCount: 3 })).toBeCloseTo(2, 5); // too few to count
  });
});
