import { Inject, Injectable } from "@nestjs/common";
import { DateTime } from "luxon";
import type { AnalyticsEventType } from "@ar/shared";
import { PrismaService } from "../common/prisma.service.js";

@Injectable()
export class AnalyticsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private get db() {
    return this.prisma.client;
  }

  async record(orgId: string, type: AnalyticsEventType, meta: Record<string, unknown> = {}, conversationId?: string, bookingId?: string) {
    await this.db.analyticsEvent.create({ data: { orgId, type, meta: meta as object, conversationId: conversationId ?? null, bookingId: bookingId ?? null } });
  }

  async summary(orgId: string, days: number) {
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: orgId } });
    const to = DateTime.now().setZone(org.timezone).endOf("day");
    const from = to.minus({ days: days - 1 }).startOf("day");
    const range = { gte: from.toJSDate(), lte: to.toJSDate() };

    const [conversations, events, bookings] = await Promise.all([
      this.db.conversation.findMany({ where: { orgId, createdAt: range }, select: { id: true, createdAt: true } }),
      this.db.analyticsEvent.findMany({ where: { orgId, createdAt: range }, select: { type: true, meta: true, createdAt: true, conversationId: true } }),
      this.db.booking.findMany({ where: { orgId, createdAt: range }, select: { source: true, status: true, createdAt: true } }),
    ]);
    const count = (t: string) => events.filter((e) => e.type === t).length;
    // First response: the AI's reply to the first message of each conversation started in the range.
    const responseTimes = events
      .filter((e) => e.type === "AI_REPLIED" && (e.meta as { started?: boolean })?.started)
      .map((e) => (e.meta as { responseMs?: number })?.responseMs)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
      .sort((a, b) => a - b);
    const median = responseTimes.length
      ? responseTimes.length % 2
        ? responseTimes[(responseTimes.length - 1) / 2]
        : Math.round((responseTimes[responseTimes.length / 2 - 1] + responseTimes[responseTimes.length / 2]) / 2)
      : null;
    // Handoff rate: share of conversations started in the range that were handed to a human at least once.
    const convIds = new Set(conversations.map((c) => c.id));
    const handedOff = new Set(events.filter((e) => e.type === "HANDOFF" && e.conversationId && convIds.has(e.conversationId)).map((e) => e.conversationId));
    const handoffs = handedOff.size;

    const series: { date: string; conversations: number; bookings: number }[] = [];
    for (let d = from; d <= to; d = d.plus({ days: 1 })) {
      const dayStart = d.toJSDate().getTime();
      const dayEnd = d.endOf("day").toJSDate().getTime();
      series.push({
        date: d.toISODate()!,
        conversations: conversations.filter((c) => c.createdAt.getTime() >= dayStart && c.createdAt.getTime() <= dayEnd).length,
        bookings: bookings.filter((b) => b.createdAt.getTime() >= dayStart && b.createdAt.getTime() <= dayEnd && b.status !== "CANCELLED").length,
      });
    }
    return {
      days,
      from: from.toISO(),
      to: to.toISO(),
      timezone: org.timezone,
      conversations: conversations.length,
      aiReplies: count("AI_REPLIED"),
      bookingsByAi: bookings.filter((b) => b.source === "AI").length,
      bookingsManual: bookings.filter((b) => b.source === "MANUAL").length,
      remindersSent: count("REMINDER_SENT"),
      customerConfirmations: count("BOOKING_CONFIRMED_BY_CUSTOMER"),
      cancellations: count("BOOKING_CANCELLED"),
      reschedules: count("BOOKING_RESCHEDULED"),
      handoffs,
      handoffRate: conversations.length ? handoffs / conversations.length : null,
      medianFirstResponseMs: median,
      guardrailBlocks: count("GUARDRAIL_BLOCKED"),
      modelErrors: count("MODEL_ERROR"),
      series,
    };
  }
}
