import { Inject, Injectable, Logger } from "@nestjs/common";
import type { InboundMessage, OutboundMessage } from "@ar/shared";
import { Prisma } from "@ar/db";
import { PrismaService } from "../common/prisma.service.js";
import { RedisService } from "../common/redis.service.js";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { EngineService } from "../engine/engine.service.js";
import { ChannelRegistry } from "./channels.js";
import { OutboundService } from "./outbound.service.js";
import { NotificationsService } from "./notifications.service.js";

export interface InboundResult {
  duplicate: boolean;
  conversationId: string | null;
  status: "AI" | "HUMAN" | "CLOSED" | null;
  replies: OutboundMessage[];
  handoff?: { reason: string; urgency: string };
}

/**
 * The single inbound pipeline used by every channel:
 * dedupe → contact/conversation upsert → per-conversation lock → engine (unless a human owns it) → deliver.
 */
@Injectable()
export class InboundService {
  private readonly log = new Logger(InboundService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(EngineService) private readonly engine: EngineService,
    @Inject(OutboundService) private readonly outbound: OutboundService,
    @Inject(ChannelRegistry) private readonly channels: ChannelRegistry,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}
  private get db() {
    return this.prisma.client;
  }

  /** Idempotent: a second delivery of the same provider message id is a no-op. */
  async recordEvent(provider: InboundMessage["channel"], eventId: string, payload: unknown): Promise<boolean> {
    try {
      await this.db.webhookEvent.create({ data: { provider, eventId, payload: payload as Prisma.InputJsonValue } });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
      throw e;
    }
  }

  /**
   * @param opts.alreadyRecorded the webhook controller stored the WebhookEvent before enqueueing; skip dedupe.
   */
  async handle(msg: InboundMessage, opts: { now?: string; alreadyRecorded?: boolean } = {}): Promise<InboundResult> {
    if (!opts.alreadyRecorded) {
      const fresh = await this.recordEvent(msg.channel, msg.providerMessageId, msg);
      if (!fresh) {
        this.log.log(`duplicate inbound ${msg.channel}:${msg.providerMessageId} ignored`);
        return { duplicate: true, conversationId: null, status: null, replies: [] };
      }
    }
    const receivedAt = Date.parse(msg.receivedAt) || Date.now();

    const contact = await this.db.contact.upsert({
      where: { orgId_phoneE164: { orgId: msg.orgId, phoneE164: msg.from.phoneE164 } },
      create: { orgId: msg.orgId, phoneE164: msg.from.phoneE164, name: msg.from.displayName ?? null },
      update: {},
    });
    // One lock per contact+channel: it serialises engine turns AND conversation creation.
    const release = await this.redis.lockWithRetry(lockKey(contact.id, msg.channel), 90_000, 60_000);
    try {
      let conversation = await this.db.conversation.findFirst({
        where: { orgId: msg.orgId, contactId: contact.id, channel: msg.channel, status: { not: "CLOSED" } },
        orderBy: { createdAt: "desc" },
      });
      let started = false;
      if (!conversation) {
        conversation = await this.db.conversation.create({
          data: { orgId: msg.orgId, contactId: contact.id, channel: msg.channel, externalThreadId: msg.externalThreadId ?? null },
        });
        started = true;
        await this.analytics.record(msg.orgId, "CONVERSATION_STARTED", { channel: msg.channel }, conversation.id);
      }
      const conversationId = conversation.id;
      const inboundText = msg.text || (msg.kind === "unsupported" ? "[unsupported message type]" : "");
      await this.db.conversation.update({
        where: { id: conversationId },
        data: { lastInboundAt: new Date(receivedAt), lastMessageAt: new Date(receivedAt), lastMessagePreview: inboundText.slice(0, 140), unreadCount: { increment: 1 } },
      });

      if (conversation.status === "HUMAN") {
        // Store the customer's message for staff; the AI stays paused.
        await this.db.message.create({
          data: { conversationId, direction: "INBOUND", role: "USER", content: [{ type: "text", text: inboundText }], text: inboundText, providerMessageId: msg.providerMessageId },
        });
        return { duplicate: false, conversationId, status: "HUMAN", replies: [] };
      }

      const adapter = this.channels.get(msg.channel);
      const output = await this.engine.run(conversationId, { text: inboundText, buttonId: msg.buttonId }, { channelSupportsButtons: adapter.supportsButtons, now: opts.now });
      // Attach the provider message id to the stored inbound row for traceability.
      const userRow = await this.db.message.findFirst({ where: { conversationId, role: "USER", providerMessageId: null }, orderBy: { createdAt: "desc" } });
      if (userRow) await this.db.message.update({ where: { id: userRow.id }, data: { providerMessageId: msg.providerMessageId } }).catch(() => undefined);

      const final = EngineService.finalAssistantMessage(output);
      for (const reply of output.replies) {
        await this.outbound.send(conversationId, reply, { role: "ASSISTANT", stored: final });
      }
      if (output.replies.length) {
        await this.analytics.record(msg.orgId, "AI_REPLIED", { responseMs: Date.now() - receivedAt, started, modelCalls: output.usage.modelCalls }, conversationId);
      }
      const status = output.handoff ? "HUMAN" : "AI";
      if (output.handoff) await this.notifications.notifyHandoff(msg.orgId, conversationId, contact, output.handoff);
      return { duplicate: false, conversationId, status, replies: output.replies, handoff: output.handoff };
    } finally {
      await release();
    }
  }
}

export function lockKey(contactId: string, channel: string): string {
  return `lock:contact:${contactId}:${channel}`;
}
