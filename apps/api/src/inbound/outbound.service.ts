import { Inject, Injectable, Logger } from "@nestjs/common";
import type { OutboundMessage, QuickReply, ScheduledKind } from "@ar/shared";
import type { Prisma } from "@ar/db";
import type { StoredMessage } from "@ar/core";
import { PrismaService } from "../common/prisma.service.js";
import { ChannelRegistry } from "./channels.js";

const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Delivers a message through the conversation's channel and stores it. */
@Injectable()
export class OutboundService {
  private readonly log = new Logger(OutboundService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ChannelRegistry) private readonly channels: ChannelRegistry,
  ) {}
  private get db() {
    return this.prisma.client;
  }

  async send(
    conversationId: string,
    message: OutboundMessage,
    opts: { role: "ASSISTANT" | "STAFF" | "SYSTEM"; authorUserId?: string; stored?: StoredMessage; templateName?: string; kind?: ScheduledKind },
  ) {
    const conv = await this.db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { contact: true, org: true } });
    const adapter = this.channels.get(conv.channel);
    let outgoing: OutboundMessage = message;
    // WhatsApp: outside the 24h customer-service window only approved templates may be sent.
    if (conv.channel === "WHATSAPP" && !message.template) {
      const last = conv.lastInboundAt?.getTime() ?? 0;
      if (Date.now() - last > WHATSAPP_WINDOW_MS) {
        const first = conv.contact.name?.split(" ")[0] ?? "there";
        outgoing = { text: message.text, template: { name: "reengage", params: { customerName: first, businessName: conv.org.name } } };
        this.log.warn(`conversation ${conversationId} is outside the 24h window; sending reengage template instead of free text`);
      }
    }
    let providerMessageId: string | null = null;
    let deliveryStatus = "sent";
    try {
      const res = await adapter.send({ orgId: conv.orgId, conversationId, phoneE164: conv.contact.phoneE164, externalThreadId: conv.externalThreadId ?? undefined }, outgoing);
      providerMessageId = res.providerMessageId;
    } catch (e) {
      deliveryStatus = "failed";
      this.log.warn(`send failed on ${conversationId}: ${(e as Error).message}`);
    }
    const buttons: QuickReply[] | undefined = adapter.supportsButtons ? message.quickReplies : undefined;
    const row = await this.db.message.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        role: opts.role,
        content: (opts.stored?.content as unknown as Prisma.InputJsonValue) ?? [{ type: "text", text: message.text }],
        text: message.text,
        buttons: (buttons as unknown as Prisma.InputJsonValue) ?? undefined,
        templateName: outgoing.template?.name ?? opts.templateName ?? null,
        providerMessageId,
        deliveryStatus,
        authorUserId: opts.authorUserId ?? null,
      },
    });
    await this.db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), lastMessagePreview: message.text.slice(0, 140) },
    });
    return row;
  }
}
