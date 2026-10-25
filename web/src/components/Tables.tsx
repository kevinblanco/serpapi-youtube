import { useMemo, useState } from "react";
import type { GroupStat, ScoredVideo, TitleFeatureStat } from "../../../lib/types";
import { formatAge, formatCount, formatDuration, formatMultiple } from "../../../lib/format";
import { PerfDot } from "../charts/PerfDot";
import { PERF_COLOR, performanceClass } from "../charts/scales";

// A transparent pixel, so a thumbnail that fails to load leaves its tinted box instead of a broken-image icon.
export const BLANK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

export function Thumb({ video, small }: { video: ScoredVideo; small?: boolean }) {
  return (
    <img
      className={small ? "thumb small" : "thumb"}
      src={video.thumbnail ?? `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
      alt=""
      loading="lazy"
      onError={(e) => {
        if (e.currentTarget.src !== BLANK_IMAGE) e.currentTarget.src = BLANK_IMAGE;
      }}
    />
  );
}

export function PerfChip({ value }: { value: number | null }) {
  return (
    <span className="perf-chip">
      <i className="swatch" style={{ background: PERF_COLOR[performanceClass(value)] }} />
      {formatMultiple(value)}
    </span>
  );
}

export function VideoList({ videos, onSelect }: { videos: ScoredVideo[]; onSelect: (id: string) => void }) {
  if (videos.length === 0) return <p className="muted">Nothing here yet.</p>;
  return (
    <div>
      {videos.map((v) => (
        <button key={v.id} className="video-row" onClick={() => onSelect(v.id)}>
          <Thumb video={v} small />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="video-title">{v.title}</div>
            <div className="video-meta num">
              {formatCount(v.views)} views · {formatAge(v.ageDays)} · expected {formatCount(v.expectedViews)}
            </div>
          </div>
          <PerfChip value={v.performance} />
        </button>
      ))}
    </div>
  );
}

export function GroupTable({
  groups,
  firstColumn,
  onPick,
  empty,
  compact,
}: {
  groups: GroupStat[];
  firstColumn: string;
  onPick?: (group: GroupStat) => void;
  empty: string;
  compact?: boolean;
}) {
  const rows = groups.filter((g) => g.count > 0);
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{firstColumn}</th>
            <th className="num">Videos</th>
            <th>Median performance</th>
            <th className="num">Median views</th>
            {!compact && <th className="num">Total views</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key} className={onPick ? "clickable" : undefined} onClick={() => onPick?.(g)}>
              <td style={{ color: "var(--text)", whiteSpace: "nowrap" }}>{g.label}</td>
              <td className="num">{g.count}</td>
              <td>
                <PerfDot value={g.medianPerformance} />
              </td>
              <td className="num">{formatCount(g.medianViews)}</td>
              {!compact && <td className="num">{formatCount(g.totalViews)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TitleFeatureTable({ features }: { features: TitleFeatureStat[] }) {
  const rows = features.filter((f) => f.withCount >= 3 && f.withoutCount >= 3);
  if (rows.length === 0) return <p className="muted">Not enough scored videos to compare title patterns.</p>;
  return (
    <div className="stack">
      <div className="legend">
        <span>
          <svg width="12" height="12" aria-hidden="true">
            <circle cx="6" cy="6" r="4" fill="var(--ink-900)" stroke="rgba(248,248,252,0.55)" strokeWidth="1.5" />
          </svg>
          Titles without the pattern
        </span>
        <span>
          <i className="swatch" style={{ background: "var(--perf-neutral)" }} />
          Titles with it (colored by performance)
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Pattern</th>
              <th className="num">With</th>
              <th className="num">Without</th>
              <th>Median, with vs without</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.key}>
                <td style={{ color: "var(--text)" }}>{f.label}</td>
                <td className="num">{f.withCount}</td>
                <td className="num">{f.withoutCount}</td>
                <td>
                  <span className="row" style={{ gap: "0.4rem", flexWrap: "nowrap" }}>
                    <PerfDot value={f.withMedian} compare={f.withoutMedian} />
                    <span className="faint num" style={{ whiteSpace: "nowrap" }}>
                      vs {formatMultiple(f.withoutMedian)}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ fontSize: "0.82rem" }}>
        These are correlations on one channel's catalogue, not causes. A pattern that shows up mostly in older videos
        can look strong or weak for reasons unrelated to the title.
      </p>
    </div>
  );
}

type SortKey = "title" | "views" | "ageDays" | "performance" | "durationSec" | "likes";

export function VideosTable({ videos, onSelect }: { videos: ScoredVideo[]; onSelect: (id: string) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "performance", dir: -1 });
  const [filter, setFilter] = useState("");
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return videos
      .filter((v) => !q || v.title.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        return (typeof av === "string" ? av.localeCompare(String(bv)) : (av as number) - (bv as number)) * sort.dir;
      });
  }, [videos, sort, filter]);

  const header = (key: SortKey, label: string, num = true) => (
    <th className={num ? "num" : undefined} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : -1 }))}>
        {label}
        {sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  return (
    <div className="stack">
      <input
        className="input small"
        style={{ maxWidth: 320 }}
        placeholder="Filter by title"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Filter videos by title"
      />
      <div className="table-wrap" style={{ maxHeight: 560, overflowY: "auto" }}>
        <table>
          <thead style={{ position: "sticky", top: 0, background: "var(--void)" }}>
            <tr>
              {header("title", "Title", false)}
              <th>Format</th>
              {header("views", "Views")}
              {header("ageDays", "Age")}
              {header("durationSec", "Length")}
              {header("likes", "Likes")}
              {header("performance", "Performance")}
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className="clickable" onClick={() => onSelect(v.id)}>
                <td style={{ color: "var(--text)", maxWidth: 420 }}>{v.title}</td>
                <td className="faint">{v.format === "video" ? "Video" : v.format === "short" ? "Short" : "Live"}</td>
                <td className="num">{formatCount(v.views)}</td>
                <td className="num">
                  {formatAge(v.ageDays)}
                  {v.datePrecision === "relative" ? "*" : ""}
                </td>
                <td className="num">{formatDuration(v.durationSec)}</td>
                <td className="num">{formatCount(v.likes)}</td>
                <td className="num">
                  {v.tooNew ? <span className="faint">too new</span> : <PerfChip value={v.performance} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ fontSize: "0.82rem" }}>
        * Age estimated from YouTube's relative label. Shorts aren't scored against the long-form curve.
      </p>
    </div>
  );
}
