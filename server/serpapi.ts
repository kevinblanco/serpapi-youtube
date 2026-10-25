// A small SerpApi client: one function per call, a disk cache so re-running an
// audit costs nothing, and redaction so the key never lands on disk or in a log.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR, requireApiKey } from "./env";
import type { AccountResponse } from "../lib/serpapi-types";

const ENDPOINT = "https://serpapi.com/search.json";
const ACCOUNT_ENDPOINT = "https://serpapi.com/account.json";
const CACHE_DIR = join(DATA_DIR, "cache");
const TIMEOUT_MS = 90_000;
const RETRIES = 3;

export type Params = Record<string, string | number | boolean | undefined>;

export interface CallStats {
  liveRequests: number;
  cachedRequests: number;
}

/** What the pipeline needs from a client; tests pass a stub. */
export interface SearchClient {
  readonly stats: CallStats;
  search<T extends { error?: string }>(params: Params): Promise<T>;
}

export class SerpApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SerpApiError";
  }
}

/** Removes the key from any string, URL or nested object before it's stored. */
export function redact<T>(value: T, key: string): T {
  if (!key) return value;
  const text = JSON.stringify(value);
  if (!text.includes(key) && !/api_key/.test(text)) return value;
  const cleaned = text.split(key).join("[redacted]").replace(/([?&]api_key=)[^&"\\]+/g, "$1[redacted]");
  const parsed = JSON.parse(cleaned) as T & { api_key?: string };
  if (parsed && typeof parsed === "object" && "api_key" in parsed) delete parsed.api_key;
  return parsed;
}

function cachePath(params: Params): string {
  const stable = Object.keys(params)
    .filter((k) => params[k] !== undefined && k !== "api_key" && k !== "no_cache")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const hash = createHash("sha256").update(stable).digest("hex").slice(0, 24);
  return join(CACHE_DIR, String(params.engine ?? "unknown"), `${hash}.json`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class SerpApiClient implements SearchClient {
  readonly stats: CallStats = { liveRequests: 0, cachedRequests: 0 };

  constructor(
    private readonly options: { refresh?: boolean; apiKey?: string } = {},
  ) {}

  private get key(): string {
    return this.options.apiKey ?? requireApiKey();
  }

  /**
   * GET /search.json. Responses are cached on disk by their parameters. SerpApi
   * also caches identical searches for an hour on its side and doesn't bill
   * those, but our cache lasts until you pass refresh.
   */
  async search<T extends { error?: string }>(params: Params): Promise<T> {
    const file = cachePath(params);
    if (!this.options.refresh) {
      const cached = await readFile(file, "utf8").catch(() => null);
      if (cached) {
        this.stats.cachedRequests++;
        return (JSON.parse(cached) as { response: T }).response;
      }
    }

    const url = new URL(ENDPOINT);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    url.searchParams.set("api_key", this.key);

    const response = await this.fetchJson<T>(url);
    this.stats.liveRequests++;
    // Only successful responses are cached, so a transient failure is retried next run.
    if (!response.error || isEmptyResult(response.error)) {
      const { api_key: _key, ...safeParams } = params;
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(
        file,
        JSON.stringify(redact({ params: safeParams, fetchedAt: new Date().toISOString(), response }, this.key), null, 2),
      );
    }
    return redact(response, this.key);
  }

  /** The Account API is free and doesn't count against the monthly searches. */
  async account(): Promise<Omit<AccountResponse, "account_email">> {
    const url = new URL(ACCOUNT_ENDPOINT);
    url.searchParams.set("api_key", this.key);
    const { account_email: _email, ...rest } = await this.fetchJson<AccountResponse>(url);
    return redact(rest, this.key);
  }

  private async fetchJson<T>(url: URL): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        const body = (await res.json().catch(() => ({}))) as T & { error?: string };
        if (res.ok) return body;
        // 429 and 5xx are worth another try; 401 or a bad parameter is not.
        if (res.status !== 429 && res.status < 500) {
          throw new SerpApiError(redact(body.error ?? `SerpApi answered ${res.status}`, this.key), res.status);
        }
        lastError = new SerpApiError(body.error ?? `SerpApi answered ${res.status}`, res.status);
      } catch (error) {
        if (error instanceof SerpApiError && error.status !== undefined && error.status < 500 && error.status !== 429) {
          throw error;
        }
        lastError = error;
      }
      if (attempt < RETRIES) await sleep(1000 * 2 ** attempt);
    }
    throw new SerpApiError(redact(`SerpApi request failed after ${RETRIES + 1} attempts: ${describe(lastError)}`, this.key));
  }
}

/** fetch() says only "fetch failed"; the cause has the useful part (ENOTFOUND, ECONNRESET...). */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as { code?: string; message?: string } | undefined;
  const detail = cause?.code ?? cause?.message;
  return detail && !error.message.includes(detail) ? `${error.message} (${detail})` : error.message;
}

/** SerpApi reports "no results" as an error string; for us it's an empty page. */
export function isEmptyResult(error: string): boolean {
  return /hasn't returned any results|no results/i.test(error);
}
