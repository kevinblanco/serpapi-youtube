import { useMemo, useState } from "react";
import type { AgeModel, ScoredVideo } from "../../../lib/types";
import { formatAge, formatCount, formatMultiple } from "../../../lib/format";
import { PERF_COLOR, PERF_LABEL, log, logTicks, performanceClass, useWidth, type Performance } from "./scales";

const AGE_TICKS: [number, string][] = [
  [7, "1 wk"],
  [30, "1 mo"],
  [90, "3 mo"],
  [180, "6 mo"],
  [365, "1 yr"],
  [730, "2 yr"],
  [1461, "4 yr"],
  [2922, "8 yr"],
];

const HEIGHT = 440;
const M = { top: 16, right: 24, bottom: 40, left: 52 };
const HIT_RADIUS = 28;

interface Props {
  videos: ScoredVideo[];
  model: AgeModel | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Views against age, both on log scales, with the channel's expected curve. */
export function ScatterChart({ videos, model, selectedId, onSelect }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);

  const points = useMemo(
    () => videos.filter((v) => v.format === "video" && v.views && v.views > 0 && v.ageDays !== null && v.ageDays > 0),
    [videos],
  );

  const layout = useMemo(() => {
    if (!width || points.length === 0) return null;
    const ages = points.map((v) => v.ageDays!);
    const views = points.map((v) => v.views!);
    const x = log([Math.max(1, Math.min(...ages) * 0.8), Math.max(...ages) * 1.15], [M.left, width - M.right]);
    const y = log([Math.max(1, Math.min(...views) * 0.6), Math.max(...views) * 1.6], [HEIGHT - M.bottom, M.top]);
    // Videos under 14 days old are still collecting views, so they aren't judged yet.
    const placed = points.map((v) => ({
      video: v,
      cx: x(v.ageDays!),
      cy: y(v.views!),
      perf: v.tooNew ? ("none" as const) : performanceClass(v.performance),
      estimated: v.datePrecision !== "exact",
    }));
    let curve = "";
    if (model) {
      const [a0, a1] = x.domain;
      const steps = 40;
      curve = Array.from({ length: steps + 1 }, (_, i) => {
        const age = a0 * (a1 / a0) ** (i / steps);
        const expected = Math.exp(model.intercept + model.slope * Math.log(age));
        return `${i ? "L" : "M"}${x(age).toFixed(1)},${y(expected).toFixed(1)}`;
      }).join("");
    }
    return { x, y, placed, curve };
  }, [width, points, model]);

  if (points.length === 0) return <p className="muted">No dated long-form videos to plot yet.</p>;

  const hovered = layout?.placed.find((p) => p.video.id === hover) ?? null;

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!layout) return;
    const box = event.currentTarget.getBoundingClientRect();
    const mx = event.clientX - box.left;
    const my = event.clientY - box.top;
    let best: string | null = null;
    let bestDist = HIT_RADIUS ** 2;
    for (const p of layout.placed) {
      const d = (p.cx - mx) ** 2 + (p.cy - my) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = p.video.id;
      }
    }
    setHover(best);
  };

  const counts = { over: 0, neutral: 0, under: 0, none: 0 } as Record<Performance, number>;
  for (const p of layout?.placed ?? []) counts[p.perf]++;
  const estimatedCount = layout?.placed.filter((p) => p.estimated).length ?? 0;

  return (
    <div className="stack">
      <div className="legend" aria-label="Legend">
        {(["over", "neutral", "under"] as const).map((k) => (
          <span key={k}>
            <i className="swatch" style={{ background: PERF_COLOR[k] }} />
            {PERF_LABEL[k]} <span className="faint num">({counts[k]})</span>
          </span>
        ))}
        {counts.none > 0 && (
          <span>
            <i className="swatch" style={{ background: PERF_COLOR.none }} />
            Under 14 days old <span className="faint num">({counts.none})</span>
          </span>
        )}
        {estimatedCount > 0 && (
          <span>
            <svg width="10" height="10" aria-hidden="true">
              <circle cx="5" cy="5" r="3.5" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" />
            </svg>
            Hollow: age estimated <span className="faint num">({estimatedCount})</span>
          </span>
        )}
        {model && (
          <span>
            <svg width="22" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="22" y2="5" stroke="var(--lilac-300)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Expected for its age
          </span>
        )}
      </div>
      <div className="chart" ref={ref}>
        {layout && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Views against age for ${points.length} videos, both on log scales. The table below lists every value.`}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            onClick={() => hover && onSelect(hover)}
            style={{ cursor: hover ? "pointer" : "default" }}
          >
            {logTicks(layout.y.domain, 6).map((t) => (
              <g key={`y${t}`}>
                <line x1={M.left} x2={width - M.right} y1={layout.y(t)} y2={layout.y(t)} stroke="var(--grid)" />
                <text className="axis-label" x={M.left - 10} y={layout.y(t)} textAnchor="end" dominantBaseline="middle">
                  {formatCount(t)}
                </text>
              </g>
            ))}
            {AGE_TICKS.filter(([d]) => d >= layout.x.domain[0] && d <= layout.x.domain[1]).map(([d, label]) => (
              <g key={`x${d}`}>
                <line x1={layout.x(d)} x2={layout.x(d)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--grid)" />
                <text className="axis-label" x={layout.x(d)} y={HEIGHT - M.bottom + 20} textAnchor="middle">
                  {label}
                </text>
              </g>
            ))}
            <text className="axis-label" x={width - M.right} y={HEIGHT - 4} textAnchor="end">
              Age at snapshot →
            </text>
            <text className="axis-label" x={M.left - 44} y={M.top - 4}>
              Views
            </text>

            {layout.curve && (
              <path d={layout.curve} fill="none" stroke="var(--lilac-300)" strokeWidth={2} strokeLinecap="round" opacity={0.85} />
            )}

            {layout.placed.map((p) => {
              const r = p.video.id === hover || p.video.id === selectedId ? 6.5 : 4.5;
              return (
                <g key={p.video.id} opacity={hover && p.video.id !== hover ? 0.55 : 1}>
                  {/* The surface ring keeps overlapping dots apart; hollow dots have estimated ages. */}
                  <circle cx={p.cx} cy={p.cy} r={r + 2} fill="var(--ink-900)" />
                  <circle
                    cx={p.cx}
                    cy={p.cy}
                    r={p.estimated ? r - 0.75 : r}
                    fill={p.estimated ? "var(--ink-900)" : PERF_COLOR[p.perf]}
                    stroke={PERF_COLOR[p.perf]}
                    strokeWidth={p.estimated ? 1.5 : 0}
                  />
                  {p.video.id === selectedId && (
                    <circle cx={p.cx} cy={p.cy} r={r + 3.5} fill="none" stroke="var(--lilac-300)" strokeWidth={1.5} />
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hovered && (
          <div
            className="tooltip"
            style={{
              left: Math.min(hovered.cx + 14, Math.max(0, width - 320)),
              top: Math.max(0, hovered.cy - 90),
            }}
          >
            <strong>{hovered.video.title}</strong>
            <div className="num">
              {formatCount(hovered.video.views)} views at {formatAge(hovered.video.ageDays)}
              {hovered.video.datePrecision === "relative" ? " (estimated age)" : ""}
            </div>
            <div className="num">
              {hovered.video.tooNew
                ? "Under 14 days old, not judged yet"
                : `Expected ${formatCount(hovered.video.expectedViews)} · ${formatMultiple(hovered.video.performance)}`}
            </div>
            <div className="faint">Click for details</div>
          </div>
        )}
      </div>
    </div>
  );
}
