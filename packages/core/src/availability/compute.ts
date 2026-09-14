import { DateTime } from "luxon";
import type { Slot } from "@ar/shared";
import { mergeIntervals, overlapsAny, toMs, type MsInterval } from "./intervals.js";
import type {
  AvailabilityQuery,
  ProviderSchedule,
  TimeOfDayPreference,
  WeeklyHours,
} from "./types.js";

const MINUTE = 60_000;

/** Weekday 0..6 (Sunday = 0) for a luxon DateTime. */
export function weekdaySun0(dt: DateTime): number {
  return dt.weekday % 7;
}

/**
 * Build the UTC working windows for one local calendar day from the weekly template.
 * Hours must be within a single local day (0 <= startMinute < endMinute <= 1440); overnight shifts are not supported.
 */
export function workingWindowsForDay(
  timezone: string,
  isoDate: string,
  hours: WeeklyHours[],
): MsInterval[] {
  const day = DateTime.fromISO(isoDate, { zone: timezone });
  if (!day.isValid) return [];
  const wd = weekdaySun0(day);
  const out: MsInterval[] = [];
  for (const h of hours) {
    if (h.weekday !== wd || h.endMinute <= h.startMinute || h.startMinute < 0 || h.endMinute > 1440) continue;
    const start = localMinuteToInstant(day, h.startMinute);
    const end = localMinuteToInstant(day, h.endMinute);
    if (end > start) out.push({ start, end });
  }
  return mergeIntervals(out);
}

/** Resolve "minutes from local midnight" on a given local day to a UTC ms instant, DST-safe. */
function localMinuteToInstant(day: DateTime, minute: number): number {
  if (minute >= 1440) {
    return day.plus({ days: 1 }).startOf("day").toMillis();
  }
  const dt = day.set({ hour: Math.floor(minute / 60), minute: minute % 60, second: 0, millisecond: 0 });
  return dt.toMillis();
}

function matchesPreference(startMs: number, tz: string, pref: TimeOfDayPreference | undefined): boolean {
  if (!pref || pref === "any") return true;
  const hour = DateTime.fromMillis(startMs, { zone: tz }).hour;
  if (pref === "morning") return hour < 12;
  if (pref === "afternoon") return hour >= 12 && hour < 17;
  return hour >= 17;
}

const MAX_DAYS = 400;

function* localDays(timezone: string, fromDate: string, toDate: string): Generator<DateTime> {
  let d = DateTime.fromISO(fromDate, { zone: timezone }).startOf("day");
  const end = DateTime.fromISO(toDate, { zone: timezone }).startOf("day");
  if (!d.isValid || !end.isValid) return;
  let guard = 0;
  while (d <= end && guard++ < MAX_DAYS) {
    yield d;
    d = d.plus({ days: 1 }).startOf("day");
  }
}

/** First instant >= `fromMs` that sits on the local-clock grid (multiples of `stepMin` from local midnight). */
function alignToLocalGrid(fromMs: number, tz: string, stepMin: number): number {
  const dt = DateTime.fromMillis(fromMs, { zone: tz });
  const minutes = dt.hour * 60 + dt.minute;
  const aligned = Math.ceil(minutes / stepMin) * stepMin;
  if (aligned === minutes && dt.second === 0 && dt.millisecond === 0) return fromMs;
  const day = dt.startOf("day");
  return aligned >= 1440 ? day.plus({ days: 1 }).toMillis() : day.set({ hour: Math.floor(aligned / 60), minute: aligned % 60 }).toMillis();
}

function validate(q: AvailabilityQuery): void {
  if (Number.isNaN(Date.parse(q.now))) throw new Error(`availability: invalid now "${q.now}"`);
  if (!/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(q.now)) throw new Error(`availability: now must be an ISO instant with an offset, got "${q.now}"`);
  if (!Number.isFinite(q.rules.slotGranularityMinutes) || q.rules.slotGranularityMinutes < 5) throw new Error("availability: slotGranularityMinutes must be >= 5");
  if (!Number.isFinite(q.service.durationMinutes) || q.service.durationMinutes < 5) throw new Error("availability: durationMinutes must be >= 5");
  if (q.rules.minLeadMinutes < 0 || q.rules.maxAdvanceDays < 1) throw new Error("availability: invalid rules");
  if (!DateTime.local().setZone(q.timezone).isValid) throw new Error(`availability: invalid timezone "${q.timezone}"`);
}

