import { describe, expect, it } from "vitest";
import {
  parseAbsoluteDate,
  parseCount,
  parseDuration,
  relativeAgeDays,
  videoIdFromLink,
} from "../lib/parse";

describe("parseCount", () => {
  it.each([
    ["1,234 views", 1234],
    ["1.2K views", 1200],
    ["3.4M views", 3_400_000],
    ["987 views", 987],
    ["1 view", 1],
    ["No views", 0],
    ["12K watching", 12_000],
  ])("%s -> %d", (input, expected) => {
    expect(parseCount(input)).toBe(expected);
  });

  it("passes numbers through and rejects junk", () => {
    expect(parseCount(5321)).toBe(5321);
    expect(parseCount("views")).toBeNull();
    expect(parseCount(undefined)).toBeNull();
  });
});

describe("parseDuration", () => {
  it("reads m:ss and h:mm:ss", () => {
    expect(parseDuration("12:34")).toBe(754);
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("0:59")).toBe(59);
  });
  it("rejects labels that aren't durations", () => {
    expect(parseDuration("SHORTS")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });
});

describe("relativeAgeDays", () => {
  it("puts the estimate in the middle of YouTube's floored range", () => {
    expect(relativeAgeDays("1 year ago")).toBe(548); // 1.5 years
    expect(relativeAgeDays("3 months ago")).toBe(107);
    expect(relativeAgeDays("2 weeks ago")).toBe(18);
    expect(relativeAgeDays("Streamed 5 days ago")).toBe(6);
  });
  it("treats hours and minutes as today", () => {
    expect(relativeAgeDays("7 hours ago")).toBe(0);
  });
  it("returns null for anything else", () => {
    expect(relativeAgeDays("Jan 26, 2017")).toBeNull();
    expect(relativeAgeDays(null)).toBeNull();
  });
});

describe("parseAbsoluteDate", () => {
  it.each([
    ["Jan 26, 2017", "2017-01-26"],
    ["Premiered Mar 3, 2024", "2024-03-03"],
    ["Streamed live on Jun 1, 2023", "2023-06-01"],
    ["September 9, 2025", "2025-09-09"],
  ])("%s -> %s", (input, expected) => {
    expect(parseAbsoluteDate(input)).toBe(expected);
  });
  it("returns null for relative labels", () => {
    expect(parseAbsoluteDate("2 years ago")).toBeNull();
  });
});

describe("videoIdFromLink", () => {
  it("handles watch, shorts and short links", () => {
    expect(videoIdFromLink("https://www.youtube.com/watch?v=vFcS080VYQ0")).toBe("vFcS080VYQ0");
    expect(videoIdFromLink("https://www.youtube.com/shorts/abcdefghijk")).toBe("abcdefghijk");
    expect(videoIdFromLink("https://youtu.be/vFcS080VYQ0?t=3")).toBe("vFcS080VYQ0");
  });
});
