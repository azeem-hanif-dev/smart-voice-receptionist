import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ConversationStatus } from "@ar/shared";
import { PrismaService } from "../common/prisma.service.js";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { OutboundService } from "../inbound/outbound.service.js";
import { BookingsService } from "../bookings/bookings.service.js";

@Injectable()
export class ConversationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OutboundService) private readonly outbound: OutboundService,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
  ) {}
  private get db() {
    return this.prisma.client;
  }

  async list(orgId: string, q: { status?: string; q?: string }) {
    const rows = await this.db.conversation.findMany({
      where: {
        orgId,
        ...(q.status ? { status: q.status as ConversationStatus } : {}),
        ...(q.q ? { OR: [{ contact: { name: { contains: q.q, mode: "insensitive" } } }, { contact: { phoneE164: { contains: q.q } } }, { lastMessagePreview: { contains: q.q, mode: "insensitive" } }] } : {}),
      },
      include: { contact: { select: { id: true, name: true, phoneE164: true } } },
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
    });
    return rows.map(summarize);
  }

  async get(orgId: string, id: string) {
    const conv = await this.db.conversation.findFirst({ where: { id, orgId }, include: { contact: true, messages: { orderBy: { createdAt: "asc" } } } });
    if (!conv) throw new NotFoundException("Conversation not found");
    const bookings = await this.bookings.list(orgId, { contactId: conv.contactId });
    return {
      conversation: summarize(conv),
      contact: { id: conv.contact.id, name: conv.contact.name, phoneE164: conv.contact.phoneE164, language: conv.contact.language, memory: conv.contact.memory, optedOut: conv.contact.optedOut },
      messages: conv.messages
        .filter((m) => m.role !== "TOOL" && (m.text || m.role === "USER"))
        .map((m) => ({ id: m.id, role: m.role, direction: m.direction, text: m.text ?? "", buttons: m.buttons ?? undefined, templateName: m.templateName ?? undefined, deliveryStatus: m.deliveryStatus, authorUserId: m.authorUserId, createdAt: m.createdAt.toISOString() })),
      bookings: bookings.map((b) => this.bookings.serialize(b)),
    };
  }

  async takeover(orgId: string, id: string, userId: string) {
    const conv = await this.ensure(orgId, id);
    const updated = await this.db.conversation.update({ where: { id: conv.id }, data: { status: "HUMAN", assignedUserId: userId, handoffReason: conv.handoffReason ?? "Taken over from the dashboard", handoffAt: conv.handoffAt ?? new Date() }, include: { contact: { select: { id: true, name: true, phoneE164: true } } } });
    if (conv.status !== "HUMAN") await this.analytics.record(orgId, "HANDOFF", { by: "staff" }, id);
    return summarize(updated);
  }

  async handback(orgId: string, id: string) {
    await this.ensure(orgId, id);
    const updated = await this.db.conversation.update({ where: { id }, data: { status: "AI", assignedUserId: null, handoffReason: null }, include: { contact: { select: { id: true, name: true, phoneE164: true } } } });
    await this.analytics.record(orgId, "HANDBACK", {}, id);
    await this.db.message.create({ data: { conversationId: id, direction: "OUTBOUND", role: "SYSTEM", content: [{ type: "text", text: "A staff member handed the conversation back to the AI assistant." }], text: "Conversation handed back to the AI." } });
    return summarize(updated);
  }

  async close(orgId: string, id: string) {
    await this.ensure(orgId, id);
    const updated = await this.db.conversation.update({ where: { id }, data: { status: "CLOSED" }, include: { contact: { select: { id: true, name: true, phoneE164: true } } } });
    return summarize(updated);
  }

  async markRead(orgId: string, id: string) {
    await this.ensure(orgId, id);
    await this.db.conversation.update({ where: { id }, data: { unreadCount: 0 } });
    return { ok: true };
  }

  async staffMessage(orgId: string, id: string, userId: string, text: string) {
    const conv = await this.ensure(orgId, id);
    if (conv.status === "AI") {
      await this.db.conversation.update({ where: { id }, data: { status: "HUMAN", assignedUserId: userId, handoffReason: "Staff replied from the inbox", handoffAt: new Date() } });
      await this.analytics.record(orgId, "HANDOFF", { by: "staff_reply" }, id);
    }
    const row = await this.outbound.send(id, { text }, { role: "STAFF", authorUserId: userId });
    return { id: row.id, role: row.role, direction: row.direction, text: row.text, createdAt: row.createdAt.toISOString(), authorUserId: row.authorUserId, deliveryStatus: row.deliveryStatus };
  }

  private async ensure(orgId: string, id: string) {
    const conv = await this.db.conversation.findFirst({ where: { id, orgId } });
    if (!conv) throw new NotFoundException("Conversation not found");
    return conv;
  }
}

function summarize(c: { id: string; channel: string; status: string; handoffReason: string | null; handoffAt: Date | null; assignedUserId: string | null; lastMessagePreview: string | null; lastMessageAt: Date | null; unreadCount: number; createdAt: Date; contact: { id: string; name: string | null; phoneE164: string } }) {
  return {
    id: c.id,
    channel: c.channel,
    status: c.status,
    handoffReason: c.handoffReason,
    handoffAt: c.handoffAt?.toISOString() ?? null,
    assignedUserId: c.assignedUserId,
    lastMessagePreview: c.lastMessagePreview,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    unreadCount: c.unreadCount,
    createdAt: c.createdAt.toISOString(),
    contact: c.contact,
  };
}
