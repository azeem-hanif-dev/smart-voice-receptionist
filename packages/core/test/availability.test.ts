import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  busyRangeFor,
  chooseSlotsToOffer,
  computeAvailability,
  mergeIntervals,
  subtractIntervals,
  workingWindowsForDay,
  type AvailabilityQuery,
  type ProviderSchedule,
} from "../src/index.js";

const NINE_TO_FIVE_WEEKDAYS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1020 }));

function provider(id: string, over: Partial<ProviderSchedule> = {}): ProviderSchedule {
  return { providerId: id, providerName: id, weeklyHours: NINE_TO_FIVE_WEEKDAYS, blocked: [], busy: [], ...over };
}

function query(over: Partial<AvailabilityQuery> = {}): AvailabilityQuery {
  return {
    timezone: "America/New_York",
    now: "2026-09-01T12:00:00.000Z",
    fromDate: "2026-09-08",
    toDate: "2026-09-08",
    holidays: [],
    service: { durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
    rules: { minLeadMinutes: 0, maxAdvanceDays: 60, slotGranularityMinutes: 30 },
    providers: [provider("A")],
    ...over,
  };
}

const local = (iso: string, tz: string) => DateTime.fromISO(iso, { zone: tz }).toFormat("yyyy-MM-dd HH:mm");

describe("interval helpers", () => {
  it("merges overlapping and touching intervals", () => {
    expect(mergeIntervals([{ start: 0, end: 10 }, { start: 5, end: 20 }, { start: 20, end: 30 }, { start: 40, end: 50 }]))
      .toEqual([{ start: 0, end: 30 }, { start: 40, end: 50 }]);
  });
  it("subtracts busy from free", () => {
    expect(subtractIntervals([{ start: 0, end: 100 }], [{ start: 10, end: 20 }, { start: 50, end: 120 }]))
      .toEqual([{ start: 0, end: 10 }, { start: 20, end: 50 }]);
  });
});

describe("working windows across DST", () => {
  it("America/New_York spring forward: 09:00 local is 14:00Z before and 13:00Z after", () => {
    const hours = [{ weekday: 6, startMinute: 540, endMinute: 1020 }, { weekday: 0, startMinute: 540, endMinute: 1020 }];
    const before = workingWindowsForDay("America/New_York", "2026-03-07", hours); // Saturday, EST
    const after = workingWindowsForDay("America/New_York", "2026-03-08", hours); // Sunday, DST starts 02:00
    expect(new Date(before[0].start).toISOString()).toBe("2026-03-07T14:00:00.000Z");
    expect(new Date(after[0].start).toISOString()).toBe("2026-03-08T13:00:00.000Z");
    // both days still have an 8-hour working window on the local clock
    expect((before[0].end - before[0].start) / 3_600_000).toBe(8);
    expect((after[0].end - after[0].start) / 3_600_000).toBe(8);
  });

  it("Europe/London fall back: 09:00 local is 08:00Z before and 09:00Z after", () => {
    const hours = [{ weekday: 6, startMinute: 540, endMinute: 1020 }, { weekday: 0, startMinute: 540, endMinute: 1020 }];
    const before = workingWindowsForDay("Europe/London", "2026-10-24", hours);
    const after = workingWindowsForDay("Europe/London", "2026-10-25", hours);
    expect(new Date(before[0].start).toISOString()).toBe("2026-10-24T08:00:00.000Z");
    expect(new Date(after[0].start).toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });

  it("slots stay on the local :00/:30 grid on a DST day", () => {
    const slots = computeAvailability(
      query({
        timezone: "Europe/London",
        fromDate: "2026-10-25",
        toDate: "2026-10-25",
        now: "2026-10-20T00:00:00Z",
        providers: [provider("A", { weeklyHours: [{ weekday: 0, startMinute: 540, endMinute: 720 }] })],
      }),
    );
    expect(slots.map((s) => local(s.start, "Europe/London"))).toEqual([
      "2026-10-25 09:00",
      "2026-10-25 09:30",
      "2026-10-25 10:00",
      "2026-10-25 10:30",
      "2026-10-25 11:00",
      "2026-10-25 11:30",
    ]);
  });

  it("Asia/Karachi (no DST) resolves working hours to UTC-5h", () => {
    const slots = computeAvailability(
      query({ timezone: "Asia/Karachi", fromDate: "2026-09-08", toDate: "2026-09-08", providers: [provider("A", { weeklyHours: [{ weekday: 2, startMinute: 600, endMinute: 660 }] })] }),
    );
    expect(slots.map((s) => s.start)).toEqual(["2026-09-08T05:00:00.000Z", "2026-09-08T05:30:00.000Z"]);
  });
});

describe("computeAvailability", () => {
  it("returns the full 9-5 grid for a free weekday and nothing on a weekend", () => {
    const tue = computeAvailability(query());
    expect(tue).toHaveLength(16);
    expect(local(tue[0].start, "America/New_York")).toBe("2026-09-08 09:00");
    expect(local(tue[15].start, "America/New_York")).toBe("2026-09-08 16:30");
    const sat = computeAvailability(query({ fromDate: "2026-09-12", toDate: "2026-09-12" }));
    expect(sat).toHaveLength(0);
  });

  it("a service longer than the remaining window is not offered", () => {
    const slots = computeAvailability(query({ service: { durationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 } }));
    expect(local(slots[slots.length - 1].start, "America/New_York")).toBe("2026-09-08 16:00");
  });

  it("skips holidays", () => {
    expect(computeAvailability(query({ holidays: ["2026-09-08"] }))).toHaveLength(0);
  });

  it("removes slots overlapping blocked time (lunch)", () => {
    const lunch = { start: "2026-09-08T16:00:00.000Z", end: "2026-09-08T17:00:00.000Z" }; // 12:00-13:00 EDT
    const slots = computeAvailability(query({ providers: [provider("A", { blocked: [lunch] })] }));
    const times = slots.map((s) => local(s.start, "America/New_York").slice(11));
    expect(times).not.toContain("12:00");
    expect(times).not.toContain("12:30");
    expect(times).toContain("11:30");
    expect(times).toContain("13:00");
  });

  it("org-wide blocked time applies to every provider", () => {
    const block = { start: "2026-09-08T13:00:00.000Z", end: "2026-09-08T21:00:00.000Z" };
    expect(computeAvailability(query({ orgBlocked: [block], providers: [provider("A"), provider("B")] }))).toHaveLength(0);
  });

  it("respects existing bookings and buffers on both sides", () => {
    // Existing booking 10:00-10:30 EDT whose busy range already includes a 15 min after-buffer: 14:00Z-14:45Z
    const existing = { start: "2026-09-08T14:00:00.000Z", end: "2026-09-08T14:45:00.000Z" };
    const slots = computeAvailability(
      query({
        service: { durationMinutes: 30, bufferBeforeMinutes: 10, bufferAfterMinutes: 15 },
        rules: { minLeadMinutes: 0, maxAdvanceDays: 60, slotGranularityMinutes: 15 },
        providers: [provider("A", { busy: [existing] })],
      }),
    );
    const times = slots.map((s) => local(s.start, "America/New_York").slice(11));
    // 09:15 would end 09:45 + 15 after = 10:00 -> touches but does not overlap [10:00,10:45): allowed
    expect(times).toContain("09:15");
    // 09:30 ends 10:00, after-buffer to 10:15 overlaps existing busy: blocked
    expect(times).not.toContain("09:30");
    expect(times).not.toContain("10:00");
    expect(times).not.toContain("10:30");
    // 10:45 has a 10 min before-buffer starting 10:35 which overlaps [10:00,10:45): blocked
    expect(times).not.toContain("10:45");
    // 11:00: busy range 10:50-11:45 is clear
    expect(times).toContain("11:00");
  });

  it("applies minimum lead time; the first slot is the first grid point after now + lead", () => {
    // now = 09:10 EDT on the day; lead 120 min -> earliest 11:10 -> first grid slot 11:30
    const slots = computeAvailability(
      query({ now: "2026-09-08T13:10:00.000Z", rules: { minLeadMinutes: 120, maxAdvanceDays: 60, slotGranularityMinutes: 30 } }),
    );
    expect(local(slots[0].start, "America/New_York")).toBe("2026-09-08 11:30");
  });

  it("applies maximum advance booking", () => {
    const slots = computeAvailability(
      query({ fromDate: "2026-09-01", toDate: "2026-09-30", rules: { minLeadMinutes: 0, maxAdvanceDays: 7, slotGranularityMinutes: 30 } }),
    );
    const days = new Set(slots.map((s) => local(s.start, "America/New_York").slice(0, 10)));
    expect([...days].sort()).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07", "2026-09-08"]);
  });

  it("filters by time-of-day preference", () => {
    const morning = computeAvailability(query({ preference: "morning" }));
    expect(morning.every((s) => DateTime.fromISO(s.start, { zone: "America/New_York" }).hour < 12)).toBe(true);
    expect(morning).toHaveLength(6);
    const afternoon = computeAvailability(query({ preference: "afternoon" }));
    expect(afternoon).toHaveLength(10);
  });

  it("any provider: unions slots, dedupes by start, and prefers the least-loaded provider", () => {
    const busyA = [{ start: "2026-09-08T14:00:00.000Z", end: "2026-09-08T14:30:00.000Z" }]; // A busy 10:00
    const slots = computeAvailability(query({ providers: [provider("A", { busy: busyA }), provider("B")] }));
    expect(slots).toHaveLength(16); // still a full grid because B covers 10:00
    const ten = slots.find((s) => local(s.start, "America/New_York").endsWith("10:00"))!;
    expect(ten.providerId).toBe("B");
    // For a slot both can take, the less-loaded provider (B has 0 bookings) wins
    const nine = slots.find((s) => local(s.start, "America/New_York").endsWith("09:00"))!;
    expect(nine.providerId).toBe("B");
  });

  it("any provider: ties fall back to a deterministic provider order", () => {
    const slots = computeAvailability(query({ providers: [provider("B"), provider("A")] }));
    expect(slots.every((s) => s.providerId === "A")).toBe(true);
  });

  it("any provider: load is counted per day, so a provider busy today still wins tomorrow", () => {
    const busyA = [
      { start: "2026-09-08T14:00:00.000Z", end: "2026-09-08T14:30:00.000Z" },
      { start: "2026-09-08T15:00:00.000Z", end: "2026-09-08T15:30:00.000Z" },
    ];
    const busyB = [{ start: "2026-09-09T14:00:00.000Z", end: "2026-09-09T14:30:00.000Z" }];
    const slots = computeAvailability(query({ fromDate: "2026-09-08", toDate: "2026-09-09", providers: [provider("A", { busy: busyA }), provider("B", { busy: busyB })] }));
    const tue = slots.filter((s) => s.start.startsWith("2026-09-08"));
    const wed = slots.filter((s) => s.start.startsWith("2026-09-09"));
    expect(tue.every((s) => s.providerId === "B")).toBe(true);
    expect(wed.every((s) => s.providerId === "A")).toBe(true);
  });

  it("aligns slots to the local-clock grid even when hours start off-grid", () => {
    const p = provider("P", { weeklyHours: [{ weekday: 2, startMinute: 550, endMinute: 700 }] }); // 09:10-11:40
    const slots = computeAvailability(query({ providers: [p] }));
    expect(slots.map((s) => local(s.start, "America/New_York").slice(11))).toEqual(["09:30", "10:00", "10:30", "11:00"]);
  });

  it("keeps the grid across a second window that starts off-grid", () => {
    const p = provider("P", { weeklyHours: [{ weekday: 2, startMinute: 540, endMinute: 720 }, { weekday: 2, startMinute: 765, endMinute: 900 }] });
    const slots = computeAvailability(query({ providers: [p] }));
    const times = slots.map((s) => local(s.start, "America/New_York").slice(11));
    expect(times).toContain("13:00");
    expect(times).not.toContain("12:45");
  });

  it("a slot may not end after the max-advance horizon", () => {
    const slots = computeAvailability(
      query({ now: "2026-09-08T13:00:00.000Z", fromDate: "2026-09-09", toDate: "2026-09-09", rules: { minLeadMinutes: 0, maxAdvanceDays: 1, slotGranularityMinutes: 30 } }),
    );
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => Date.parse(s.end) <= Date.parse("2026-09-10T03:59:59.999Z"))).toBe(true);
  });

  it("dedupes duplicate wall-clock labels on a DST fall-back day", () => {
    const p = provider("P", { weeklyHours: [{ weekday: 0, startMinute: 0, endMinute: 240 }] });
    const slots = computeAvailability(
      query({ timezone: "Europe/London", fromDate: "2026-10-25", toDate: "2026-10-25", now: "2026-10-20T00:00:00Z", rules: { minLeadMinutes: 0, maxAdvanceDays: 60, slotGranularityMinutes: 60 }, providers: [p] }),
    );
    const labels = slots.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("rejects invalid inputs instead of failing open", () => {
    expect(() => computeAvailability(query({ now: "not-a-date" }))).toThrow(/invalid now/);
    expect(() => computeAvailability(query({ now: "2026-09-08T13:10:00" }))).toThrow(/offset/);
    expect(() => computeAvailability(query({ rules: { minLeadMinutes: 0, maxAdvanceDays: 60, slotGranularityMinutes: 0 } }))).toThrow(/slotGranularityMinutes/);
    expect(() => computeAvailability(query({ service: { durationMinutes: 0, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 } }))).toThrow(/durationMinutes/);
    expect(() => busyRangeFor("nope", 30, 0, 0)).toThrow(/invalid startAt/);
  });

  it("provider with overlapping partial-day hours only offers within their hours", () => {
    const p = provider("P", { weeklyHours: [{ weekday: 2, startMinute: 780, endMinute: 900 }] }); // 13:00-15:00 Tue
    const slots = computeAvailability(query({ providers: [p] }));
    expect(slots.map((s) => local(s.start, "America/New_York").slice(11))).toEqual(["13:00", "13:30", "14:00", "14:30"]);
  });
});

describe("chooseSlotsToOffer", () => {
  it("spreads offers across days", () => {
    const slots = computeAvailability(query({ fromDate: "2026-09-08", toDate: "2026-09-10" }));
    const offered = chooseSlotsToOffer(slots, 3, "America/New_York");
    expect(offered.map((s) => local(s.start, "America/New_York"))).toEqual([
      "2026-09-08 09:00",
      "2026-09-09 09:00",
      "2026-09-10 09:00",
    ]);
    const four = chooseSlotsToOffer(slots, 4, "America/New_York");
    expect(local(four[1].start, "America/New_York")).toBe("2026-09-08 09:30");
  });
});

describe("busyRangeFor", () => {
  it("expands the customer window by buffers", () => {
    expect(busyRangeFor("2026-09-08T14:00:00.000Z", 30, 10, 15)).toEqual({
      startAt: "2026-09-08T14:00:00.000Z",
      endAt: "2026-09-08T14:30:00.000Z",
      busyStartAt: "2026-09-08T13:50:00.000Z",
      busyEndAt: "2026-09-08T14:45:00.000Z",
    });
  });
});
