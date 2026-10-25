# Channel audit

Audits a YouTube channel with SerpApi's YouTube engines, scores every video against what that channel usually gets at the same age, and shortlists the weak videos worth remaking. The first target is SerpApi's own channel, audited with SerpApi's own API.

It answers four questions:

1. Which videos beat the channel's normal curve, and which fell short of it?
2. Which topics, lengths and title patterns go with the stronger videos?
3. Which weak videos sit on a topic where other creators get far more views? That's the remake shortlist.
4. For the one you pick, what does the brief look like? The dashboard drafts it with the data filled in and the creative parts (ICP, script, visuals) left as visible `[TO WRITE]` placeholders.

## Setup

Needs Node 22 or newer.

```bash
npm install
cp .env.example .env        # paste your key from serpapi.com/manage-api-key
npm run dev                 # API on :8787, dashboard on http://localhost:5173
```

Type a handle (`serpapi`), a `UC…` channel id or a channel URL, pick how many searches to spend, and run. Progress streams into the page as it goes.

The same pipeline runs from the terminal:

```bash
npm run audit -- serpapi --enrich 40 --demand 5
npm run audit -- serpapi --estimate     # print the search cost and stop
```

`npm run build && npm start` serves the built dashboard and the API together on :8787.

## Where SerpApi comes in

| Step | Engine | Searches |
|---|---|---|
| Channel details: subscribers, total views, join date | `youtube_channel` with `about=true` | 1 |
| Every upload, paged with `next_page_token` | `youtube_channel` with `tab=videos`, `shorts`, `streams` | 1 per page |
| Exact publish date, likes, comments, chapters, description | `youtube_video` | 1 per video, you choose how many |
| Topic demand: what ranks for a weak video's subject, and how many views it has | `youtube` (search) | 1 per candidate |
| The first minute of a video, word for word | `youtube_video_transcript` | 1, when you click |

The dashboard shows an estimate before you run and your remaining searches from the Account API, which SerpApi doesn't bill. Every response is cached in `data/cache/`, so running the same audit twice costs nothing the second time. Tick "Skip local cache" (or pass `--refresh`) to fetch fresh numbers.

## How performance is measured

Raw view counts favor old videos, because they've had longer to collect views. So each long-form video is compared with what this channel's videos usually have at the same age:

- The expectation is a straight line through `log(views)` against `log(age in days)`, fitted on regular uploads older than 14 days. It uses the Theil-Sen method (the median of every pairwise slope), so one viral video can't bend the line the way it bends least squares.
- **Performance = views ÷ expected views.** 2× or more is a clear win, 0.5× or less a clear miss. Videos under 14 days old aren't judged yet.
- Shorts and live streams follow different curves, so they stay out of the fit and are reported on their own.

A remake candidate must be at least 60 days old and below 1×. Its score is in doublings: how many times it would need to double to reach its expected views, plus (after a topic search) how many times the median competing video out-views it, capped at 6, minus 1 if it already ranks in the top 3 for that search. You can edit the search query for any candidate before spending a search on it.

Topics come from the titles themselves, not a hand-written list: recurring phrases of one to three words that don't cross a stopword, with the longer phrase kept when it covers most of the shorter one's videos.

## The key stays on the server

- `.env` is gitignored. Only `.env.example` is committed.
- The browser never sees the key: the dashboard talks to the local API, and the API talks to SerpApi.
- The API binds to `127.0.0.1` only, because every request it makes spends your searches.
- The key is stripped from anything written to `data/cache/`, from error messages, and from the Account API response (which echoes it back, along with your email, which is dropped too).

## Limits

- Public data only. Watch time, retention, click-through rate and traffic sources live in YouTube Studio, and the brief lists them as metrics to pull from there.
- Videos you don't look up individually get their age from YouTube's relative label ("2 years ago"), which is coarse. The scatter plot draws those as hollow dots, and the table marks them.
- Views are a snapshot taken at audit time.
- Topic and title results are correlations within one channel's catalogue, not causes.
- A topic search reflects one moment, one country and one language (`gl`, `hl`).

## Project layout

```
lib/       analysis shared by server and dashboard: parsing, the age model, topics, candidates, brief
server/    SerpApi client with cache and redaction, the audit pipeline, the local API (Hono)
cli/       the terminal version of "Run audit"
web/       the dashboard (React, Vite, hand-drawn SVG charts)
test/      unit tests, plus a full pipeline run against a synthetic channel stub
data/      cached responses and saved audits, local only
```

## Tests

```bash
npm test
npm run typecheck
```

The pipeline test runs a complete audit against a stub client that serves a made-up channel in SerpApi's response shapes, so it checks paging, lookups, scoring and the brief without spending a search.
