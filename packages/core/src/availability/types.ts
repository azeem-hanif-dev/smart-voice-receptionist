import type { Slot } from "@ar/shared";

/** Half-open UTC interval [start, end) as ISO strings. */
export interface UtcInterval {
  start: string;
  end: string;
}

/** Weekly template in the organization's local wall-clock time. weekday: 0 = Sunday … 6 = Saturday. */
export interface WeeklyHours {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface ProviderSchedule {
  providerId: string;
  providerName?: string;
  weeklyHours: WeeklyHours[];
  /** Blocked time for this provider (UTC). */
  blocked: UtcInterval[];
  /** Busy ranges of existing bookings, buffers already included (UTC). */
  busy: UtcInterval[];
}

export interface ServiceTiming {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

export interface AvailabilityRules {
  minLeadMinutes: number;
  maxAdvanceDays: number;
  slotGranularityMinutes: number;
}

export type TimeOfDayPreference = "morning" | "afternoon" | "evening" | "any";

export interface AvailabilityQuery {
  timezone: string;
  /** Injected "now" in UTC ISO for determinism. */
  now: string;
  /** Local calendar days, inclusive, YYYY-MM-DD. */
  fromDate: string;
  toDate: string;
  holidays: string[];
  /** Org-wide blocked time (applies to every provider). */
  orgBlocked?: UtcInterval[];
  service: ServiceTiming;
  rules: AvailabilityRules;
  providers: ProviderSchedule[];
  preference?: TimeOfDayPreference;
}

export type { Slot };
