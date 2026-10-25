// Turning YouTube's display strings into numbers and dates.

const DAY_MS = 86_400_000;

/** "1,234 views" -> 1234, "1.2K views" -> 1200, "No views" -> 0. */
export function parseCount(input: number | string | null | undefined): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (!input) return null;
  const text = input.trim().toLowerCase();
  if (/^no\b/.test(text)) return 0;
  const match = text.match(/([\d.,]+)\s*([kmb])?/);
  if (!match) return null;
  const [, digits = "", suffix] = match;
  const multiplier = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : suffix === "b" ? 1e9 : 1;
  // "1.2K" keeps the dot as a decimal; "1,234" drops the comma.
  const value = suffix ? Number(digits.replace(/,/g, ".")) : Number(digits.replace(/[.,]/g, ""));
  return Number.isFinite(value) ? Math.round(value * multiplier) : null;
}

/** "12:34" -> 754, "1:02:03" -> 3723. */
export function parseDuration(input: string | null | undefined): number | null {
  if (!input) return null;
  const parts = input.trim().split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    return null;
  }
  return parts.reduce((total, n) => total * 60 + n, 0);
}

const UNIT_DAYS: Record<string, number> = {
  second: 0,
  minute: 0,
  hour: 0,
  day: 1,
  week: 7,
  month: 30.44,
  year: 365.25,
};

/**
 * "3 months ago" -> estimated age in days.
 * YouTube floors these labels ("1 year ago" covers 12 to 23 months), so the
 * estimate sits in the middle of the range: n + 0.5 units.
 */
export function relativeAgeDays(label: string | null | undefined): number | null {
  if (!label) return null;
  const match = label.toLowerCase().match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = UNIT_DAYS[match[2]!]!;
  if (unit < 1) return 0;
  return Math.round((n + 0.5) * unit);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Absolute dates as the youtube_video engine returns them:
 * "Jan 26, 2017", "Premiered Mar 3, 2024", "Streamed live on Jun 1, 2023".
 * Returns yyyy-mm-dd or null.
 */
export function parseAbsoluteDate(label: string | null | undefined): string | null {
  if (!label) return null;
  const match = label.toLowerCase().match(/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (match) {
    const month = MONTHS.indexOf(match[1]!);
    if (month >= 0) return toIsoDate(Date.UTC(Number(match[3]), month, Number(match[2])));
  }
  const iso = label.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

export function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - Date.parse(fromIso)) / DAY_MS));
}

export function dateDaysBefore(to: Date, days: number): string {
  return toIsoDate(to.getTime() - days * DAY_MS);
}

/** Pulls the 11-character id out of a watch or shorts URL. */
export function videoIdFromLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const match = link.match(/(?:v=|\/shorts\/|youtu\.be\/)([\w-]{11})/);
  return match ? match[1]! : null;
}

export function thumbnailUrl(thumb: { static?: string; rich?: string } | string | null | undefined): string | null {
  if (!thumb) return null;
  if (typeof thumb === "string") return thumb;
  return thumb.static ?? thumb.rich ?? null;
}
