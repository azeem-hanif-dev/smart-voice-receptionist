import { DateTime } from "luxon";
import { API_URL } from "@/lib/api";
import type { Booking, Provider, WeeklyHour } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Types the shared lib does not carry                                         */
/* -------------------------------------------------------------------------- */

/** GET /orgs/:orgId/blocked-times also embeds the provider it belongs to. */
export interface BlockedTimeRow {
  id: string;
  providerId: string | null;
  startAt: string;
  endAt: string;
  reason: string | null;
  provider?: { id: string; name: string } | null;
}

/** The 409 body the API returns when a slot was taken between listing and booking. */
export interface SlotTakenBody {
  reason: string;
  message?: string;
  alternatives?: { start: string; end: string; providerId: string; providerName?: string; label?: string }[];
}

export type CalendarView = "day" | "week";

/* -------------------------------------------------------------------------- */
/* POST helper that keeps the 409 payload                                      */
/* -------------------------------------------------------------------------- */

/**
 * `api.post` throws an ApiError that drops the body, and the booking dialog needs
 * the `alternatives` array out of a 409. This keeps the parsed payload.
 */
export async function postJson<T>(
  path: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; status: number; payload: unknown; message: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, payload: null, message: `Cannot reach the API at ${API_URL}. Is it running?` };
  }
  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (res.ok) return { ok: true, data: payload as T };
  let message = res.statusText || "Request failed";
  if (payload && typeof payload === "object") {
    const m = (payload as { message?: unknown }).message;
    if (typeof m === "string" && m) message = m;
    else if (Array.isArray(m) && m.length) message = m.join(", ");
  } else if (typeof payload === "string" && payload) {
    message = payload;
  }
  return { ok: false, status: res.status, payload, message };
}

export function isSlotTaken(payload: unknown): payload is SlotTakenBody {
  return (
    !!payload &&
    typeof payload === "object" &&
    (payload as { reason?: unknown }).reason === "SLOT_TAKEN"
  );
}

/* -------------------------------------------------------------------------- */
/* Colours                                                                     */
/* -------------------------------------------------------------------------- */

/** Used when a provider has no colour set. Stable per provider index. */
export const FALLBACK_COLORS = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#0891b2", "#db2777", "#65a30d"];

export function providerColor(providerId: string | null | undefined, providers: Provider[]): string {
  if (!providerId) return "#64748b";
  const index = providers.findIndex((p) => p.id === providerId);
  const provider = index >= 0 ? providers[index] : undefined;
  if (provider?.color) return provider.color;
  return FALLBACK_COLORS[(index < 0 ? 0 : index) % FALLBACK_COLORS.length];
}

/** `#2563eb` -> `rgba(37, 99, 235, alpha)`; passes anything else through. */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const int = parseInt(match[1], 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

/* -------------------------------------------------------------------------- */
/* Time helpers (always in the org timezone)                                   */
/* -------------------------------------------------------------------------- */

export const DEFAULT_DAY_START = 8 * 60;
export const DEFAULT_DAY_END = 18 * 60;

export function zoned(iso: string, timezone: string): DateTime {
  return DateTime.fromISO(iso, { zone: timezone });
}

/** Minutes from midnight in the org timezone for an instant. */
export function minuteOfDay(iso: string, timezone: string): number {
  const dt = zoned(iso, timezone);
  return dt.hour * 60 + dt.minute;
}

/** Luxon weekday (1 = Mon .. 7 = Sun) -> the API's weekday (0 = Sun). */
export function apiWeekday(dt: DateTime): number {
  return dt.weekday % 7;
}

export function hoursForWeekday(provider: Provider, weekday: number): WeeklyHour[] {
  return (provider.workingHours ?? []).filter((h) => h.weekday === weekday);
}

/**
 * The vertical extent of the grid: earliest start to latest end across the
 * providers shown, snapped to whole hours, with a sane default when nobody has
 * working hours configured.
 */
export function gridBounds(providers: Provider[]): { startMinute: number; endMinute: number } {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const provider of providers) {
    for (const hour of provider.workingHours ?? []) {
      if (hour.endMinute <= hour.startMinute) continue;
      start = Math.min(start, hour.startMinute);
      end = Math.max(end, hour.endMinute);
    }
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { startMinute: DEFAULT_DAY_START, endMinute: DEFAULT_DAY_END };
  }
  return {
    startMinute: Math.max(0, Math.floor(start / 60) * 60),
    endMinute: Math.min(24 * 60, Math.ceil(end / 60) * 60),
  };
}

/** 570 -> "09:30" */
export function label24(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Monday of the week the given day falls in, in the org timezone. */
export function startOfWeek(day: DateTime): DateTime {
  return day.startOf("week", { useLocaleWeeks: false });
}

/* -------------------------------------------------------------------------- */
/* Overlap layout                                                              */
/* -------------------------------------------------------------------------- */

export interface Positioned<T> {
  item: T;
  startMinute: number;
  endMinute: number;
  /** 0-based lane within a group of overlapping items. */
  lane: number;
  lanes: number;
}

/**
 * Greedy column packing: items that overlap in time share a group and each group
 * is split into as many lanes as its widest overlap.
 */
export function layoutOverlaps<T>(
  items: { item: T; startMinute: number; endMinute: number }[],
): Positioned<T>[] {
  const sorted = [...items].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  const out: Positioned<T>[] = [];
  let group: Positioned<T>[] = [];
  let groupEnd = Number.NEGATIVE_INFINITY;

  const flush = () => {
    if (!group.length) return;
    const lanes = Math.max(...group.map((entry) => entry.lane)) + 1;
    for (const entry of group) entry.lanes = lanes;
    out.push(...group);
    group = [];
    groupEnd = Number.NEGATIVE_INFINITY;
  };

  for (const item of sorted) {
    if (item.startMinute >= groupEnd) flush();
    const laneEnds: number[] = [];
    for (const entry of group) {
      laneEnds[entry.lane] = Math.max(laneEnds[entry.lane] ?? Number.NEGATIVE_INFINITY, entry.endMinute);
    }
    let lane = 0;
    while (laneEnds[lane] !== undefined && laneEnds[lane] > item.startMinute) lane += 1;
    group.push({ item: item.item, startMinute: item.startMinute, endMinute: item.endMinute, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, item.endMinute);
  }
  flush();
  return out;
}

/* -------------------------------------------------------------------------- */
/* Booking display                                                             */
/* -------------------------------------------------------------------------- */

export function bookingTitle(booking: Booking): string {
  return booking.contact.name?.trim() || booking.contact.phoneE164;
}

export const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
};

export type StatusVariant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "muted" | "brand";

/**
 * Status colours, one language across the calendar and the dialogs:
 * confirmed = success, pending = info, cancelled = muted, no-show = warning,
 * completed = brand.
 */
export function statusBadgeVariant(status: string): StatusVariant {
  switch (status) {
    case "COMPLETED":
      return "brand";
    case "CANCELLED":
      return "muted";
    case "NO_SHOW":
      return "warning";
    case "PENDING":
      return "info";
    default:
      return "success";
  }
}
