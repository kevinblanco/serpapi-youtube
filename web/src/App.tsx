import { useCallback, useEffect, useMemo, useState } from "react";
import type { Audit, RemakeCandidate } from "../../lib/types";
import { formatCount, formatMultiple } from "../../lib/format";
import { api, slugFor, type Opening, type SavedAudit } from "./api";
import { RunPanel } from "./components/RunPanel";
import { ChannelHeader, StatTiles } from "./components/Overview";
import { GroupTable, TitleFeatureTable, VideoList, VideosTable } from "./components/Tables";
import { Candidates } from "./components/Candidates";
import { VideoPanel } from "./components/VideoPanel";
import { BriefModal } from "./components/BriefModal";
import { ScatterChart } from "./charts/ScatterChart";
import { MonthColumns } from "./charts/MonthColumns";

export function App() {
  const [saved, setSaved] = useState<SavedAudit[]>([]);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [briefFor, setBriefFor] = useState<RemakeCandidate | null>(null);
  const [openings, setOpenings] = useState<Record<string, Opening>>({});

  useEffect(() => {
    api.health().then((h) => setHasKey(h.hasKey)).catch(() => setLoadError("The API server isn't running. Start it with npm run dev."));
    api
      .audits()
      .then(async (list) => {
        setSaved(list);
        if (list[0]) setAudit(await api.audit(list[0].slug));
      })
      .catch(() => {});
  }, []);

  const onDone = useCallback((next: Audit) => {
    setAudit(next);
    setOpenings({});
    api.audits().then(setSaved).catch(() => {});
  }, []);

  const switchTo = async (slug: string) => {
    setAudit(await api.audit(slug));
    setOpenings({});
  };

  const leaders = useMemo(() => {
    if (!audit) return { top: [], bottom: [] };
    const scored = audit.videos.filter((v) => v.format === "video" && v.performance !== null && !v.tooNew);
    const sorted = scored.slice().sort((a, b) => b.performance! - a.performance!);
    return { top: sorted.slice(0, 6), bottom: sorted.slice(-6).reverse() };
  }, [audit]);

  const closePanel = useCallback(() => setSelected(null), []);
  const closeBrief = useCallback(() => setBriefFor(null), []);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brandmark">
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#4c2180" />
            <circle cx="11" cy="20" r="3" fill="#dcc3ff" />
            <circle cx="17" cy="14" r="3" fill="#dcc3ff" />
            <circle cx="23" cy="9" r="3" fill="#f3f3f3" />
          </svg>
          Channel audit
          <span className="faint" style={{ fontWeight: 400 }}>
            · built on SerpApi
          </span>
        </div>
        {saved.length > 1 && (
          <label className="row" style={{ gap: "0.5rem", fontSize: "0.85rem" }}>
            <span className="faint">Saved audits</span>
            <select
              className="select"
              style={{ height: 36 }}
              value={audit ? slugFor(audit) : ""}
              onChange={(e) => switchTo(e.target.value)}
            >
              {saved.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {loadError && <p className="notice" style={{ marginTop: "1.5rem" }}>{loadError}</p>}
      {!hasKey && (
        <p className="notice" style={{ marginTop: "1.5rem" }}>
          No SerpApi key found. Copy <span className="mono">.env.example</span> to <span className="mono">.env</span>, add
          your key, and restart the server.
        </p>
      )}

      {audit ? (
        <>
          <section className="section" style={{ marginTop: "3rem" }}>
            <ChannelHeader audit={audit} />
          </section>

          <section className="section" style={{ marginTop: "2.5rem" }}>
            <StatTiles audit={audit} />
          </section>

          <section className="section">
            <div className="section-head">
              <div>
                <span className="eyebrow">Views against age</span>
                <h2>
                  What <span className="serif">performs</span>, adjusted for age
                </h2>
                <p>
                  Older videos have had longer to collect views, so raw view counts flatter the back catalogue. The line is
                  what this channel's videos usually have at each age; every dot is a video, colored by how far it lands
                  from that line.
                </p>
              </div>
            </div>
            <div className="card">
              <ScatterChart videos={audit.videos} model={audit.model} selectedId={selected} onSelect={setSelected} />
            </div>
          </section>

          <section className="section grid-2">
            <div className="card">
              <h3>Beat the curve</h3>
              <p className="muted" style={{ fontSize: "0.88rem", marginBottom: "0.75rem" }}>
                Most views relative to their age.
              </p>
              <VideoList videos={leaders.top} onSelect={setSelected} />
            </div>
            <div className="card">
              <h3>Fell short</h3>
              <p className="muted" style={{ fontSize: "0.88rem", marginBottom: "0.75rem" }}>
                Fewest views relative to their age, excluding videos under 14 days old.
              </p>
              <VideoList videos={leaders.bottom} onSelect={setSelected} />
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <div>
                <span className="eyebrow">Topics</span>
                <h2>
                  Which subjects <span className="serif">pull</span>
                </h2>
                <p>
                  Words and pairs of words that recur in titles, found from the titles themselves. The dot shows the median
                  performance of the videos on that topic, on a scale from ⅛× to 8× with 1× marked.
                </p>
              </div>
            </div>
            <div className="card">
              <GroupTable groups={audit.themes} firstColumn="Topic" empty="No topic repeats often enough to compare." />
            </div>
          </section>

          <section className="section grid-2">
            <div className="card stack">
              <div>
                <span className="eyebrow">Length</span>
                <h3 style={{ marginTop: "0.6rem" }}>Performance by video length</h3>
              </div>
              <GroupTable groups={audit.durations} firstColumn="Length" empty="No durations available." compact />
            </div>
            <div className="card stack">
              <div>
                <span className="eyebrow">Titles</span>
                <h3 style={{ marginTop: "0.6rem" }}>Title patterns</h3>
              </div>
              <TitleFeatureTable features={audit.titleFeatures} />
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <div>
                <span className="eyebrow">Cadence</span>
                <h2>
                  Upload <span className="serif">rhythm</span>
                </h2>
                <p>Long-form uploads per month over the last 18 months. Hover a month for its median performance.</p>
              </div>
            </div>
            <div className="card">
              <MonthColumns months={audit.months} />
            </div>
          </section>

          <section className="section">
            <div className="section-head">
              <div>
                <span className="eyebrow">Remake shortlist</span>
                <h2>
                  What to <span className="serif">remake</span>
                </h2>
                <p>
                  Videos at least 60 days old that fell below the curve, ranked by how far below it they landed and, after a
                  topic search, how many more views other videos get on the same subject.
                </p>
              </div>
            </div>
            <Candidates audit={audit} onAudit={setAudit} onSelect={setSelected} onBrief={setBriefFor} />
          </section>

          <section className="section">
            <div className="section-head">
              <div>
                <span className="eyebrow">Every video</span>
                <h2>The full table</h2>
                <p>Every value from the charts above, sortable. Click a row for details.</p>
              </div>
            </div>
            <div className="card">
              <VideosTable videos={audit.videos} onSelect={setSelected} />
            </div>
          </section>

          <section className="section grid-2" style={{ alignItems: "start" }}>
            <div className="stack">
              <span className="eyebrow">Method</span>
              <h2>
                How this is <span className="serif">measured</span>
              </h2>
            </div>
            <div className="stack muted" style={{ fontSize: "0.92rem" }}>
              <p>
                Each long-form video's views are compared with what this channel's videos usually have at the same age. That
                expectation is a straight line through log(views) against log(age), fitted with the Theil-Sen method (the
                median of every pairwise slope) so one viral video can't bend it. Fitted on {audit.model?.sampleSize ?? 0}{" "}
                videos older than {audit.model?.minAgeDays ?? 14} days
                {audit.model ? `. On this channel, ${ageEffect(audit.model.slope)}` : ""}.
              </p>
              <p>
                Performance is views ÷ expected. Double or more is a clear win, half or less a clear miss, and videos under 14
                days old aren't judged yet. A remake candidate's score adds how many doublings it is short of expected to how many doublings the
                median competing video on its topic is ahead, capped at 6, minus 1 if it already ranks in the top 3.
              </p>
              {audit.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
              <p className="faint">
                {audit.usage.liveRequests} live SerpApi searches and {audit.usage.cachedRequests} cached responses went into this
                audit. Engines: youtube_channel, youtube_video, youtube, and youtube_video_transcript on demand.
              </p>
            </div>
          </section>

          {selected && (
            <VideoPanel
              audit={audit}
              videoId={selected}
              opening={openings[selected] ?? null}
              onOpening={(o) => setOpenings((all) => ({ ...all, [o.videoId]: o }))}
              onClose={closePanel}
            />
          )}
          {briefFor && (
            <BriefModal audit={audit} candidate={briefFor} opening={openings[briefFor.videoId] ?? null} onClose={closeBrief} />
          )}
        </>
      ) : (
        <section className="section" style={{ marginTop: "3rem" }}>
          <div className="stack" style={{ gap: "0.9rem", maxWidth: "44rem", marginBottom: "2rem" }}>
            <span className="eyebrow">Channel audit</span>
            <h1>
              Find what <span className="serif">works</span> on a YouTube channel
            </h1>
            <p className="muted">
              Lists every video with SerpApi's YouTube Channel API, scores each one against the channel's own age curve,
              and shortlists the weak videos worth remaking.
            </p>
          </div>
        </section>
      )}

      <section className="section" style={{ marginTop: audit ? "4.5rem" : 0 }}>
        <RunPanel key={audit?.createdAt ?? "new"} current={audit} onDone={onDone} />
      </section>

      <footer className="faint" style={{ marginTop: "4rem", fontSize: "0.8rem" }}>
        Data from SerpApi's YouTube engines. Views at {audit ? new Date(audit.createdAt).toLocaleString("en-US") : "snapshot time"};{" "}
        {audit ? `${formatCount(audit.videos.length)} videos.` : ""}
      </footer>
    </div>
  );
}

/** views ∝ age^b, so doubling a video's age multiplies its expected views by 2^b. */
function ageEffect(slope: number): string {
  if (Math.abs(slope) < 0.05) return "a video's age barely changes how many views it has";
  return `a video twice as old usually has ${formatMultiple(2 ** slope)} the views`;
}
