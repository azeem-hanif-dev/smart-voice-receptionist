import { DateTime } from "luxon";
import {
  ContactMemorySchema,
  type CancelBookingArgs,
  type CheckAvailabilityArgs,
  type ConfirmBookingArgs,
  type ContactMemory,
  type CreateBookingArgs,
  type FindBookingsArgs,
  type GetBusinessInfoArgs,
  type HandoffToHumanArgs,
  type RescheduleBookingArgs,
  type SearchFaqArgs,
  type Slot,
  type UpdateContactMemoryArgs,
} from "@ar/shared";
import { busyRangeFor, chooseSlotsToOffer, computeAvailability, formatSlotLabel, type ProviderSchedule, type UtcInterval } from "../availability/index.js";
import type { BookingResult, BookingSummary, BusinessProfile, ReceptionistTools } from "./types.js";
import { formatPrice } from "./prompt.js";

const STOPWORDS = new Set(["the", "and", "for", "are", "can", "how", "what", "with", "your", "you", "have", "offer", "does", "any", "there", "this", "that", "will", "get", "need", "about", "from", "please", "much", "also", "into", "when", "where", "which", "would", "could", "should", "want", "like", "know", "tell"]);

/** Keyword scoring shared by the in-memory tools and the API's FAQ search. Question matches count double. */
export function scoreFaqs<T extends { question: string; answer: string; keywords?: string[] }>(faqs: T[], query: string): T[] {
  const words = query.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (words.length === 0) return [];
  return faqs
    .map((f) => {
      const q = f.question.toLowerCase();
      const a = f.answer.toLowerCase();
      const kw = (f.keywords ?? []).map((k) => k.toLowerCase());
      let score = 0;
      for (const w of words) {
        if (q.includes(w)) score += 2;
        else if (kw.some((k) => k.includes(w) || w.includes(k))) score += 2;
        else if (a.includes(w)) score += 1;
      }
      return { f, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.f);
}

export interface MemoryBooking extends BookingSummary {
  contactId: string;
  busyStart: string;
  busyEnd: string;
}

/**
 * In-memory implementation of the tool contract backed by the pure availability engine.
 * Used by engine tests and by the demo script when no database is wanted. The API has a Prisma version.
 */
export class InMemoryTools implements ReceptionistTools {
  bookings: MemoryBooking[] = [];
  blocked: { providerId?: string; interval: UtcInterval }[] = [];
  holidays: string[] = [];
  handoffs: HandoffToHumanArgs[] = [];
  memory: ContactMemory;
  private seq = 0;

  constructor(
    public profile: BusinessProfile,
    public contactId: string,
    memory?: Partial<ContactMemory>,
    public now: () => string = () => new Date().toISOString(),
    public serviceBuffers: Record<string, { before: number; after: number }> = {},
  ) {
    this.memory = ContactMemorySchema.parse(memory ?? {});
  }

  private service(id: string) {
    return this.profile.services.find((s) => s.id === id);
  }
  private provider(id: string) {
    return this.profile.providers.find((p) => p.id === id);
  }
  private timing(serviceId: string) {
    const s = this.service(serviceId)!;
    const b = this.serviceBuffers[serviceId] ?? { before: 0, after: 0 };
    return { durationMinutes: s.durationMinutes, bufferBeforeMinutes: b.before, bufferAfterMinutes: b.after };
  }
  private schedules(serviceId: string, providerId?: string, excludeBookingId?: string): ProviderSchedule[] {
    return this.profile.providers
      .filter((p) => (providerId ? p.id === providerId : true) && p.serviceIds.includes(serviceId))
      .map((p) => ({
        providerId: p.id,
        providerName: p.name,
        weeklyHours: this.profile.hours.filter((h) => h.providerId === p.id),
        blocked: this.blocked.filter((b) => !b.providerId || b.providerId === p.id).map((b) => b.interval),
        busy: this.bookings
          .filter((b) => b.providerId === p.id && b.id !== excludeBookingId && (b.status === "CONFIRMED" || b.status === "PENDING"))
          .map((b) => ({ start: b.busyStart, end: b.busyEnd })),
      }));
  }
  private summary(b: MemoryBooking): BookingSummary {
    const { contactId: _c, busyStart: _s, busyEnd: _e, ...rest } = b;
    return rest;
  }

  async getBusinessInfo(_args: GetBusinessInfoArgs) {
    const p = this.profile;
    return {
      name: p.name,
      timezone: p.timezone,
      locations: p.locations,
      providers: p.providers.map((x) => ({ id: x.id, name: x.name, title: x.title, serviceIds: x.serviceIds })),
      services: p.services.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes, price: formatPrice(s.priceCents, s.currency), description: s.description })),
      policies: p.bookingRules,
    };
  }

  async searchFaq(args: SearchFaqArgs) {
    return { hits: scoreFaqs(this.profile.faqs, args.query).slice(0, 3) };
  }

  async checkAvailability(args: CheckAvailabilityArgs, excludeBookingId?: string): Promise<{ slots: Slot[]; timezone: string; note?: string }> {
    const svc = this.service(args.serviceId);
    if (!svc) return { slots: [], timezone: this.profile.timezone, note: `Unknown service id ${args.serviceId}` };
    const providerId = args.providerId && args.providerId !== "any" ? args.providerId : undefined;
    const from = args.fromDate;
    const to = args.toDate ?? DateTime.fromISO(from, { zone: this.profile.timezone }).plus({ days: 6 }).toISODate()!;
    const r = this.profile.bookingRules;
    const all = computeAvailability({
      timezone: this.profile.timezone,
      now: this.now(),
      fromDate: from,
      toDate: to,
      holidays: this.holidays,
      service: this.timing(args.serviceId),
      rules: { minLeadMinutes: r.minLeadMinutes, maxAdvanceDays: r.maxAdvanceDays, slotGranularityMinutes: r.slotGranularityMinutes },
      providers: this.schedules(args.serviceId, providerId, excludeBookingId),
      preference: args.preference,
    });
    const chosen = chooseSlotsToOffer(all, Math.max(2, Math.min(4, r.slotsToOffer)), this.profile.timezone);
    const note = all.length === 0 ? "No availability in this range. Try a different range, provider or time of day." : all.length > chosen.length ? `${all.length} slots available in total; offering ${chosen.length}. Ask for other days or times if none suit.` : undefined;
    return { slots: chosen, timezone: this.profile.timezone, note };
  }

  private slotTaken(providerId: string, busyStart: string, busyEnd: string, excludeId?: string) {
    const s = Date.parse(busyStart);
    const e = Date.parse(busyEnd);
    return this.bookings.some((b) => b.providerId === providerId && b.id !== excludeId && (b.status === "CONFIRMED" || b.status === "PENDING") && Date.parse(b.busyStart) < e && Date.parse(b.busyEnd) > s);
  }

  async createBooking(args: CreateBookingArgs): Promise<BookingResult> {
    const svc = this.service(args.serviceId);
    const prov = this.provider(args.providerId);
    if (!svc || !prov) return { ok: false, reason: "INVALID", message: "Unknown service or provider id." };
    if (!prov.serviceIds.includes(svc.id)) return { ok: false, reason: "INVALID", message: `${prov.name} does not offer ${svc.name}.` };
    const t = this.timing(args.serviceId);
    const range = busyRangeFor(args.startAt, t.durationMinutes, t.bufferBeforeMinutes, t.bufferAfterMinutes);
    if (this.slotTaken(args.providerId, range.busyStartAt, range.busyEndAt)) {
      const alt = await this.checkAvailability({ serviceId: args.serviceId, providerId: args.providerId, fromDate: DateTime.fromISO(args.startAt, { zone: this.profile.timezone }).toISODate()!, preference: "any" });
      return { ok: false, reason: "SLOT_TAKEN", message: "That slot was just taken.", alternatives: alt.slots };
    }
    const booking: MemoryBooking = {
      id: `bk_${++this.seq}`,
      contactId: this.contactId,
      serviceId: svc.id,
      serviceName: svc.name,
      providerId: prov.id,
      providerName: prov.name,
      startAt: range.startAt,
      endAt: range.endAt,
      busyStart: range.busyStartAt,
      busyEnd: range.busyEndAt,
      status: "CONFIRMED",
      label: formatSlotLabel(range.startAt, this.profile.timezone),
      notes: args.notes ?? null,
    };
    this.bookings.push(booking);
    if (args.customerName && !this.memory.name) this.memory.name = args.customerName;
    this.memory.isReturning = true;
    this.memory.lastBookingSummary = `${booking.serviceName} on ${booking.label} with ${booking.providerName}`;
    return { ok: true, booking: this.summary(booking) };
  }

  async findBookings(args: FindBookingsArgs) {
    const nowMs = Date.parse(this.now());
    const list = this.bookings.filter((b) => b.contactId === this.contactId && (args.includePast || Date.parse(b.endAt) >= nowMs) && b.status !== "CANCELLED");
    return { bookings: list.map((b) => this.summary(b)) };
  }

  async rescheduleBooking(args: RescheduleBookingArgs & { offeredServiceId?: string }): Promise<BookingResult> {
    const b = this.bookings.find((x) => x.id === args.bookingId && x.contactId === this.contactId);
    if (!b) return { ok: false, reason: "NOT_FOUND", message: "No such booking for this customer." };
    if (args.offeredServiceId && args.offeredServiceId !== b.serviceId) {
      return { ok: false, reason: "INVALID", message: `The slot was checked for a different service. Call check_availability with serviceId ${b.serviceId}.` };
    }
    const cutoffMs = this.profile.bookingRules.cancellationCutoffHours * 3_600_000;
    if (Date.parse(b.startAt) - Date.parse(this.now()) < cutoffMs) {
      return { ok: false, reason: "TOO_LATE_TO_CHANGE", message: `Changes need ${this.profile.bookingRules.cancellationCutoffHours} hours' notice. Offer to hand off to a team member.` };
    }
    const t = this.timing(b.serviceId);
    const range = busyRangeFor(args.newStartAt, t.durationMinutes, t.bufferBeforeMinutes, t.bufferAfterMinutes);
    if (this.slotTaken(args.providerId, range.busyStartAt, range.busyEndAt, b.id)) {
      return { ok: false, reason: "SLOT_TAKEN", message: "That slot was just taken." };
    }
    const prov = this.provider(args.providerId)!;
    Object.assign(b, { providerId: prov.id, providerName: prov.name, startAt: range.startAt, endAt: range.endAt, busyStart: range.busyStartAt, busyEnd: range.busyEndAt, label: formatSlotLabel(range.startAt, this.profile.timezone) });
    return { ok: true, booking: this.summary(b) };
  }

  async cancelBooking(args: CancelBookingArgs) {
    const b = this.bookings.find((x) => x.id === args.bookingId && x.contactId === this.contactId);
    if (!b) return { ok: false, reason: "NOT_FOUND", message: "No such booking." };
    b.status = "CANCELLED";
    return { ok: true, booking: this.summary(b) };
  }

  async confirmBooking(args: ConfirmBookingArgs) {
    const b = this.bookings.find((x) => x.id === args.bookingId && x.contactId === this.contactId);
    if (!b) return { ok: false, message: "No such booking." };
    return { ok: true, booking: this.summary(b) };
  }

  async updateContactMemory(args: UpdateContactMemoryArgs) {
    if (args.name) this.memory.name = args.name;
    if (args.language) this.memory.language = args.language;
    if (args.preferredProviderId) {
      this.memory.preferredProviderId = args.preferredProviderId;
      this.memory.preferredProviderName = this.provider(args.preferredProviderId)?.name;
    }
    if (args.addPreference) this.memory.preferences = [...new Set([...this.memory.preferences, args.addPreference])];
    if (args.addNote) this.memory.notes = [...new Set([...this.memory.notes, args.addNote])];
    if (args.qualification) this.memory.qualification = { ...this.memory.qualification, ...args.qualification };
    return { ok: true as const, memory: this.memory };
  }

  async handoffToHuman(args: HandoffToHumanArgs) {
    this.handoffs.push(args);
    return { ok: true as const };
  }
}
