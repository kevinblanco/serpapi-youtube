// Finds recurring topics in video titles without a hand-written topic list,
// so the same code works on any channel.

const STOPWORDS = new Set(
  `a an and are as at be by can do does for from get how i if in into is it its make
  me my new no not of on or our out step the this to up use using vs what when where
  which who why will with without you your yours via all any more most one two three
  part ep episode video videos guide tutorial tutorials easy simple quick fast best
  ways way full complete minutes minute min explained introduction intro getting started
  api apis data free tips like just now here there let lets let's need want build building`
    .split(/\s+/)
    .filter(Boolean),
);

// Spelling variants that should count as one topic.
const NORMALIZE: Record<string, string> = {
  scraping: "scrape",
  scraper: "scrape",
  scrapers: "scrape",
  scraped: "scrape",
  scrapes: "scrape",
  nodejs: "node.js",
  node: "node.js",
  js: "javascript",
  llms: "llm",
  agents: "agent",
  results: "result",
  reviews: "review",
  images: "image",
  jobs: "job",
  ads: "ad",
};

const MAX_GRAM = 3;

/**
 * Splits a title into runs of meaningful words. A stopword, number or
 * punctuation mark ends a run, so "Google Search results in Python" gives
 * [google, search, result] and [python], never the phrase "result python".
 */
export function phraseRuns(title: string, extraStopwords: ReadonlySet<string> = new Set()): string[][] {
  const runs: string[][] = [[]];
  const words = title
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " | ")
    .replace(/[^\p{L}\p{N}.+#\s-]/gu, " | ")
    .split(/[\s-]+/)
    .map((word) => word.replace(/^\.+|\.+$/g, ""));
  for (const raw of words) {
    const word = NORMALIZE[raw] ?? raw;
    const breaks = word === "|" || word.length < 2 || /^\d+$/.test(word) || STOPWORDS.has(word) || extraStopwords.has(word);
    if (breaks) {
      if (runs.at(-1)!.length) runs.push([]);
    } else {
      runs.at(-1)!.push(word);
    }
  }
  return runs.filter((run) => run.length > 0);
}

export interface Theme {
  key: string;
  label: string;
  videoIds: string[];
}

/**
 * Phrases of one to three words that show up in at least `minCount` titles.
 * A longer phrase replaces the shorter ones inside it when it covers most of
 * their videos ("google maps review" wins over "google maps" and "maps"), and on
 * a big catalogue a word in more than half the titles is dropped as background
 * ("google" on a Google-API channel says nothing about what performs).
 */
export function findThemes(
  videos: readonly { id: string; title: string }[],
  options: { minCount?: number; limit?: number; extraStopwords?: ReadonlySet<string> } = {},
): Theme[] {
  const minCount = options.minCount ?? Math.max(3, Math.round(videos.length * 0.03));
  const limit = options.limit ?? 14;
  const docs = new Map<string, Set<string>>();

  for (const video of videos) {
    const grams = new Set<string>();
    for (const run of phraseRuns(video.title, options.extraStopwords)) {
      for (let n = 1; n <= MAX_GRAM; n++) {
        for (let i = 0; i + n <= run.length; i++) grams.add(run.slice(i, i + n).join(" "));
      }
    }
    for (const gram of grams) {
      if (!docs.has(gram)) docs.set(gram, new Set());
      docs.get(gram)!.add(video.id);
    }
  }

  const background = videos.length >= 20 ? videos.length * 0.5 : Infinity;
  const frequent = [...docs.entries()]
    .filter(([, ids]) => ids.size >= minCount && ids.size <= background)
    .sort((a, b) => b[0].split(" ").length - a[0].split(" ").length);

  const kept: [string, Set<string>][] = [];
  for (const [gram, ids] of frequent) {
    const covered = kept.some(([longer, longerIds]) => ` ${longer} `.includes(` ${gram} `) && longerIds.size >= 0.75 * ids.size);
    if (!covered) kept.push([gram, ids]);
  }

  return kept
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([gram, ids]) => ({ key: gram, label: labelFor(gram), videoIds: [...ids] }));
}

const DISPLAY: Record<string, string> = {
  ai: "AI",
  llm: "LLM",
  mcp: "MCP",
  seo: "SEO",
  serp: "SERP",
  "node.js": "Node.js",
  javascript: "JavaScript",
  typescript: "TypeScript",
  n8n: "n8n",
  php: "PHP",
  json: "JSON",
  csv: "CSV",
  gpt: "GPT",
  chatgpt: "ChatGPT",
  openai: "OpenAI",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  ebay: "eBay",
  google: "Google",
  bing: "Bing",
  amazon: "Amazon",
  python: "Python",
  ruby: "Ruby",
};

export function labelFor(gram: string): string {
  const label = gram
    .split(" ")
    .map((word) => DISPLAY[word] ?? word)
    .join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
