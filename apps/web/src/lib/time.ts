import { DateTime } from "luxon";
import type { WeeklyHour } from "./types";

/** Weekday 0 = Sunday, matching the availability engine and the vertical packs. */
export const WEEKDAYS = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
] as const;

export const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

/** The browser's IANA zone, falling back to a zone we know is in the list. */
export function browserTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) return zone;
  } catch {
    /* ignore */
  }
  return "America/New_York";
}

/** Adds a zone to the picker list if the browser or org uses something unusual. */
export function timezoneOptions(...extra: (string | undefined | null)[]): string[] {
  const zones = [...COMMON_TIMEZONES];
  for (const zone of extra) {
    if (zone && !zones.includes(zone)) zones.unshift(zone);
  }
  return zones;
}

/** 570 -> "09:30" */
export function minutesToTime(minutes: number): string {
  const safe = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "09:30" -> 570. Returns null when unparseable. */
export function timeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (Number.isNaN(h) || Number.isNaN(m) || h > 24 || m > 59) return null;
  return Math.min(24 * 60, h * 60 + m);
}

/** Vertical packs ship `[weekday, start, end]` tuples; the API stores objects. */
export function normalizeWeeklyHours(
  input: unknown,
): WeeklyHour[] {
  if (!Array.isArray(input)) return [];
  const hours: WeeklyHour[] = [];
  for (const entry of input) {
    if (Array.isArray(entry) && entry.length >= 3) {
      hours.push({ weekday: Number(entry[0]), startMinute: Number(entry[1]), endMinute: Number(entry[2]) });
    } else if (entry && typeof entry === "object") {
      const row = entry as Partial<WeeklyHour>;
      if (typeof row.weekday === "number") {
        hours.push({
          weekday: row.weekday,
          startMinute: Number(row.startMinute ?? 540),
          endMinute: Number(row.endMinute ?? 1020),
        });
      }
    }
  }
  return hours.sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
}

export const DEFAULT_BUSINESS_HOURS: WeeklyHour[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));

/* Formatting -------------------------------------------------------------- */

export function formatDateTime(iso: string, timezone?: string): string {
  const dt = DateTime.fromISO(iso, timezone ? { zone: timezone } : undefined);
  return dt.isValid ? dt.toFormat("ccc d LLL, HH:mm") : iso;
}

export function formatDate(iso: string, timezone?: string): string {
  const dt = DateTime.fromISO(iso, timezone ? { zone: timezone } : undefined);
  return dt.isValid ? dt.toFormat("d LLL yyyy") : iso;
}

export function formatTime(iso: string, timezone?: string): string {
  const dt = DateTime.fromISO(iso, timezone ? { zone: timezone } : undefined);
  return dt.isValid ? dt.toFormat("HH:mm") : iso;
}

/** "3 minutes ago" style label for inbox/contact lists. */
export function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const dt = DateTime.fromISO(iso);
  return dt.isValid ? (dt.toRelative() ?? "") : "";
}

export function formatPrice(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined) return "";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return (cents / 100).toFixed(2);
  }
}

/** "$120.00" back to 12000; empty string means "no price". */
export function priceToCents(value: string): number | null {
  const trimmed = value.replace(/[^0-9.]/g, "").trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}
