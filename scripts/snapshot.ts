// npm run snapshot -- serpapi dist/snapshot.html
// npm run snapshot -- serpapi site/index.html --standalone
// Builds the dashboard as one self-contained, read-only HTML file: the saved
// audit, transcripts already in the cache, and thumbnails as data: URIs. It
// spends no searches, and it works where outside images and APIs can't load.
// The default output is a fragment for embedding in a page that supplies the
// document around it; --standalone writes a full page for any static host.

import { parseArgs } from "node:util";
import { build } from "vite";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DATA_DIR, ROOT } from "../server/env";
import { loadAudit } from "../server/store";
import { SerpApiClient } from "../server/serpapi";
import { fetchOpening, type Opening } from "../server/deep-dive";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { standalone: { type: "boolean" } } });
const standalone = Boolean(values.standalone);
const [slug = "serpapi", out = join(ROOT, ...(standalone ? ["site", "index.html"] : ["dist", "snapshot.html"]))] = positionals;
const audit = await loadAudit(slug);
if (!audit) throw new Error(`No saved audit for "${slug}". Run npm run audit -- ${slug} first.`);

// Transcripts fetched earlier are re-read from the cache, so they cost nothing.
const openings: Record<string, Opening> = {};
const transcriptDir = join(DATA_DIR, "cache", "youtube_video_transcript");
for (const file of await readdir(transcriptDir).catch(() => [] as string[])) {
  const { params } = JSON.parse(await readFile(join(transcriptDir, file), "utf8")) as { params: { v?: string } };
  if (params.v && audit.videos.some((v) => v.id === params.v)) {
    openings[params.v] = await fetchOpening(new SerpApiClient(), params.v);
  }
}

const imageDir = join(DATA_DIR, "cache", "images");
await mkdir(imageDir, { recursive: true });

async function dataUri(key: string, url: string): Promise<string | null> {
  const file = join(imageDir, `${key}.json`);
  const cached = await readFile(file, "utf8").catch(() => null);
  if (cached) return JSON.parse(cached) as string;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok) return null;
  const type = res.headers.get("content-type") ?? "image/jpeg";
  const uri = `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  await writeFile(file, JSON.stringify(uri));
  return uri;
}

// Thumbnails for the long-form videos the dashboard shows as images.
const wanted: [string, string][] = audit.videos
  .filter((v) => v.format !== "short")
  .map((v) => [v.id, `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`]);
if (audit.channel.thumbnail) wanted.push(["channel", audit.channel.thumbnail]);
const images: Record<string, string> = {};
for (let i = 0; i < wanted.length; i += 8) {
  await Promise.all(
    wanted.slice(i, i + 8).map(async ([key, url]) => {
      const uri = await dataUri(key, url);
      if (uri) images[key] = uri;
    }),
  );
}

const outDir = join(ROOT, "dist-snapshot");
await build({ configFile: join(ROOT, "vite.config.ts"), base: "./", logLevel: "warn", build: { outDir, emptyOutDir: true } });
const index = await readFile(join(outDir, "index.html"), "utf8");
const asset = (pattern: RegExp) => readFile(join(outDir, index.match(pattern)![1]!), "utf8");
const js = (await asset(/src="\.\/(assets\/[^"]+\.js)"/)).replace(/<\/script/gi, "<\\/script");
const css = await asset(/href="\.\/(assets\/[^"]+\.css)"/);

const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as { repository?: { url?: string } };
const payload = { audit, openings, images, repoUrl: pkg.repository?.url ?? "" };
const name = audit.channel.title.replace(/,?\s+(LLC|Inc\.?|Ltd\.?)$/i, "");
const title = `${name} Channel Audit`;
const description = `${name}'s YouTube channel, every video scored against its own age curve, from SerpApi's YouTube engines.`;
const data = `<script>globalThis.__AUDIT_SNAPSHOT__ = ${JSON.stringify(payload).replace(/</g, "\\u003c")};</script>`;

const attr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Swaps one piece of Vite's index.html, and fails loudly if Vite's output changes shape. */
function swap(html: string, pattern: RegExp | string, replacement: string): string {
  if (!(typeof pattern === "string" ? html.includes(pattern) : pattern.test(html))) {
    throw new Error(`The built index.html no longer contains ${pattern}; update scripts/snapshot.ts.`);
  }
  return html.replace(pattern, () => replacement);
}

// The page Vite built, with its script, styles and the data inlined. It keeps
// Vite's head: charset, viewport, icon and the dashboard's own fonts.
function standalonePage(): string {
  let html = swap(index, /<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`);
  html = swap(
    html,
    /<meta name="description"[^>]*>/,
    [
      `<meta name="description" content="${attr(description)}" />`,
      `<meta property="og:title" content="${attr(title)}" />`,
      `<meta property="og:description" content="${attr(description)}" />`,
    ].join("\n    "),
  );
  html = swap(html, /\s*<script type="module"[^>]*><\/script>/, "");
  html = swap(html, /<link rel="stylesheet" crossorigin href="\.\/assets\/[^"]+\.css">/, `<style>${css}</style>`);
  return swap(html, "</body>", `  ${data}\n    <script type="module">${js}</script>\n  </body>`);
}

// Satoshi's host isn't reachable from every page, so the fragment uses Figtree.
const html = standalone
  ? standalonePage()
  : `<title>${title}</title>
<meta name="description" content="${description}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;700&family=Instrument+Serif:ital@1&display=swap">
<style>${css}
:root{--sans:"Figtree","Satoshi",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}</style>
<div id="root"></div>
${data}
<script type="module">${js}</script>
`;
await mkdir(dirname(out), { recursive: true });
await writeFile(out, html);
console.log(
  `Wrote ${out} (${(html.length / 1e6).toFixed(1)} MB): ${audit.videos.length} videos, ${Object.keys(images).length} images, ${Object.keys(openings).length} transcripts.`,
);
