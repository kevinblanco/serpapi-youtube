import { describe, expect, it } from "vitest";
import { app } from "../server/app";

// Requests as the dashboard sends them, through Vite's proxy or from npm start.
const LOCAL = { host: "localhost:8787" };
const json = { "content-type": "application/json" };

describe("the localhost guard", () => {
  it("answers the dashboard", async () => {
    const res = await app.request("/api/health", { headers: { ...LOCAL, "sec-fetch-site": "same-origin" } });
    expect(res.status).toBe(200);
  });

  it("answers local tools that send no browser headers", async () => {
    for (const host of ["localhost:8787", "127.0.0.1:8787", "[::1]:8787"]) {
      expect((await app.request("/api/health", { headers: { host } })).status).toBe(200);
    }
  });

  it("refuses a foreign Host, as in DNS rebinding", async () => {
    const res = await app.request("/api/audits", { headers: { host: "rebind.example:8787" } });
    expect(res.status).toBe(403);
  });

  it("refuses a cross-site form post that would start an audit", async () => {
    const res = await app.request("/api/audits", {
      method: "POST",
      headers: { ...LOCAL, origin: "https://evil.example", "sec-fetch-site": "cross-site", "content-type": "text/plain" },
      body: JSON.stringify({ channel: "serpapi" }),
    });
    expect(res.status).toBe(403);
  });

  it("refuses another site even when the browser omits Sec-Fetch-Site", async () => {
    const res = await app.request("/api/audits", {
      method: "POST",
      headers: { ...LOCAL, ...json, origin: "https://evil.example" },
      body: JSON.stringify({ channel: "serpapi" }),
    });
    expect(res.status).toBe(403);
  });

  it("refuses another app on a different localhost port", async () => {
    const res = await app.request("/api/health", { headers: { ...LOCAL, "sec-fetch-site": "same-site" } });
    expect(res.status).toBe(403);
  });

  it("refuses writes that aren't JSON", async () => {
    const res = await app.request("/api/audits", { method: "POST", headers: { ...LOCAL, "content-type": "text/plain" }, body: "{}" });
    expect(res.status).toBe(415);
  });

  it("no longer reads transcripts on GET, so a link or an <img> can't spend a search", async () => {
    const res = await app.request("/api/videos/dQw4w9WgXcQ/opening", { headers: LOCAL });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/audits", () => {
  it("rejects a channel it can't look up before spending anything", async () => {
    const res = await app.request("/api/audits", {
      method: "POST",
      headers: { ...LOCAL, ...json, origin: "http://localhost:5173", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ channel: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/link to a video/);
  });
});
