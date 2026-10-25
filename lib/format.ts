export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${trim(n / 1e9)}B`;
  if (abs >= 1e6) return `${trim(n / 1e6)}M`;
  if (abs >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (abs >= 1e3) return `${trim(n / 1e3)}K`;
  return String(Math.round(n));
}

function trim(x: number): string {
  return x.toFixed(1).replace(/\.0$/, "");
}

export function formatFull(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  return Math.round(n).toLocaleString("en-US");
}

export function formatMultiple(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "–";
  if (x >= 10) return `${Math.round(x)}×`;
  if (x >= 1) return `${x.toFixed(1)}×`;
  return `${x.toFixed(2)}×`;
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "–";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatAge(days: number | null | undefined): string {
  if (days === null || days === undefined) return "–";
  if (days < 1) return "today";
  if (days < 60) return `${days} days`;
  if (days < 730) return `${Math.round(days / 30.44)} months`;
  return `${(days / 365.25).toFixed(1).replace(/\.0$/, "")} years`;
}

export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}
