// npm run audit -- serpapi --enrich 40 --demand 5
// Same pipeline as the dashboard's "Run audit" button, for the terminal.

import { parseArgs } from "node:util";
import "../server/env";
import { SerpApiClient } from "../server/serpapi";
import { runAudit } from "../server/collect";
import { loadAudit, saveAudit } from "../server/store";
import { DEFAULT_OPTIONS, estimateSearches, normalizeChannel } from "../lib/options";
import { formatCount, formatMultiple } from "../lib/format";
import type { AuditOptions } from "../lib/types";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    enrich: { type: "string" },
    demand: { type: "string" },
    pages: { type: "string" },
    "videos-only": { type: "boolean" },
    refresh: { type: "boolean" },
    estimate: { type: "boolean" },
  },
});

const options: AuditOptions = {
  ...DEFAULT_OPTIONS,
  channel: normalizeChannel(positionals[0] ?? DEFAULT_OPTIONS.channel),
  enrich: Number(values.enrich ?? DEFAULT_OPTIONS.enrich),
  demandChecks: Number(values.demand ?? DEFAULT_OPTIONS.demandChecks),
  maxPagesPerTab: Number(values.pages ?? DEFAULT_OPTIONS.maxPagesPerTab),
  tabs: values["videos-only"] ? ["video"] : DEFAULT_OPTIONS.tabs,
  refresh: Boolean(values.refresh),
};

const client = new SerpApiClient({ refresh: options.refresh });
const account = await client.account();
console.log(
  `SerpApi plan: ${account.plan_name ?? "?"}, ${account.total_searches_left ?? "?"} searches left this month.`,
);
console.log(`This audit will spend about ${estimateSearches(options, null)} searches (less if cached).`);
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
