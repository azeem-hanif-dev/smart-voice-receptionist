export interface ExternalCalendarEvent {
  externalId: string;
  providerId: string;
  startAt: string;
  endAt: string;
  title: string;
}

export interface CalendarBookingPayload {
  bookingId: string;
  providerId: string;
  providerExternalCalendarId?: string | null;
  startAt: string;
  endAt: string;
  title: string;
  description?: string;
}

/**
 * Optional two-way sync with an external calendar. The platform's own availability engine remains the
 * source of truth; the adapter mirrors bookings out and imports busy time in.
 */
export interface CalendarAdapter {
  readonly provider: "none" | "google";
  readonly connected: boolean;
  pushBooking(b: CalendarBookingPayload): Promise<{ externalEventId: string } | null>;
  updateBooking(externalEventId: string, b: CalendarBookingPayload): Promise<void>;
  deleteBooking(externalEventId: string): Promise<void>;
  /** Busy intervals from the external calendar for a provider in a range (UTC ISO). */
  fetchBusy(providerExternalCalendarId: string, fromIso: string, toIso: string): Promise<ExternalCalendarEvent[]>;
}

/** Used until Google credentials exist. Every call is a no-op that resolves immediately. */
export class StubCalendarAdapter implements CalendarAdapter {
  readonly provider = "none" as const;
  readonly connected = false;
  async pushBooking() {
    return null;
  }
  async updateBooking() {}
  async deleteBooking() {}
  async fetchBusy() {
    return [];
  }
}
