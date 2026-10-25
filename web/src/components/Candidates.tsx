import { useState } from "react";
import type { Audit, RemakeCandidate } from "../../../lib/types";
import { formatCount } from "../../../lib/format";
import { api, slugFor } from "../api";
import { PerfChip, Thumb } from "./Tables";

interface Props {
  audit: Audit;
  onAudit: (audit: Audit) => void;
  onSelect: (id: string) => void;
  onBrief: (candidate: RemakeCandidate) => void;
}

export function Candidates({ audit, onAudit, onSelect, onBrief }: Props) {
  if (audit.candidates.length === 0) {
    return (
      <p className="muted">
        No video is both old enough (60 days or more) and below the channel's expected views. Nothing to remake on
        this data.
      </p>
    );
  }
  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      {audit.candidates.map((c, i) => (
        <CandidateCard key={c.videoId} rank={i + 1} candidate={c} audit={audit} onAudit={onAudit} onSelect={onSelect} onBrief={onBrief} />
      ))}
    </div>
  );
}

function CandidateCard({
  rank,
  candidate,
  audit,
  onAudit,
  onSelect,
  onBrief,
}: Props & { rank: number; candidate: RemakeCandidate }) {
  const video = audit.videos.find((v) => v.id === candidate.videoId);
  const [query, setQuery] = useState(candidate.query);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!video) return null;
  const demand = candidate.demand;

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.demand(slugFor(audit), video.id, query);
      onAudit(result.audit);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card stack" style={{ gap: "1.1rem" }}>
      <div className="row" style={{ alignItems: "start", gap: "1.1rem", flexWrap: "nowrap" }}>
        <span className="eyebrow num" style={{ paddingTop: "0.35rem", minWidth: "1.5rem" }}>
          {String(rank).padStart(2, "0")}
        </span>
        <button className="video-row" style={{ padding: 0, flex: 1, alignItems: "start" }} onClick={() => onSelect(video.id)}>
          <Thumb video={video} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="video-title">{video.title}</div>
            <div className="video-meta num">
              {formatCount(video.views)} views · expected {formatCount(video.expectedViews)}
            </div>
          </div>
        </button>
        <div className="stack" style={{ gap: "0.25rem", justifyItems: "end" }}>
          <PerfChip value={video.performance} />
          <span className="faint num" style={{ fontSize: "0.78rem" }} title="Remake score, in doublings. See How this is measured.">
            score {candidate.score.toFixed(1)}
          </span>
        </div>
      </div>

      <ul style={{ margin: 0, paddingLeft: "3.6rem", display: "grid", gap: "0.3rem" }}>
        {candidate.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
        {!demand && <li className="faint">No topic search yet. Edit the query below and run one to compare against other videos.</li>}
      </ul>

      <div className="row" style={{ paddingLeft: "2.6rem" }}>
        <label className="sr-only" htmlFor={`q-${video.id}`}>
          YouTube search query
        </label>
        <input
          id={`q-${video.id}`}
          className="input small"
          style={{ flex: "1 1 260px" }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="button small secondary" onClick={check} disabled={busy || !query.trim()}>
          {busy ? "Searching…" : demand && demand.query === query ? "Search again (1 search)" : "Search YouTube (1 search)"}
        </button>
        <button className="button small" onClick={() => onBrief(candidate)}>
          Draft brief <span className="arrow">→</span>
        </button>
      </div>
      {error && (
        <p className="notice" style={{ marginLeft: "2.6rem" }}>
          {error}
        </p>
      )}

      {demand && demand.topResults.length > 0 && (
        <details style={{ paddingLeft: "2.6rem" }}>
          <summary className="muted" style={{ cursor: "pointer", fontSize: "0.88rem" }}>
            Top results for "{demand.query}"
          </summary>
          <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
            <table>
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Video</th>
                  <th>Channel</th>
                  <th className="num">Views</th>
                  <th>Published</th>
                </tr>
              </thead>
              <tbody>
                {demand.topResults.slice(0, 10).map((r) => (
                  <tr key={`${r.rank}-${r.link}`}>
                    <td className="num faint">{r.rank}</td>
                    <td style={{ maxWidth: 380 }}>
                      <a href={r.link} target="_blank" rel="noreferrer" style={{ color: r.isOwn ? "var(--lilac-300)" : "var(--text)" }}>
                        {r.title}
                      </a>
                    </td>
                    <td className={r.isOwn ? undefined : "muted"}>
                      {r.channel}
                      {r.isOwn ? " (this channel)" : ""}
                    </td>
                    <td className="num">{formatCount(r.views)}</td>
                    <td className="faint">{r.publishedLabel ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </article>
  );
}
