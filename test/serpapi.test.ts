import { describe, expect, it } from "vitest";
import { isEmptyResult, redact } from "../server/serpapi";

const KEY = "0123456789abcdef0123456789abcdef";

describe("redact", () => {
  it("strips the key from nested strings and URLs", () => {
    const value = {
      search_metadata: { json_endpoint: `https://serpapi.com/search.json?engine=youtube&api_key=${KEY}&q=x` },
      note: `key is ${KEY}`,
      list: [`https://serpapi.com/search?api_key=${KEY}`],
    };
    const text = JSON.stringify(redact(value, KEY));
    expect(text).not.toContain(KEY);
    expect(text).toContain("api_key=[redacted]");
  });

  it("drops a top-level api_key field, as the Account API returns", () => {
    const account = redact({ api_key: KEY, plan_name: "Free" }, KEY) as Record<string, unknown>;
    expect(account).not.toHaveProperty("api_key");
    expect(account.plan_name).toBe("Free");
  });

  it("leaves clean values alone", () => {
    const value = { a: 1 };
    expect(redact(value, KEY)).toBe(value);
  });
});

describe("isEmptyResult", () => {
  it("recognises SerpApi's no-results message", () => {
    expect(isEmptyResult("YouTube hasn't returned any results for this query.")).toBe(true);
    expect(isEmptyResult("Invalid API key.")).toBe(false);
  });
});
