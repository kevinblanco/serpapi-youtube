import { describe, expect, it } from "vitest";
import { runAudit } from "../server/collect";
import { fetchOpening, recheckDemand } from "../server/deep-dive";
import { DEFAULT_OPTIONS, channelInputError, estimateSearches, normalizeChannel } from "../lib/options";
import { draftBrief } from "../lib/brief";
import type { ProgressEvent } from "../lib/types";
import { SyntheticClient } from "./fixtures/synthetic-channel";

describe("normalizeChannel", () => {
  it.each([
    ["serpapi", "serpapi"],
    ["@serpapi", "serpapi"],
    [" https://www.youtube.com/@serpapi/videos ", "serpapi"],
    ["https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv", "UCabcdefghijklmnopqrstuv"],
    ["UCabcdefghijklmnopqrstuv", "UCabcdefghijklmnopqrstuv"],
    ["https://www.youtube.com/@serpapi?si=abc", "serpapi"],
    ["https://www.youtube.com/@%E3%83%86%E3%82%B9%E3%83%88", "テスト"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeChannel(input)).toBe(expected);
  });
});

describe("channelInputError", () => {
  it.each(["serpapi", "@serpapi", "@some.channel-name_1", "テスト", "https://www.youtube.com/@serpapi/videos", "UCabcdefghijklmnopqrstuv"])(
    "accepts %s",
    (input) => expect(channelInputError(input)).toBeNull(),
  );

  it.each([
    ["", /Enter a channel/],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", /link to a video/],
    ["https://youtu.be/dQw4w9WgXcQ", /link to a video/],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", /link to a video/],
    ["https://www.youtube.com/c/SerpApi", /\/c\/ and \/user\//],
    ["https://www.youtube.com/user/someone", /\/c\/ and \/user\//],
    ["ab", /doesn't look like/],
    ["two words", /doesn't look like/],
    ["serpapi&tab=videos", /doesn't look like/],
  ])("rejects %j", (input, message) => {
    expect(channelInputError(input)).toMatch(message);
  });
});

describe("runAudit on a synthetic channel", async () => {
  // Midnight UTC, so a date-only publish label and the snapshot are whole days apart.
  const now = new Date("2026-10-25T00:00:00Z");
  const client = new SyntheticClient(now);
  const events: ProgressEvent[] = [];
  const audit = await runAudit({ channel: "testchannel", enrich: 30, demandChecks: 3 }, client, (e) => events.push(e), null, now);

  it("sends the handle without its @", () => {
    expect(client.calls[0]).toMatchObject({ engine: "youtube_channel", channel_id: "testchannel", about: true });
  });

  it("uses the about response as page 1 and follows SerpApi's next links after it", () => {
    expect(audit.summary.longFormCount).toBe(72);
    const videoPages = client.calls.filter((c) => c.engine === "youtube_channel" && (c.about || (c.next_page_token && !c.tab)));
    expect(videoPages.map((p) => p.next_page_token)).toEqual([undefined, "1", "2"]);
    expect(videoPages.every((p) => p.tab === undefined)).toBe(true);
    expect(videoPages.slice(1).every((p) => !("about" in p))).toBe(true);
    expect(client.calls.some((c) => "sort" in c)).toBe(false);
  });

  it("keeps formats apart and explains an empty tab", () => {
    expect(audit.summary.shortsCount).toBe(8);
    expect(audit.summary.streamsCount).toBe(0);
    expect(events).toContainEqual({ type: "step", message: "streams tab: This channel doesn't have any streams" });
  });

  it("swaps relative dates for exact ones on looked-up videos", () => {
    const enriched = audit.videos.filter((v) => v.enriched);
    expect(enriched.length).toBeGreaterThanOrEqual(30);
    expect(enriched.every((v) => v.datePrecision === "exact")).toBe(true);
    const first = audit.videos.find((v) => v.id === "syn00000000")!;
    expect(first.ageDays).toBe(client.videos[0]!.ageDays);
  });

  it("fits a curve and scores long-form videos only", () => {
    expect(audit.model?.method).toBe("theil-sen");
    expect(audit.videos.filter((v) => v.format === "short").every((v) => v.performance === null)).toBe(true);
    expect(audit.videos.filter((v) => v.format === "video" && !v.tooNew).every((v) => v.performance !== null)).toBe(true);
  });

  it("runs topic searches for the top candidates and leaves the rest unchecked", () => {
    const searches = client.calls.filter((c) => c.engine === "youtube");
    expect(searches).toHaveLength(3);
    expect(audit.candidates.filter((c) => c.demand)).toHaveLength(3);
    expect(audit.candidates.length).toBeGreaterThan(3);
    for (const c of audit.candidates) {
      const v = audit.videos.find((x) => x.id === c.videoId)!;
      expect(v.performance!).toBeLessThan(1);
      expect(v.ageDays!).toBeGreaterThanOrEqual(60);
      expect(c.query).not.toMatch(/test channel/i);
    }
  });

  it("stays inside its own estimate", () => {
    const options = { ...DEFAULT_OPTIONS, enrich: 30, demandChecks: 3 };
    expect(client.stats.liveRequests).toBeLessThanOrEqual(estimateSearches(options, 80));
    expect(audit.usage.liveRequests).toBe(client.stats.liveRequests);
  });

  it("reports progress and no warnings", () => {
    expect(events.some((e) => e.type === "step")).toBe(true);
    expect(events.filter((e) => e.type === "warning")).toEqual([]);
  });

  it("re-ranks after a manual topic search", async () => {
    const target = audit.candidates.at(-1)!;
    const { audit: next, candidate } = await recheckDemand(client, audit, target.videoId, "google maps reviews");
    expect(candidate.demand?.query).toBe("google maps reviews");
    expect(next.candidates.find((c) => c.videoId === target.videoId)?.demand).not.toBeNull();
  });

  it("keeps a query edited in the previous audit", async () => {
    const target = audit.candidates.at(-1)!;
    const { audit: edited } = await recheckDemand(client, audit, target.videoId, "my edited query");
    const rerun = await runAudit({ channel: "testchannel", enrich: 30, demandChecks: 3 }, new SyntheticClient(now), () => {}, edited, now);
    expect(rerun.candidates.find((c) => c.videoId === target.videoId)?.demand?.query).toBe("my edited query");
  });

  it("reads the opening of a transcript", async () => {
    const opening = await fetchOpening(client, "syn00000005", 30);
    expect(opening.segments).toHaveLength(2);
    expect(opening.wordsInFirst30s).toBe(19); // 7 + 12 words in the first two lines
  });

  it("drafts a brief with data filled in and placeholders left visible", () => {
    const brief = draftBrief(audit, audit.candidates[0]!);
    expect(brief).toMatch(/^# Remake brief: /);
    expect(brief).toContain("| Format | [TO WRITE: resolution, aspect ratio, frame rate] |");
    expect(brief).toContain("Drafted from an audit of Test Channel");
    expect(brief).toContain("[TO WRITE]");
    expect(brief).toContain("Median views, top");
  });
});
