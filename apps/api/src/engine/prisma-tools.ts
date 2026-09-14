import { DateTime } from "luxon";
import { chooseSlotsToOffer, formatPrice, scoreFaqs, type BookingResult, type BusinessProfile, type ReceptionistTools } from "@ar/core";
import type {
  CancelBookingArgs,
  CheckAvailabilityArgs,
  ConfirmBookingArgs,
  ContactMemory,
  CreateBookingArgs,
  FindBookingsArgs,
  GetBusinessInfoArgs,
  HandoffToHumanArgs,
  RescheduleBookingArgs,
  SearchFaqArgs,
  UpdateContactMemoryArgs,
} from "@ar/shared";
import type { PrismaClient } from "@ar/db";
import type { BookingsService } from "../bookings/bookings.service.js";
import type { ProfileService } from "../orgs/profile.service.js";
import type { AnalyticsService } from "../analytics/analytics.service.js";

export interface ToolScope {
  orgId: string;
  contactId: string;
  conversationId: string;
  profile: BusinessProfile;
}

/** Database-backed implementation of the engine's tool contract. One instance per turn. */
export class PrismaTools implements ReceptionistTools {
  constructor(
    private readonly db: PrismaClient,
    private readonly bookings: BookingsService,
    private readonly profiles: ProfileService,
    private readonly analytics: AnalyticsService,
    private readonly scope: ToolScope,
  ) {}

  async getBusinessInfo(_args: GetBusinessInfoArgs) {
    const p = this.scope.profile;
    return {
      name: p.name,
      timezone: p.timezone,
      locations: p.locations,
      providers: p.providers,
      services: p.services.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes, price: formatPrice(s.priceCents, s.currency), description: s.description })),
      policies: p.bookingRules,
      escalation: "A team member reviews handoffs from the dashboard inbox.",
    };
  }

  async searchFaq(args: SearchFaqArgs) {
    const faqs = await this.db.faq.findMany({ where: { orgId: this.scope.orgId } });
    return { hits: scoreFaqs(faqs, args.query).slice(0, 3).map((f) => ({ question: f.question, answer: f.answer })) };
  }

  async checkAvailability(args: CheckAvailabilityArgs) {
    const res = await this.bookings.availability(this.scope.orgId, { serviceId: args.serviceId, providerId: args.providerId, fromDate: args.fromDate, toDate: args.toDate, preference: args.preference });
    const n = Math.max(2, Math.min(4, this.scope.profile.bookingRules.slotsToOffer));
    const chosen = chooseSlotsToOffer(res.slots, n, res.timezone);
    const note =
      res.note ??
      (res.slots.length === 0
        ? "No availability in this range. Try a different range, provider or time of day."
        : res.slots.length > chosen.length
          ? `${res.slots.length} slots available in total; offering ${chosen.length}. Ask for other days or times if none suit.`
          : undefined);
    return { slots: chosen, timezone: res.timezone, note };
  }

  async createBooking(args: CreateBookingArgs): Promise<BookingResult> {
    if (args.customerName) {
      const c = await this.db.contact.findUnique({ where: { id: this.scope.contactId } });
      if (c && !c.name) await this.db.contact.update({ where: { id: c.id }, data: { name: args.customerName } });
    }
    return this.bookings.create(this.scope.orgId, {
      contactId: this.scope.contactId,
      serviceId: args.serviceId,
      providerId: args.providerId,
      startAt: args.startAt,
      notes: args.notes,
      source: "AI",
      conversationId: this.scope.conversationId,
    });
  }

  async findBookings(args: FindBookingsArgs) {
    return { bookings: await this.bookings.upcomingForContact(this.scope.orgId, this.scope.contactId, args.includePast) };
  }

  async rescheduleBooking(args: RescheduleBookingArgs & { offeredServiceId?: string }): Promise<BookingResult> {
    return this.bookings.reschedule(this.scope.orgId, args.bookingId, { startAt: args.newStartAt, providerId: args.providerId, enforceCutoff: true, contactId: this.scope.contactId, offeredServiceId: args.offeredServiceId });
  }

  async cancelBooking(args: CancelBookingArgs) {
    return this.bookings.cancel(this.scope.orgId, args.bookingId, { reason: args.reason, contactId: this.scope.contactId, enforceCutoff: true });
  }

  async confirmBooking(args: ConfirmBookingArgs) {
    return this.bookings.confirmByCustomer(this.scope.orgId, args.bookingId, this.scope.contactId);
  }

  async updateContactMemory(args: UpdateContactMemoryArgs) {
    const contact = await this.db.contact.findUniqueOrThrow({ where: { id: this.scope.contactId } });
    const memory: ContactMemory = this.profiles.memoryOf(contact);
    if (args.name) memory.name = args.name;
    if (args.language) memory.language = args.language;
    if (args.preferredProviderId) {
      memory.preferredProviderId = args.preferredProviderId;
      memory.preferredProviderName = this.scope.profile.providers.find((p) => p.id === args.preferredProviderId)?.name;
    }
    if (args.addPreference) memory.preferences = [...new Set([...memory.preferences, args.addPreference])].slice(-10);
    if (args.addNote) memory.notes = [...new Set([...memory.notes, args.addNote])].slice(-10);
    if (args.qualification) memory.qualification = { ...memory.qualification, ...args.qualification };
    await this.db.contact.update({
      where: { id: contact.id },
      data: { memory, ...(args.name && !contact.name ? { name: args.name } : {}), ...(args.language ? { language: args.language } : {}) },
    });
    return { ok: true as const, memory };
  }

  async handoffToHuman(args: HandoffToHumanArgs) {
    await this.db.conversation.update({
      where: { id: this.scope.conversationId },
      data: { status: "HUMAN", handoffReason: `${args.urgency === "high" ? "URGENT: " : ""}${args.reason}${args.summary ? ` — ${args.summary}` : ""}`.slice(0, 500), handoffAt: new Date() },
    });
    return { ok: true as const };
  }

  static localToday(tz: string): string {
    return DateTime.now().setZone(tz).toISODate()!;
  }
}
