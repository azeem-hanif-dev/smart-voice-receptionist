import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { DateTime } from "luxon";
import { busyRangeFor, computeAvailability, type BookingResult, type ProviderSchedule } from "@ar/core";
import { BookingRulesSchema, type BookingStatus, type Slot } from "@ar/shared";
import { isSlotTakenError, type Booking, type BookingSource, type Contact, type Provider, type Service } from "@ar/db";
import { PrismaService } from "../common/prisma.service.js";
import { ProfileService } from "../orgs/profile.service.js";
import { RemindersService } from "../queues/reminders.service.js";
import { AnalyticsService } from "../analytics/analytics.service.js";

export type BookingWithRelations = Booking & { service: Service; provider: Provider; contact: Contact };

const INCLUDE = { service: true, provider: true, contact: true } as const;

export interface AvailabilityArgs {
  serviceId: string;
  providerId?: string;
  fromDate: string;
  toDate?: string;
  preference?: "morning" | "afternoon" | "evening" | "any";
  /** Ignore this booking's own busy range (when rescheduling). */
  excludeBookingId?: string;
  now?: string;
}

@Injectable()
export class BookingsService {
  private readonly log = new Logger(BookingsService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProfileService) private readonly profiles: ProfileService,
    @Inject(RemindersService) private readonly reminders: RemindersService,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
  ) {}
  private get db() {
    return this.prisma.client;
  }

  /** All bookable slots (not yet reduced to 2-4). */
  async availability(orgId: string, args: AvailabilityArgs): Promise<{ slots: Slot[]; timezone: string; note?: string }> {
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: orgId } });
    const rules = BookingRulesSchema.parse(org.bookingRules ?? {});
    const service = await this.db.service.findFirst({ where: { id: args.serviceId, orgId } });
    if (!service) return { slots: [], timezone: org.timezone, note: `Unknown service id ${args.serviceId}` };
    const tz = org.timezone;
    const fromDate = args.fromDate;
    const toDate = args.toDate ?? DateTime.fromISO(fromDate, { zone: tz }).plus({ days: 6 }).toISODate()!;
    const rangeStart = DateTime.fromISO(fromDate, { zone: tz }).minus({ days: 1 }).toJSDate();
    const rangeEnd = DateTime.fromISO(toDate, { zone: tz }).plus({ days: 2 }).toJSDate();

    const providers = await this.db.provider.findMany({
      where: {
        orgId,
        active: true,
        services: { some: { serviceId: service.id } },
        ...(args.providerId && args.providerId !== "any" ? { id: args.providerId } : {}),
      },
      include: {
        workingHours: true,
        blockedTimes: { where: { startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } } },
        bookings: { where: { status: { not: "CANCELLED" }, busyStartAt: { lt: rangeEnd }, busyEndAt: { gt: rangeStart }, ...(args.excludeBookingId ? { id: { not: args.excludeBookingId } } : {}) } },
      },
    });
    if (providers.length === 0) return { slots: [], timezone: tz, note: args.providerId ? "That provider does not offer this service." : "No provider offers this service." };
    const [orgBlocked, holidays] = await Promise.all([
      this.db.blockedTime.findMany({ where: { orgId, providerId: null, startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } } }),
      this.db.holiday.findMany({ where: { orgId, date: { gte: fromDate, lte: toDate } } }),
    ]);
    const schedules: ProviderSchedule[] = providers.map((p) => ({
      providerId: p.id,
      providerName: p.name,
      weeklyHours: p.workingHours.map((h) => ({ weekday: h.weekday, startMinute: h.startMinute, endMinute: h.endMinute })),
      blocked: p.blockedTimes.map((b) => ({ start: b.startAt.toISOString(), end: b.endAt.toISOString() })),
      busy: p.bookings.map((b) => ({ start: b.busyStartAt.toISOString(), end: b.busyEndAt.toISOString() })),
    }));
    const slots = computeAvailability({
      timezone: tz,
      now: args.now ?? new Date().toISOString(),
      fromDate,
      toDate,
      holidays: holidays.map((h) => h.date),
      orgBlocked: orgBlocked.map((b) => ({ start: b.startAt.toISOString(), end: b.endAt.toISOString() })),
      service: { durationMinutes: service.durationMinutes, bufferBeforeMinutes: service.bufferBeforeMinutes, bufferAfterMinutes: service.bufferAfterMinutes },
      rules: { minLeadMinutes: rules.minLeadMinutes, maxAdvanceDays: rules.maxAdvanceDays, slotGranularityMinutes: rules.slotGranularityMinutes },
      providers: schedules,
      preference: args.preference,
    });
    return { slots, timezone: tz };
  }

  async create(
    orgId: string,
    input: { contactId: string; serviceId: string; providerId: string; startAt: string; notes?: string | null; source: BookingSource; conversationId?: string | null },
  ): Promise<BookingResult> {
    const [service, provider, org] = await Promise.all([
      this.db.service.findFirst({ where: { id: input.serviceId, orgId } }),
      this.db.provider.findFirst({ where: { id: input.providerId, orgId, active: true } }),
      this.db.organization.findUniqueOrThrow({ where: { id: orgId } }),
    ]);
    if (!service || !provider) return { ok: false, reason: "INVALID", message: "Unknown service or provider." };
    const offers = await this.db.providerService.findUnique({ where: { providerId_serviceId: { providerId: provider.id, serviceId: service.id } } });
    if (!offers) return { ok: false, reason: "INVALID", message: `${provider.name} does not offer ${service.name}.` };
    if (input.source === "AI") {
      const rules = BookingRulesSchema.parse(org.bookingRules ?? {});
      const lead = Date.parse(input.startAt) - Date.now();
      if (lead < rules.minLeadMinutes * 60_000) return { ok: false, reason: "OUTSIDE_RULES", message: `Bookings need at least ${rules.minLeadMinutes} minutes' notice. Call check_availability again.` };
      if (lead > rules.maxAdvanceDays * 86_400_000) return { ok: false, reason: "OUTSIDE_RULES", message: `Bookings can be made up to ${rules.maxAdvanceDays} days ahead.` };
    }
    let range;
    try {
      range = busyRangeFor(input.startAt, service.durationMinutes, service.bufferBeforeMinutes, service.bufferAfterMinutes);
    } catch (e) {
      return { ok: false, reason: "INVALID", message: (e as Error).message };
    }
    try {
      const booking = await this.db.booking.create({
        data: {
          orgId,
          contactId: input.contactId,
          serviceId: service.id,
          providerId: provider.id,
          conversationId: input.conversationId ?? null,
          status: "CONFIRMED",
          source: input.source,
          startAt: new Date(range.startAt),
          endAt: new Date(range.endAt),
          busyStartAt: new Date(range.busyStartAt),
          busyEndAt: new Date(range.busyEndAt),
          notes: input.notes ?? null,
        },
        include: INCLUDE,
      });
      await this.reminders.scheduleForBooking(booking.id).catch((e) => this.log.error(`reminder scheduling failed for ${booking.id}: ${(e as Error).message}`));
      await this.analytics.record(orgId, "BOOKING_CREATED", { source: input.source }, input.conversationId ?? undefined, booking.id);
      await this.touchContactMemory(booking, org.timezone);
      return { ok: true, booking: this.profiles.bookingSummary(booking, org.timezone) };
    } catch (e) {
      if (isSlotTakenError(e)) {
        const day = DateTime.fromISO(range.startAt, { zone: org.timezone }).toISODate()!;
        const alt = await this.availability(orgId, { serviceId: service.id, providerId: provider.id, fromDate: day });
        return { ok: false, reason: "SLOT_TAKEN", message: "That slot was just taken.", alternatives: alt.slots.slice(0, 4) };
      }
      throw e;
    }
  }

  async reschedule(
    orgId: string,
    bookingId: string,
    input: { startAt: string; providerId?: string; enforceCutoff?: boolean; contactId?: string; offeredServiceId?: string },
  ): Promise<BookingResult> {
    const booking = await this.db.booking.findFirst({ where: { id: bookingId, orgId, ...(input.contactId ? { contactId: input.contactId } : {}) }, include: INCLUDE });
    if (!booking || booking.status === "CANCELLED") return { ok: false, reason: "NOT_FOUND", message: "No such booking." };
    if (input.offeredServiceId && input.offeredServiceId !== booking.serviceId) {
      return { ok: false, reason: "INVALID", message: `The slot was checked for a different service. Call check_availability with serviceId ${booking.serviceId}.` };
    }
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: orgId } });
    const rules = BookingRulesSchema.parse(org.bookingRules ?? {});
    if (input.enforceCutoff && booking.startAt.getTime() - Date.now() < rules.cancellationCutoffHours * 3_600_000) {
      return { ok: false, reason: "TOO_LATE_TO_CHANGE", message: `Changes need ${rules.cancellationCutoffHours} hours' notice. Offer to hand off to a team member.` };
    }
    const providerId = input.providerId ?? booking.providerId;
    const provider = await this.db.provider.findFirst({ where: { id: providerId, orgId } });
    if (!provider) return { ok: false, reason: "INVALID", message: "Unknown provider." };
    const range = busyRangeFor(input.startAt, booking.service.durationMinutes, booking.service.bufferBeforeMinutes, booking.service.bufferAfterMinutes);
    try {
      const updated = await this.db.booking.update({
        where: { id: booking.id },
        data: {
          providerId,
          startAt: new Date(range.startAt),
          endAt: new Date(range.endAt),
          busyStartAt: new Date(range.busyStartAt),
          busyEndAt: new Date(range.busyEndAt),
          confirmedByCustomerAt: null,
        },
        include: INCLUDE,
      });
      await this.reminders.rescheduleForBooking(updated.id).catch((e) => this.log.error(`reminder rescheduling failed for ${updated.id}: ${(e as Error).message}`));
      await this.analytics.record(orgId, "BOOKING_RESCHEDULED", {}, updated.conversationId ?? undefined, updated.id);
      await this.touchContactMemory(updated, org.timezone);
      return { ok: true, booking: this.profiles.bookingSummary(updated, org.timezone) };
    } catch (e) {
      if (isSlotTakenError(e)) return { ok: false, reason: "SLOT_TAKEN", message: "That slot was just taken." };
      throw e;
    }
  }

  async cancel(orgId: string, bookingId: string, input: { reason?: string; contactId?: string; enforceCutoff?: boolean }) {
    const booking = await this.db.booking.findFirst({ where: { id: bookingId, orgId, ...(input.contactId ? { contactId: input.contactId } : {}) }, include: INCLUDE });
    if (!booking) return { ok: false, reason: "NOT_FOUND", message: "No such booking." };
    if (booking.status === "CANCELLED") return { ok: true, booking: await this.summaryOf(booking) };
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: orgId } });
    const rules = BookingRulesSchema.parse(org.bookingRules ?? {});
    if (input.enforceCutoff && booking.startAt.getTime() - Date.now() < rules.cancellationCutoffHours * 3_600_000) {
      return { ok: false, reason: "TOO_LATE_TO_CHANGE", message: `Cancellations need ${rules.cancellationCutoffHours} hours' notice. Offer to hand off to a team member.` };
    }
    const updated = await this.db.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason ?? null }, include: INCLUDE });
    await this.reminders.cancelForBooking(updated.id);
    await this.analytics.record(orgId, "BOOKING_CANCELLED", { reason: input.reason ?? null }, updated.conversationId ?? undefined, updated.id);
    return { ok: true, booking: this.profiles.bookingSummary(updated, org.timezone) };
  }

  async confirmByCustomer(orgId: string, bookingId: string, contactId: string) {
    const booking = await this.db.booking.findFirst({ where: { id: bookingId, orgId, contactId }, include: INCLUDE });
    if (!booking || booking.status === "CANCELLED") return { ok: false, message: "No such booking." };
    const updated = await this.db.booking.update({ where: { id: booking.id }, data: { confirmedByCustomerAt: new Date() }, include: INCLUDE });
    await this.analytics.record(orgId, "BOOKING_CONFIRMED_BY_CUSTOMER", {}, updated.conversationId ?? undefined, updated.id);
    return { ok: true, booking: await this.summaryOf(updated) };
  }

  async setStatus(orgId: string, bookingId: string, status: BookingStatus) {
    const booking = await this.db.booking.findFirst({ where: { id: bookingId, orgId } });
    if (!booking) throw new NotFoundException("Booking not found");
    const updated = await this.db.booking.update({ where: { id: bookingId }, data: { status }, include: INCLUDE });
    if (status === "COMPLETED" || status === "NO_SHOW") await this.reminders.afterVisit(updated.id, status);
    return updated;
  }

  async list(orgId: string, q: { from?: string; to?: string; providerId?: string; status?: string; contactId?: string }) {
    return this.db.booking.findMany({
      where: {
        orgId,
        ...(q.from ? { endAt: { gt: new Date(q.from) } } : {}),
        ...(q.to ? { startAt: { lt: new Date(q.to) } } : {}),
        ...(q.providerId ? { providerId: q.providerId } : {}),
        ...(q.status ? { status: q.status as BookingStatus } : {}),
        ...(q.contactId ? { contactId: q.contactId } : {}),
      },
      include: INCLUDE,
      orderBy: { startAt: "asc" },
    });
  }

  async upcomingForContact(orgId: string, contactId: string, includePast = false) {
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: orgId } });
    const rows = await this.db.booking.findMany({
      where: { orgId, contactId, status: { not: "CANCELLED" }, ...(includePast ? {} : { endAt: { gte: new Date() } }) },
      include: INCLUDE,
      orderBy: { startAt: "asc" },
      take: 10,
    });
    return rows.map((b) => this.profiles.bookingSummary(b, org.timezone));
  }

  serialize(b: BookingWithRelations) {
    return {
      id: b.id,
      status: b.status,
      source: b.source,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      notes: b.notes,
      cancelReason: b.cancelReason,
      confirmedByCustomerAt: b.confirmedByCustomerAt?.toISOString() ?? null,
      contact: { id: b.contact.id, name: b.contact.name, phoneE164: b.contact.phoneE164 },
      service: { id: b.service.id, name: b.service.name, durationMinutes: b.service.durationMinutes },
      provider: { id: b.provider.id, name: b.provider.name, color: b.provider.color },
      conversationId: b.conversationId,
      createdAt: b.createdAt.toISOString(),
    };
  }

  private async summaryOf(b: BookingWithRelations) {
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: b.orgId } });
    return this.profiles.bookingSummary(b, org.timezone);
  }

  private async touchContactMemory(b: BookingWithRelations, timezone: string) {
    const memory = this.profiles.memoryOf(b.contact);
    memory.isReturning = true;
    memory.lastBookingSummary = `${b.service.name} on ${this.profiles.bookingSummary(b, timezone).label} with ${b.provider.name}`;
    await this.db.contact.update({ where: { id: b.contactId }, data: { memory } });
  }

  throwIfTaken(result: BookingResult): asserts result is Extract<BookingResult, { ok: true }> {
    if (!result.ok) {
      if (result.reason === "SLOT_TAKEN") throw new ConflictException({ statusCode: 409, reason: "SLOT_TAKEN", message: result.message, alternatives: result.alternatives ?? [] });
      if (result.reason === "NOT_FOUND") throw new NotFoundException({ statusCode: 404, reason: result.reason, message: result.message });
      throw new BadRequestException({ statusCode: 400, reason: result.reason, message: result.message });
    }
  }
}
