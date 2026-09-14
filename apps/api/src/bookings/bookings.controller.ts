import { Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { BOOKING_STATUSES } from "@ar/shared";
import { z } from "zod";
import { OrgGuard } from "../auth/guards.js";
import { IsoDate, IsoInstant, parseBody, parseQuery } from "../common/http.js";
import { PrismaService } from "../common/prisma.service.js";
import { BookingsService } from "./bookings.service.js";

const CreateSchema = z
  .object({
    serviceId: z.string().min(1),
    providerId: z.string().min(1),
    startAt: z.string().datetime({ offset: true }),
    notes: z.string().max(1000).optional(),
    contactId: z.string().optional(),
    contact: z.object({ phoneE164: z.string().min(5), name: z.string().max(120).optional() }).optional(),
  })
  .refine((b) => b.contactId || b.contact, "contactId or contact is required");
const UpdateSchema = z.object({
  startAt: z.string().datetime({ offset: true }).optional(),
  providerId: z.string().optional(),
  notes: z.string().max(1000).nullable().optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
});
const CancelSchema = z.object({ reason: z.string().max(300).optional() });
const ListQuerySchema = z.object({ from: IsoInstant.optional(), to: IsoInstant.optional(), providerId: z.string().optional(), status: z.enum(BOOKING_STATUSES).optional(), contactId: z.string().optional() });
const AvailabilityQuerySchema = z.object({ serviceId: z.string().min(1), providerId: z.string().optional(), fromDate: IsoDate, toDate: IsoDate.optional() });

@Controller("orgs/:orgId")
@UseGuards(OrgGuard)
export class BookingsController {
  constructor(
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Get("bookings")
  async list(@Param("orgId") orgId: string, @Query() query: Record<string, string | undefined>) {
    const q = parseQuery(ListQuerySchema, query);
    const rows = await this.bookings.list(orgId, q);
    return rows.map((b) => this.bookings.serialize(b));
  }

  @Post("bookings")
  async create(@Param("orgId") orgId: string, @Body() body: unknown) {
    const input = parseBody(CreateSchema, body);
    let contactId = input.contactId;
    if (!contactId && input.contact) {
      const c = await this.prisma.client.contact.upsert({
        where: { orgId_phoneE164: { orgId, phoneE164: normalizePhone(input.contact.phoneE164) } },
        create: { orgId, phoneE164: normalizePhone(input.contact.phoneE164), name: input.contact.name },
        update: input.contact.name ? { name: input.contact.name } : {},
      });
      contactId = c.id;
    }
    const result = await this.bookings.create(orgId, { contactId: contactId!, serviceId: input.serviceId, providerId: input.providerId, startAt: input.startAt, notes: input.notes, source: "MANUAL" });
    this.bookings.throwIfTaken(result);
    const row = await this.prisma.client.booking.findUniqueOrThrow({ where: { id: result.booking.id }, include: { service: true, provider: true, contact: true } });
    return this.bookings.serialize(row);
  }

  @Patch("bookings/:id")
  async update(@Param("orgId") orgId: string, @Param("id") id: string, @Body() body: unknown) {
    const input = parseBody(UpdateSchema, body);
    const existing = await this.prisma.client.booking.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException("Booking not found");
    if (input.startAt || input.providerId) {
      const r = await this.bookings.reschedule(orgId, id, { startAt: input.startAt ?? existing.startAt.toISOString(), providerId: input.providerId });
      this.bookings.throwIfTaken(r);
    }
    if (input.status === "CANCELLED") {
      await this.bookings.cancel(orgId, id, {});
    } else if (input.status) {
      await this.bookings.setStatus(orgId, id, input.status);
    }
    if (input.notes !== undefined) await this.prisma.client.booking.update({ where: { id }, data: { notes: input.notes } });
    const row = await this.prisma.client.booking.findUniqueOrThrow({ where: { id }, include: { service: true, provider: true, contact: true } });
    return this.bookings.serialize(row);
  }

  @Post("bookings/:id/cancel")
  async cancel(@Param("orgId") orgId: string, @Param("id") id: string, @Body() body: unknown) {
    const input = parseBody(CancelSchema, body);
    const r = await this.bookings.cancel(orgId, id, { reason: input.reason });
    if (!r.ok) throw new NotFoundException(r.message);
    const row = await this.prisma.client.booking.findUniqueOrThrow({ where: { id }, include: { service: true, provider: true, contact: true } });
    return this.bookings.serialize(row);
  }

  @Get("availability")
  async availability(@Param("orgId") orgId: string, @Query() query: Record<string, string | undefined>) {
    const q = parseQuery(AvailabilityQuerySchema, query);
    return this.bookings.availability(orgId, q);
  }

  @Get("scheduled-messages")
  async scheduled(@Param("orgId") orgId: string, @Query("bookingId") bookingId?: string) {
    const rows = await this.prisma.client.scheduledMessage.findMany({ where: { orgId, ...(bookingId ? { bookingId } : {}) }, orderBy: { runAt: "asc" }, take: 200 });
    return rows.map((r) => ({ id: r.id, bookingId: r.bookingId, contactId: r.contactId, kind: r.kind, templateName: r.templateName, runAt: r.runAt.toISOString(), status: r.status, sentAt: r.sentAt?.toISOString() ?? null, error: r.error }));
  }
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}
