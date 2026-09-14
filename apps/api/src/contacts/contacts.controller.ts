import { Body, Controller, Get, Inject, NotFoundException, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ContactMemorySchema } from "@ar/shared";
import { z } from "zod";
import { OrgGuard } from "../auth/guards.js";
import { parseBody } from "../common/http.js";
import { PrismaService } from "../common/prisma.service.js";
import { BookingsService } from "../bookings/bookings.service.js";

const PatchSchema = z.object({ name: z.string().max(120).nullable().optional(), email: z.string().email().nullable().optional(), language: z.string().max(10).nullable().optional(), optedOut: z.boolean().optional(), memory: ContactMemorySchema.partial().optional() });

@Controller("orgs/:orgId/contacts")
@UseGuards(OrgGuard)
export class ContactsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
  ) {}
  private get db() {
    return this.prisma.client;
  }

  @Get()
  async list(@Param("orgId") orgId: string, @Query("q") q?: string) {
    const rows = await this.db.contact.findMany({
      where: { orgId, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phoneE164: { contains: q } }] } : {}) },
      include: { _count: { select: { bookings: true, conversations: true } }, conversations: { orderBy: { lastMessageAt: "desc" }, take: 1, select: { lastMessageAt: true, status: true } } },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    return rows.map((c) => ({
      id: c.id,
      phoneE164: c.phoneE164,
      name: c.name,
      email: c.email,
      language: c.language,
      memory: c.memory,
      optedOut: c.optedOut,
      bookingsCount: c._count.bookings,
      conversationsCount: c._count.conversations,
      lastConversationAt: c.conversations[0]?.lastMessageAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  @Get(":id")
  async get(@Param("orgId") orgId: string, @Param("id") id: string) {
    const c = await this.db.contact.findFirst({ where: { id, orgId }, include: { conversations: { orderBy: { createdAt: "desc" }, select: { id: true, channel: true, status: true, lastMessagePreview: true, lastMessageAt: true, createdAt: true, handoffReason: true } } } });
    if (!c) throw new NotFoundException("Contact not found");
    const bookings = await this.bookings.list(orgId, { contactId: id });
    return {
      id: c.id,
      phoneE164: c.phoneE164,
      name: c.name,
      email: c.email,
      language: c.language,
      memory: c.memory,
      optedOut: c.optedOut,
      createdAt: c.createdAt.toISOString(),
      conversations: c.conversations.map((x) => ({ ...x, lastMessageAt: x.lastMessageAt?.toISOString() ?? null, createdAt: x.createdAt.toISOString() })),
      bookings: bookings.map((b) => this.bookings.serialize(b)).sort((a, b) => b.startAt.localeCompare(a.startAt)),
    };
  }

  @Patch(":id")
  async patch(@Param("orgId") orgId: string, @Param("id") id: string, @Body() body: unknown) {
    const input = parseBody(PatchSchema, body);
    const c = await this.db.contact.findFirst({ where: { id, orgId } });
    if (!c) throw new NotFoundException("Contact not found");
    const memory = input.memory ? ContactMemorySchema.parse({ ...(c.memory as object), ...input.memory }) : undefined;
    const updated = await this.db.contact.update({ where: { id }, data: { name: input.name, email: input.email, language: input.language, optedOut: input.optedOut, ...(memory ? { memory } : {}) } });
    return { id: updated.id, phoneE164: updated.phoneE164, name: updated.name, email: updated.email, language: updated.language, memory: updated.memory, optedOut: updated.optedOut };
  }
}
