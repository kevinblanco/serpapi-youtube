import { describe, expect, it } from "vitest";
import { runAudit } from "../server/collect";
import { fetchOpening, recheckDemand } from "../server/deep-dive";
import { DEFAULT_OPTIONS, estimateSearches, normalizeChannel } from "../lib/options";
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
  ])("%s -> %s", (input, expected) => {
    expect(normalizeChannel(input)).toBe(expected);
  });
});

describe("runAudit on a synthetic channel", async () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const client = new SyntheticClient(now);
  const events: ProgressEvent[] = [];
  const audit = await runAudit({ channel: "testchannel", enrich: 30, demandChecks: 3 }, client, (e) => events.push(e));

  it("sends the handle without its @ and pages with the channel id", () => {
    expect(client.calls[0]).toMatchObject({ engine: "youtube_channel", channel_id: "testchannel", about: true });
    expect(client.calls[1]).toMatchObject({ tab: "videos", channel_id: "UCtesttesttesttesttest00" });
  });

  it("pages through every tab and keeps formats apart", () => {
    expect(audit.summary.longFormCount).toBe(72);
    expect(audit.summary.shortsCount).toBe(8);
    expect(audit.summary.streamsCount).toBe(0);
    const pages = client.calls.filter((c) => c.engine === "youtube_channel" && c.tab === "videos");
    expect(pages.map((p) => p.next_page_token)).toEqual([undefined, "1", "2"]);
  });

  it("only sorts the first page, since the token carries the sort after that", () => {
    const pages = client.calls.filter((c) => c.engine === "youtube_channel" && c.tab === "videos");
    expect(pages[0]!.sort).toBe("latest");
    expect(pages[1]!.sort).toBeUndefined();
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

  it("reads the opening of a transcript", async () => {
    const opening = await fetchOpening(client, "syn00000005", 30);
    expect(opening.segments).toHaveLength(2);
    expect(opening.wordsInFirst30s).toBe(19); // 7 + 12 words in the first two lines
  });

  it("drafts a brief with data filled in and placeholders left visible", () => {
    const brief = draftBrief(audit, audit.candidates[0]!);
    expect(brief).toMatch(/^# Remake brief: /);
    expect(brief).toContain("| Format | 3840 × 2160, 16:9, 60 fps |");
    expect(brief).toContain("[TO WRITE]");
    expect(brief).toContain("Median views, top");
  });
});
