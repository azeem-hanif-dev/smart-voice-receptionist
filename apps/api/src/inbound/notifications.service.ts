import { Inject, Injectable, Logger } from "@nestjs/common";
import { EscalationContactSchema, type EscalationContact } from "@ar/shared";
import type { Contact } from "@ar/db";
import { PrismaService } from "../common/prisma.service.js";
import { ChannelRegistry } from "./channels.js";
import { env } from "../config.js";

/**
 * Notifies the organization's escalation contacts when a conversation is handed to a human.
 * Transports: dashboard (always: the conversation shows under "Needs a human" in the inbox), WhatsApp
 * (a text to the contact's phone when the org has WhatsApp connected), email (logged only; no mail
 * transport is configured in this build, see docs/ARCHITECTURE.md).
 */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ChannelRegistry) private readonly channels: ChannelRegistry,
  ) {}

  async notifyHandoff(orgId: string, conversationId: string, contact: Pick<Contact, "name" | "phoneE164">, handoff: { reason: string; urgency: string; summary?: string }) {
    const org = await this.prisma.client.organization.findUniqueOrThrow({ where: { id: orgId } });
    const contacts = ((org.escalationContacts as unknown[]) ?? []).map((c) => EscalationContactSchema.safeParse(c)).filter((r) => r.success).map((r) => r.data as EscalationContact);
    const who = contact.name ? `${contact.name} (${contact.phoneE164})` : contact.phoneE164;
    const text = `${handoff.urgency === "high" ? "URGENT: " : ""}${who} needs a human: ${handoff.reason}. Open the inbox: ${env().APP_URL}/o/${orgId}/inbox?c=${conversationId}`;
    this.log.warn(`[handoff] ${org.name}: ${text}`);
    const wa = org.whatsappConfig as { phoneNumberId?: string } | null;
    for (const c of contacts) {
      if (c.notifyVia === "whatsapp" && c.phone && wa?.phoneNumberId) {
        try {
          await this.channels.get("WHATSAPP").send({ orgId, conversationId, phoneE164: c.phone }, { text });
        } catch (e) {
          this.log.error(`could not notify ${c.name} on WhatsApp: ${(e as Error).message}`);
        }
      } else if (c.notifyVia === "email") {
        this.log.warn(`email notification for ${c.name} <${c.email}> skipped: no mail transport configured`);
      }
    }
    await this.prisma.client.analyticsEvent.create({ data: { orgId, type: "HANDOFF_NOTIFIED", conversationId, meta: { contacts: contacts.length } } });
  }
}