function slotsForProvider(q: AvailabilityQuery, p: ProviderSchedule): Slot[] {
  const tz = q.timezone;
  const { durationMinutes, bufferBeforeMinutes, bufferAfterMinutes } = q.service;
  const stepMin = q.rules.slotGranularityMinutes;
  const step = stepMin * MINUTE;
  const durMs = durationMinutes * MINUTE;
  const bbMs = bufferBeforeMinutes * MINUTE;
  const baMs = bufferAfterMinutes * MINUTE;

  const nowMs = Date.parse(q.now);
  const earliest = nowMs + q.rules.minLeadMinutes * MINUTE;
  const latest = DateTime.fromMillis(nowMs, { zone: tz })
    .plus({ days: q.rules.maxAdvanceDays })
    .endOf("day")
    .toMillis();

  const busy = mergeIntervals([
    ...p.busy.map(toMs),
    ...p.blocked.map(toMs),
    ...(q.orgBlocked ?? []).map(toMs),
  ]);
  const holidays = new Set(q.holidays);
  const out: Slot[] = [];

  for (const day of localDays(tz, q.fromDate, q.toDate)) {
    const iso = day.toISODate()!;
    if (holidays.has(iso)) continue;
    const windows = workingWindowsForDay(tz, iso, p.weeklyHours);
    const seenLabels = new Set<string>();
    for (const w of windows) {
      let s = alignToLocalGrid(w.start, tz, stepMin);
      for (; s + durMs <= w.end; s += step) {
        if (s < earliest || s + durMs > latest) continue;
        if (!matchesPreference(s, tz, q.preference)) continue;
        if (overlapsAny(busy, s - bbMs, s + durMs + baMs)) continue;
        const label = formatSlotLabel(s, tz);
        // A window spanning a DST fall-back would produce two instants with the same wall-clock label; keep the first.
        if (seenLabels.has(label)) continue;
        seenLabels.add(label);
        out.push({
          start: new Date(s).toISOString(),
          end: new Date(s + durMs).toISOString(),
          providerId: p.providerId,
          providerName: p.providerName,
          label,
        });
      }
    }
  }
  return out;
}

export function formatSlotLabel(startMs: number | string, tz: string, locale = "en"): string {
  const ms = typeof startMs === "string" ? Date.parse(startMs) : startMs;
  return DateTime.fromMillis(ms, { zone: tz }).setLocale(locale).toFormat("ccc d LLL, HH:mm");
}

/**
 * Compute bookable slots. When several providers are given (customer has no preference) the result is
 * deduplicated by start time; for each start the provider with the fewest bookings on that day (counting
 * slots already assigned in this result) wins, ties broken by provider id.
 */
export function computeAvailability(q: AvailabilityQuery): Slot[] {
  validate(q);
  if (q.providers.length === 0) return [];
  if (q.providers.length === 1) return slotsForProvider(q, q.providers[0]);

  const tz = q.timezone;
  const dayOf = (iso: string) => DateTime.fromISO(iso, { zone: tz }).toISODate()!;
  // load[providerId][localDay] = number of busy intervals that day
  const load = new Map<string, Map<string, number>>();
  for (const p of q.providers) {
    const perDay = new Map<string, number>();
    for (const b of p.busy) {
      const d = dayOf(b.start);
      perDay.set(d, (perDay.get(d) ?? 0) + 1);
    }
    load.set(p.providerId, perDay);
  }
  const loadOf = (providerId: string, day: string) => load.get(providerId)?.get(day) ?? 0;

  const candidates = new Map<string, Slot[]>();
  for (const p of q.providers) {
    for (const slot of slotsForProvider(q, p)) {
      const list = candidates.get(slot.start) ?? [];
      list.push(slot);
      candidates.set(slot.start, list);
    }
  }
  const out: Slot[] = [];
  for (const start of [...candidates.keys()].sort()) {
    const day = dayOf(start);
    const options = candidates.get(start)!;
    options.sort((a, b) => loadOf(a.providerId, day) - loadOf(b.providerId, day) || a.providerId.localeCompare(b.providerId));
    const chosen = options[0];
    out.push(chosen);
  }
  return out;
}

/**
 * Pick `n` slots to offer, spread across days so the customer sees variety
 * (one per day first, then a second per day, and so on).
 */
export function chooseSlotsToOffer(slots: Slot[], n: number, tz: string): Slot[] {
  const byDay = new Map<string, Slot[]>();
  for (const s of slots) {
    const day = DateTime.fromISO(s.start, { zone: tz }).toISODate()!;
    const list = byDay.get(day) ?? [];
    list.push(s);
    byDay.set(day, list);
  }
  const days = [...byDay.values()];
  const out: Slot[] = [];
  let round = 0;
  while (out.length < n) {
    let added = false;
    for (const list of days) {
      if (out.length >= n) break;
      const s = list[round];
      if (s) {
        out.push(s);
        added = true;
      }
    }
    if (!added) break;
    round++;
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Busy range for a booking = customer window expanded by the service buffers. Throws on invalid input. */
export function busyRangeFor(
  startAt: string,
  durationMinutes: number,
  bufferBeforeMinutes: number,
  bufferAfterMinutes: number,
): { startAt: string; endAt: string; busyStartAt: string; busyEndAt: string } {
  const s = Date.parse(startAt);
  if (Number.isNaN(s)) throw new Error(`busyRangeFor: invalid startAt "${startAt}"`);
  if (!(durationMinutes >= 5)) throw new Error("busyRangeFor: durationMinutes must be >= 5");
  const e = s + durationMinutes * MINUTE;
  return {
    startAt: new Date(s).toISOString(),
    endAt: new Date(e).toISOString(),
    busyStartAt: new Date(s - Math.max(0, bufferBeforeMinutes) * MINUTE).toISOString(),
    busyEndAt: new Date(e + Math.max(0, bufferAfterMinutes) * MINUTE).toISOString(),
  };
}
