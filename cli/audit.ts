// npm run audit -- @yourchannel --enrich 40 --demand 5
// Same pipeline as the dashboard's "Run audit" button, for the terminal.

import { parseArgs } from "node:util";
import "../server/env";
import { SerpApiClient } from "../server/serpapi";
import { runAudit } from "../server/collect";
import { loadAudit, saveAudit } from "../server/store";
import { DEFAULT_OPTIONS, channelInputError, estimateSearches, normalizeChannel } from "../lib/options";
import { formatCount, formatMultiple } from "../lib/format";
import type { AuditOptions } from "../lib/types";

const USAGE = `Usage: npm run audit -- <channel> [options]

  <channel>        @handle, UC… channel id, or the channel's URL
  --enrich N       videos to look up in detail (default ${DEFAULT_OPTIONS.enrich})
  --demand N       weak videos to check against YouTube search (default ${DEFAULT_OPTIONS.demandChecks})
  --pages N        most pages to read per tab, 30 videos each (default ${DEFAULT_OPTIONS.maxPagesPerTab})
  --videos-only    skip the Shorts and Live tabs
  --refresh        ignore responses saved in data/cache
  --estimate       print the search estimate and stop`;

function fail(message: string): never {
  console.error(`✕ ${message}`);
  process.exit(1);
}

function count(flag: string, value: string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) fail(`--${flag} takes a whole number from 0 to ${max}.`);
  return n;
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      enrich: { type: "string" },
      demand: { type: "string" },
      pages: { type: "string" },
      "videos-only": { type: "boolean" },
      refresh: { type: "boolean" },
      estimate: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
} catch (error) {
  fail(`${(error as Error).message}\n\n${USAGE}`);
}
const { values, positionals } = parsed;
if (values.help || positionals.length === 0) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}
const problem = channelInputError(positionals[0]!);
if (problem) fail(problem);

const options: AuditOptions = {
  ...DEFAULT_OPTIONS,
  channel: normalizeChannel(positionals[0]!),
  enrich: count("enrich", values.enrich, DEFAULT_OPTIONS.enrich, 500),
  demandChecks: count("demand", values.demand, DEFAULT_OPTIONS.demandChecks, 20),
  maxPagesPerTab: Math.max(1, count("pages", values.pages, DEFAULT_OPTIONS.maxPagesPerTab, 50)),
  tabs: values["videos-only"] ? ["video"] : DEFAULT_OPTIONS.tabs,
  refresh: Boolean(values.refresh),
};

try {
  const client = new SerpApiClient({ refresh: options.refresh });
  const account = await client.account();
  console.log(
    `SerpApi plan: ${account.plan_name ?? "?"}, ${account.total_searches_left ?? "?"} searches left this month.`,
  );
  const estimate = estimateSearches(options, null);
  console.log(`This audit will spend about ${estimate} searches (less if cached).`);
  if (account.total_searches_left !== undefined && estimate > account.total_searches_left) {
    console.warn("  ! That's more than you have left. Lower --enrich, --demand or --pages, or add --videos-only.");
  }
  if (values.estimate) process.exit(0);

  const previous = await loadAudit(options.channel);
  const audit = await runAudit(
    options,
    client,
    (event) => {
      if (event.type === "step") console.log(`→ ${event.message}`);
      if (event.type === "warning") console.warn(`  ! ${event.message}`);
      if (event.type === "progress" && event.total && event.done === event.total) console.log(`  ${event.label}: ${event.done}`);
    },
    previous,
  );
  const slug = await saveAudit(audit);

  const { summary, channel } = audit;
  console.log(`\n${channel.title} (${channel.handle ?? channel.query})`);
  console.log(`  ${summary.longFormCount} videos, ${summary.shortsCount} Shorts, ${summary.streamsCount} streams`);
  console.log(`  Median views per video: ${formatCount(summary.medianViews)}`);
  console.log(`  Expected views at 28 days: ${formatCount(summary.expectedViewsAt28Days)}`);
  console.log(`\nRemake shortlist:`);
  for (const c of audit.candidates.slice(0, 5)) {
    const video = audit.videos.find((v) => v.id === c.videoId)!;
    console.log(`  ${formatMultiple(video.performance)}  ${video.title}`);
    for (const reason of c.reasons) console.log(`      ${reason}`);
  }
  console.log(
    `\nSaved data/audits/${slug}.json · ${audit.usage.liveRequests} live searches, ${audit.usage.cachedRequests} from cache.`,
  );
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
