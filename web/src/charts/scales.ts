import { useEffect, useRef, useState } from "react";

export type Scale = ((value: number) => number) & { domain: [number, number]; range: [number, number] };

export function linear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return Object.assign((v: number) => r0 + (v - d0) * k, { domain, range });
}

export function log(domain: [number, number], range: [number, number]): Scale {
  const inner = linear([Math.log(domain[0]), Math.log(domain[1])], range);
  return Object.assign((v: number) => inner(Math.log(Math.max(v, 1e-9))), { domain, range });
}

/** 1, 2, 5, 10, 20, 50... inside the domain, thinned to at most `max`. */
export function logTicks([min, max]: [number, number], maxTicks = 7): number[] {
  const ticks: number[] = [];
  for (let p = Math.floor(Math.log10(min)); p <= Math.ceil(Math.log10(max)); p++) {
    for (const m of [1, 2, 5]) {
      const t = m * 10 ** p;
      if (t >= min && t <= max) ticks.push(t);
    }
  }
  if (ticks.length <= maxTicks) return ticks;
  const decades = ticks.filter((t) => Math.log10(t) % 1 === 0);
  return decades.length >= 2 ? decades : ticks.filter((_, i) => i % 2 === 0);
}

export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(value));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= value) return m * p;
  return 10 * p;
}

export type Performance = "over" | "neutral" | "under" | "none";

/** At least double, at most half, or in between what the channel usually gets. */
export function performanceClass(p: number | null | undefined): Performance {
  if (p === null || p === undefined || !Number.isFinite(p)) return "none";
  if (p >= 2) return "over";
  if (p <= 0.5) return "under";
  return "neutral";
}

export const PERF_COLOR: Record<Performance, string> = {
  over: "var(--perf-over)",
  neutral: "var(--perf-neutral)",
  under: "var(--perf-under)",
  none: "#3a3a52",
};

export const PERF_LABEL: Record<Performance, string> = {
  over: "2× expected or more",
  neutral: "Between ½× and 2×",
  under: "½× expected or less",
  none: "Not scored",
};

/** Width of an element, kept current with a ResizeObserver. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
