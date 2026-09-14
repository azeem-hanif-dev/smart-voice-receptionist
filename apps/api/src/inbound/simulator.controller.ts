import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post, Query, UseGuards } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { OrgGuard } from "../auth/guards.js";
import { parseBody } from "../common/http.js";
import { PrismaService } from "../common/prisma.service.js";
import { hasAnthropicKey } from "../config.js";
import { ConversationsService } from "../conversations/conversations.service.js";
import { normalizePhone } from "../bookings/bookings.controller.js";
import { RemindersService, reminderJobId } from "../queues/reminders.service.js";
import { WorkersService } from "../queues/workers.service.js";
import { InboundService } from "./inbound.service.js";

const MessageSchema = z.object({ phoneE164: z.string().min(5), text: z.string().max(4000).default(""), buttonId: z.string().max(256).optional(), displayName: z.string().max(100).optional() });
const PhoneSchema = z.object({ phoneE164: z.string().min(5) });
const ReminderSchema = z.object({ bookingId: z.string().min(1), kind: z.enum(["CONFIRMATION", "REMINDER_24H", "REMINDER_2H", "NO_SHOW_FOLLOWUP", "REBOOK_NUDGE"]) });

@Controller("orgs/:orgId/simulator")
@UseGuards(OrgGuard)
export class SimulatorController {
  constructor(
    @Inject(InboundService) private readonly inbound: InboundService,
    @Inject(ConversationsService) private readonly conversations: ConversationsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RemindersService) private readonly reminders: RemindersService,
    @Inject(WorkersService) private readonly workers: WorkersService,
  ) {}

  @Post("messages")
  async message(@Param("orgId") orgId: string, @Body() body: unknown) {
    const input = parseBody(MessageSchema, body);
    if (!input.text && !input.buttonId) throw new BadRequestException("text or buttonId is required");
    const result = await this.inbound.handle({
      channel: "SIMULATOR",
      orgId,
      providerMessageId: `sim-${randomUUID()}`,
      from: { phoneE164: normalizePhone(input.phoneE164), displayName: input.displayName },
      kind: input.buttonId ? "button" : "text",
      text: input.text,
      buttonId: input.buttonId,
      receivedAt: new Date().toISOString(),
    });
    return { conversationId: result.conversationId, status: result.status, replies: result.replies, handoff: result.handoff, modelMode: hasAnthropicKey() ? "anthropic" : "demo" };
  }

  @Get("conversation")
  async conversation(@Param("orgId") orgId: string, @Query("phoneE164") phone?: string) {
    if (!phone) throw new BadRequestException("phoneE164 is required");
    const contact = await this.prisma.client.contact.findUnique({ where: { orgId_phoneE164: { orgId, phoneE164: normalizePhone(phone) } } });
    if (!contact) return { conversation: null };
    const conv = await this.prisma.client.conversation.findFirst({ where: { orgId, contactId: contact.id, channel: "SIMULATOR" }, orderBy: { createdAt: "desc" } });
    if (!conv) return { conversation: null };
    return this.conversations.get(orgId, conv.id);
  }

  @Post("reset")
  async reset(@Param("orgId") orgId: string, @Body() body: unknown) {
    const { phoneE164 } = parseBody(PhoneSchema, body);
    const contact = await this.prisma.client.contact.findUnique({ where: { orgId_phoneE164: { orgId, phoneE164: normalizePhone(phoneE164) } } });
    if (contact) {
      const bookings = await this.prisma.client.booking.findMany({ where: { contactId: contact.id } });
      for (const b of bookings) await this.reminders.cancelForBooking(b.id);
      await this.prisma.client.contact.delete({ where: { id: contact.id } });
    }
    return { ok: true };
  }

  /** Demo helper: deliver a reminder for a booking right now instead of waiting for its scheduled time. */
  @Post("send-reminder")
  async sendReminder(@Param("orgId") orgId: string, @Body() body: unknown) {
    const { bookingId, kind } = parseBody(ReminderSchema, body);
    const booking = await this.prisma.client.booking.findFirst({ where: { id: bookingId, orgId } });
    if (!booking) throw new NotFoundException("Booking not found");
    const row = await this.prisma.client.scheduledMessage.findUnique({ where: { jobId: reminderJobId(bookingId, kind) } });
    if (!row) throw new NotFoundException(`No ${kind} scheduled for this booking`);
    const sent = await this.workers.deliverScheduled(row.id, { force: true });
    return { ok: sent.sent, reason: sent.reason };
  }
}
