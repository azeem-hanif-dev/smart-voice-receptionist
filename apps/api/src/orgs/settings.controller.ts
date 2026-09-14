import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ROLES } from "@ar/shared";
import argon2 from "argon2";
import { z } from "zod";
import { OrgGuard, OwnerOnly } from "../auth/guards.js";
import { RangeQuerySchema, parseBody, parseQuery } from "../common/http.js";
import { PrismaService } from "../common/prisma.service.js";

const WorkingHoursSchema = z.array(
  z.object({ weekday: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) }).refine((h) => h.endMinute > h.startMinute, "endMinute must be after startMinute"),
);

const ServiceSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  durationMinutes: z.number().int().min(5).max(600),
  bufferBeforeMinutes: z.number().int().min(0).max(120).optional(),
  bufferAfterMinutes: z.number().int().min(0).max(120).optional(),
  priceCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  providerIds: z.array(z.string()).optional(),
});
const ProviderSchema = z.object({
  name: z.string().min(1).max(120),
  title: z.string().max(120).nullable().optional(),
  active: z.boolean().optional(),
  color: z.string().max(20).nullable().optional(),
  serviceIds: z.array(z.string()).optional(),
  workingHours: WorkingHoursSchema.optional(),
});
const FaqSchema = z.object({ question: z.string().min(1).max(300), answer: z.string().min(1).max(2000), keywords: z.array(z.string()).optional(), sortOrder: z.number().int().optional() });
const HolidaySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().min(1).max(120) });
const BlockedSchema = z.object({ providerId: z.string().nullable().optional(), startAt: z.string().datetime({ offset: true }), endAt: z.string().datetime({ offset: true }), reason: z.string().max(200).optional() }).refine((b) => Date.parse(b.endAt) > Date.parse(b.startAt), "endAt must be after startAt");
const LocationSchema = z.object({ name: z.string().min(1).max(120), address: z.string().max(300).nullable().optional(), phone: z.string().max(40).nullable().optional() });
const MemberSchema = z.object({ email: z.string().email(), name: z.string().min(1).max(100), password: z.string().min(8).max(200), role: z.enum(ROLES) });

