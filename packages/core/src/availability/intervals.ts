import type { UtcInterval } from "./types.js";

interface MsInterval {
  start: number;
  end: number;
}

export function toMs(i: UtcInterval): MsInterval {
  return { start: Date.parse(i.start), end: Date.parse(i.end) };
}

/** Sort and merge overlapping or touching intervals. */
export function mergeIntervals(intervals: MsInterval[]): MsInterval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .slice()
    .sort((a, b) => a.start - b.start);
  const out: MsInterval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** True if [start, end) overlaps any interval in the merged, sorted list. Binary search on start. */
export function overlapsAny(sorted: MsInterval[], start: number, end: number): boolean {
  let lo = 0;
  let hi = sorted.length - 1;
  // find last interval whose start < end
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].start < end) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx < 0) return false;
  return sorted[idx].end > start;
}

/** Subtract busy intervals from free windows. Both lists are ms intervals; busy must be merged and sorted. */
export function subtractIntervals(free: MsInterval[], busy: MsInterval[]): MsInterval[] {
  const out: MsInterval[] = [];
  for (const f of free) {
    let cursor = f.start;
    for (const b of busy) {
      if (b.end <= cursor) continue;
      if (b.start >= f.end) break;
      if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, f.end) });
      cursor = Math.max(cursor, b.end);
      if (cursor >= f.end) break;
    }
    if (cursor < f.end) out.push({ start: cursor, end: f.end });
  }
  return out;
}

export type { MsInterval };
