export function median(values: readonly number[]): number | null {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Theil-Sen line: the median of every pairwise slope, then the median intercept.
 * One viral video can't drag it the way it drags least squares, which matters
 * on a channel where a single hit can have 50x the views of its neighbours.
 */
export function theilSen(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const slopes: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = xs[j]! - xs[i]!;
      if (Math.abs(dx) > 1e-9) slopes.push((ys[j]! - ys[i]!) / dx);
    }
  }
  const slope = median(slopes);
  if (slope === null) return null;
  const intercept = median(ys.slice(0, n).map((y, i) => y - slope * xs[i]!));
  return intercept === null ? null : { slope, intercept };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
