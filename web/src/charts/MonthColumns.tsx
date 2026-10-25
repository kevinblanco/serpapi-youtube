import { useState } from "react";
import type { MonthBucket } from "../../../lib/types";
import { formatMonth, formatMultiple } from "../../../lib/format";
import { linear, niceMax, useWidth } from "./scales";

const HEIGHT = 220;
const M = { top: 20, right: 8, bottom: 30, left: 32 };

/** Long-form uploads per month. One series, so no legend: the title names it. */
export function MonthColumns({ months }: { months: MonthBucket[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...months.map((m) => m.uploads)));
  const peak = months.reduce((best, m, i) => (m.uploads > (months[best]?.uploads ?? -1) ? i : best), 0);

  if (!width) return <div className="chart" ref={ref} style={{ height: HEIGHT }} />;

  const band = (width - M.left - M.right) / months.length;
  const barW = Math.min(24, band - 2);
  const y = linear([0, max], [HEIGHT - M.bottom, M.top]);
  const ticks = [0, max / 2, max];

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={HEIGHT} role="img" aria-label="Long-form uploads per month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text className="axis-label" x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = M.left + band * i + band / 2;
          const top = y(m.uploads);
          const h = HEIGHT - M.bottom - top;
          const r = Math.min(4, h);
          return (
            <g key={m.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={cx - band / 2} y={M.top} width={band} height={HEIGHT - M.top - M.bottom} fill="transparent" />
              {m.uploads > 0 && (
                <path
                  d={`M${cx - barW / 2},${HEIGHT - M.bottom} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${HEIGHT - M.bottom} Z`}
                  fill="var(--violet-500)"
                  opacity={hover === null || hover === i ? 1 : 0.5}
                />
              )}
              {i === peak && m.uploads > 0 && (
                <text className="axis-label" x={cx} y={top - 6} textAnchor="middle" style={{ fill: "var(--text-secondary)" }}>
                  {m.uploads}
                </text>
              )}
              {(i % Math.ceil(months.length / 9) === 0 || i === months.length - 1) && (
                <text className="axis-label" x={cx} y={HEIGHT - M.bottom + 18} textAnchor="middle">
                  {formatMonth(m.month)}
                  {m.month.endsWith("-01") || i === 0 ? ` ’${m.month.slice(2, 4)}` : ""}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && months[hover] && (
        <div
          className="tooltip"
          style={{ left: Math.min(M.left + band * hover + band / 2 + 10, width - 200), top: 10 }}
        >
          <strong>
            {formatMonth(months[hover].month)} {months[hover].month.slice(0, 4)}
          </strong>
          <div className="num">{months[hover].uploads} uploads</div>
          <div className="num">Median performance {formatMultiple(months[hover].medianPerformance)}</div>
        </div>
      )}
    </div>
  );
}
