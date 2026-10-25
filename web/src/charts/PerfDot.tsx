import { formatMultiple } from "../../../lib/format";
import { PERF_COLOR, log, performanceClass } from "./scales";

const W = 132;
const H = 18;
const DOMAIN: [number, number] = [1 / 8, 8];

/** A dot on a ⅛× to 8× log axis with 1× marked, so rows compare at a glance. */
export function PerfDot({ value, compare }: { value: number | null; compare?: number | null }) {
  const x = log(DOMAIN, [6, W - 6]);
  const clampX = (v: number) => x(Math.min(DOMAIN[1], Math.max(DOMAIN[0], v)));
  return (
    <span className="row" style={{ gap: "0.6rem", flexWrap: "nowrap" }}>
      <svg width={W} height={H} aria-hidden="true">
        <line x1={6} x2={W - 6} y1={H / 2} y2={H / 2} stroke="var(--grid)" />
        <line x1={x(1)} x2={x(1)} y1={2} y2={H - 2} stroke="rgba(248,248,252,0.3)" />
        {compare !== null && compare !== undefined && value !== null && (
          <>
            <line x1={clampX(compare)} x2={clampX(value)} y1={H / 2} y2={H / 2} stroke="rgba(248,248,252,0.35)" strokeWidth={2} />
            <circle cx={clampX(compare)} cy={H / 2} r={4} fill="var(--ink-900)" stroke="rgba(248,248,252,0.55)" strokeWidth={1.5} />
          </>
        )}
        {value !== null && (
          <circle
            cx={clampX(value)}
            cy={H / 2}
            r={5}
            fill={PERF_COLOR[performanceClass(value)]}
            stroke="var(--ink-900)"
            strokeWidth={2}
          />
        )}
      </svg>
      <span className="num" style={{ color: "var(--text)", minWidth: "3.2rem" }}>
        {formatMultiple(value)}
      </span>
    </span>
  );
}