@Controller("orgs/:orgId")
@UseGuards(OrgGuard)
export class SettingsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private get db() {
    return this.prisma.client;
  }

  /* ---------------- services ---------------- */
  @Get("services")
  async services(@Param("orgId") orgId: string) {
    const rows = await this.db.service.findMany({ where: { orgId }, include: { providers: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    return rows.map(serializeService);
  }
  @Post("services")
  @UseGuards(OwnerOnly)
  async createService(@Param("orgId") orgId: string, @Body() body: unknown) {
    const { providerIds, ...data } = parseBody(ServiceSchema, body);
    await this.assertOwned("provider", orgId, providerIds);
    const row = await this.db.service.create({
      data: { ...data, orgId, providers: providerIds ? { create: providerIds.map((providerId) => ({ providerId })) } : undefined },
      include: { providers: true },
    });
    return serializeService(row);
  }
  @Patch("services/:id")
  @UseGuards(OwnerOnly)
  async updateService(@Param("orgId") orgId: string, @Param("id") id: string, @Body() body: unknown) {
    const { providerIds, ...data } = parseBody(ServiceSchema.partial(), body);
    await this.ensure(this.db.service.findFirst({ where: { id, orgId } }));
    await this.assertOwned("provider", orgId, providerIds);
    const row = await this.db.service.update({
      where: { id },
      data: { ...data, providers: providerIds ? { deleteMany: {}, create: providerIds.map((providerId) => ({ providerId })) } : undefined },
      include: { providers: true },
    });
    return serializeService(row);
  }
  @Delete("services/:id")
  @UseGuards(OwnerOnly)
  async deleteService(@Param("orgId") orgId: string, @Param("id") id: string) {
    await this.ensure(this.db.service.findFirst({ where: { id, orgId } }));
    const bookings = await this.db.booking.count({ where: { serviceId: id } });
    if (bookings > 0) await this.db.service.update({ where: { id }, data: { active: false } });
    else await this.db.service.delete({ where: { id } });
    return { ok: true, deactivated: bookings > 0 };
  }

  /* ---------------- providers ---------------- */
  @Get("providers")
  async providers(@Param("orgId") orgId: string) {
    const rows = await this.db.provider.findMany({ where: { orgId }, include: { services: true, workingHours: true }, orderBy: { createdAt: "asc" } });
    return rows.map(serializeProvider);
  }
  @Post("providers")
  @UseGuards(OwnerOnly)
  async createProvider(@Param("orgId") orgId: string, @Body() body: unknown) {
    const { serviceIds, workingHours, ...data } = parseBody(ProviderSchema, body);
    await this.assertOwned("service", orgId, serviceIds);
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: orgId } });
    const hours = workingHours ?? (org.businessHours as { weekday: number; startMinute: number; endMinute: number }[]);
    const services = serviceIds ?? (await this.db.service.findMany({ where: { orgId, active: true }, select: { id: true } })).map((s) => s.id);
    const row = await this.db.provider.create({
      data: {
        ...data,
        orgId,
        color: data.color ?? PALETTE[(await this.db.provider.count({ where: { orgId } })) % PALETTE.length],
        services: { create: services.map((serviceId) => ({ serviceId })) },
        workingHours: { create: hours },
      },
      include: { services: true, workingHours: true },
    });
    return serializeProvider(row);
  }
  @Patch("providers/:id")
  @UseGuards(OwnerOnly)
  async updateProvider(@Param("orgId") orgId: string, @Param("id") id: string, @Body() body: unknown) {
    const { serviceIds, workingHours, ...data } = parseBody(ProviderSchema.partial(), body);
    await this.ensure(this.db.provider.findFirst({ where: { id, orgId } }));
    await this.assertOwned("service", orgId, serviceIds);
    const row = await this.db.provider.update({
      where: { id },
      data: {
        ...data,
        services: serviceIds ? { deleteMany: {}, create: serviceIds.map((serviceId) => ({ serviceId })) } : undefined,
        workingHours: workingHours ? { deleteMany: {}, create: workingHours } : undefined,
      },
      include: { services: true, workingHours: true },
    });
    return serializeProvider(row);
  }
  @Delete("providers/:id")
  @UseGuards(OwnerOnly)
  async deleteProvider(@Param("orgId") orgId: string, @Param("id") id: string) {
    await this.ensure(this.db.provider.findFirst({ where: { id, orgId } }));
    const bookings = await this.db.booking.count({ where: { providerId: id } });
    if (bookings > 0) await this.db.provider.update({ where: { id }, data: { active: false } });
    else await this.db.provider.delete({ where: { id } });
    return { ok: true, deactivated: bookings > 0 };
  }

  /* ---------------- faqs ---------------- */
  @Get("faqs")
  faqs(@Param("orgId") orgId: string) {
    return this.db.faq.findMany({ where: { orgId }, orderBy: [{ sortOrder: "asc" }, { question: "asc" }] });
  }
  @Post("faqs")
  @UseGuards(OwnerOnly)
  createFaq(@Param("orgId") orgId: string, @Body() body: unknown) {
    return this.db.faq.create({ data: { ...parseBody(FaqSchema, body), orgId } });
  }
  @Patch("faqs/:id")
  @UseGuards(OwnerOnly)
  async updateFaq(@Param("orgId") orgId: string, @Param("id") id: string, @Body() body: unknown) {
    await this.ensure(this.db.faq.findFirst({ where: { id, orgId } }));
    return this.db.faq.update({ where: { id }, data: parseBody(FaqSchema.partial(), body) });
  }
  @Delete("faqs/:id")
  @UseGuards(OwnerOnly)
  async deleteFaq(@Param("orgId") orgId: string, @Param("id") id: string) {
    await this.ensure(this.db.faq.findFirst({ where: { id, orgId } }));
    await this.db.faq.delete({ where: { id } });
    return { ok: true };
  }

  /* ---------------- holidays ---------------- */
  @Get("holidays")
  holidays(@Param("orgId") orgId: string) {
    return this.db.holiday.findMany({ where: { orgId }, orderBy: { date: "asc" } });
  }
  @Post("holidays")
  @UseGuards(OwnerOnly)
  createHoliday(@Param("orgId") orgId: string, @Body() body: unknown) {
    const data = parseBody(HolidaySchema, body);
    return this.db.holiday.upsert({ where: { orgId_date: { orgId, date: data.date } }, create: { ...data, orgId }, update: { name: data.name } });
  }
  @Delete("holidays/:id")
  @UseGuards(OwnerOnly)
  async deleteHoliday(@Param("orgId") orgId: string, @Param("id") id: string) {
    await this.ensure(this.db.holiday.findFirst({ where: { id, orgId } }));
    await this.db.holiday.delete({ where: { id } });
    return { ok: true };
  }

  /* ---------------- blocked times ---------------- */
  @Get("blocked-times")
  blocked(@Param("orgId") orgId: string, @Query() query: Record<string, string | undefined>) {
    const { from, to } = parseQuery(RangeQuerySchema, query);
    return this.db.blockedTime.findMany({
      where: { orgId, ...(from && to ? { startAt: { lt: new Date(to) }, endAt: { gt: new Date(from) } } : {}) },
      include: { provider: { select: { id: true, name: true } } },
      orderBy: { startAt: "asc" },
    });
  }
  @Post("blocked-times")
  async createBlocked(@Param("orgId") orgId: string, @Body() body: unknown) {
    const data = parseBody(BlockedSchema, body);
    if (data.providerId) await this.assertOwned("provider", orgId, [data.providerId]);
    return this.db.blockedTime.create({
      data: { orgId, providerId: data.providerId ?? null, startAt: new Date(data.startAt), endAt: new Date(data.endAt), reason: data.reason },
      include: { provider: { select: { id: true, name: true } } },
    });
  }
  @Delete("blocked-times/:id")
  async deleteBlocked(@Param("orgId") orgId: string, @Param("id") id: string) {
    await this.ensure(this.db.blockedTime.findFirst({ where: { id, orgId } }));
    await this.db.blockedTime.delete({ where: { id } });
    return { ok: true };
  }

  /* ---------------- locations ---------------- */
  @Get("locations")
  locations(@Param("orgId") orgId: string) {
    return this.db.location.findMany({ where: { orgId } });
  }
  @Post("locations")
  @UseGuards(OwnerOnly)
  createLocation(@Param("orgId") orgId: string, @Body() body: unknown) {
    return this.db.location.create({ data: { ...parseBody(LocationSchema, body), orgId } });
  }
  @Patch("locations/:id")
  @UseGuards(OwnerOnly)
  async updateLocation(@Param("orgId") orgId: string, @Param("id") id: string, @Body() body: unknown) {
    await this.ensure(this.db.location.findFirst({ where: { id, orgId } }));
    return this.db.location.update({ where: { id }, data: parseBody(LocationSchema.partial(), body) });
  }
  @Delete("locations/:id")
  @UseGuards(OwnerOnly)
  async deleteLocation(@Param("orgId") orgId: string, @Param("id") id: string) {
    await this.ensure(this.db.location.findFirst({ where: { id, orgId } }));
    await this.db.location.delete({ where: { id } });
    return { ok: true };
  }

  /* ---------------- members ---------------- */
  @Get("members")
  async members(@Param("orgId") orgId: string) {
    const rows = await this.db.membership.findMany({ where: { orgId }, include: { user: true }, orderBy: { createdAt: "asc" } });
    return rows.map((m) => ({ userId: m.userId, email: m.user.email, name: m.user.name, role: m.role, createdAt: m.createdAt }));
  }
  @Post("members")
  @UseGuards(OwnerOnly)
  async addMember(@Param("orgId") orgId: string, @Body() body: unknown) {
    const input = parseBody(MemberSchema, body);
    const email = input.email.toLowerCase();
    let user = await this.db.user.findUnique({ where: { email } });
    if (!user) user = await this.db.user.create({ data: { email, name: input.name, passwordHash: await argon2.hash(input.password) } });
    const m = await this.db.membership.upsert({
      where: { userId_orgId: { userId: user.id, orgId } },
      create: { userId: user.id, orgId, role: input.role },
      update: { role: input.role },
    });
    return { userId: user.id, email: user.email, name: user.name, role: m.role, createdAt: m.createdAt };
  }
  @Delete("members/:userId")
  @UseGuards(OwnerOnly)
  async removeMember(@Param("orgId") orgId: string, @Param("userId") userId: string) {
    const owners = await this.db.membership.count({ where: { orgId, role: "OWNER" } });
    const target = await this.db.membership.findUnique({ where: { userId_orgId: { userId, orgId } } });
    if (!target) throw new NotFoundException("Member not found");
    if (target.role === "OWNER" && owners <= 1) throw new NotFoundException("Cannot remove the last owner");
    await this.db.membership.delete({ where: { userId_orgId: { userId, orgId } } });
    return { ok: true };
  }

  /** Every referenced id must belong to this organization (no cross-tenant links). */
  private async assertOwned(kind: "provider" | "service", orgId: string, ids?: string[]) {
    if (!ids || ids.length === 0) return;
    const unique = [...new Set(ids)];
    const count = kind === "provider" ? await this.db.provider.count({ where: { orgId, id: { in: unique } } }) : await this.db.service.count({ where: { orgId, id: { in: unique } } });
    if (count !== unique.length) throw new BadRequestException(`Unknown ${kind} id`);
  }

  private async ensure<T>(p: Promise<T | null>): Promise<T> {
    const row = await p;
    if (!row) throw new NotFoundException("Not found");
    return row;
  }
}

const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#dc2626", "#65a30d"];

function serializeService(s: { providers: { providerId: string }[] } & Record<string, unknown>) {
  const { providers, ...rest } = s;
  return { ...rest, providerIds: providers.map((p) => p.providerId) };
}
function serializeProvider(p: { services: { serviceId: string }[]; workingHours: { weekday: number; startMinute: number; endMinute: number }[] } & Record<string, unknown>) {
  const { services, workingHours, ...rest } = p;
  return { ...rest, serviceIds: services.map((s) => s.serviceId), workingHours: workingHours.map((h) => ({ weekday: h.weekday, startMinute: h.startMinute, endMinute: h.endMinute })) };
}
