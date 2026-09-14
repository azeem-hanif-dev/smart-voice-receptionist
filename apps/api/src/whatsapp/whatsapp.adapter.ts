import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getVerticalPack, type ChannelAdapter, type NormalizedEvent, type WebhookRequest } from "@ar/core";
import { WhatsAppConfigSchema, type InboundMessage, type OutboundMessage, type OutboundTarget, type SendResult, type ScheduledKind, type Vertical, type WhatsAppConfig } from "@ar/shared";
import { PrismaService } from "../common/prisma.service.js";
import { env, reloadEnv } from "../config.js";

/**
 * Meta WhatsApp Cloud API adapter. Inbound: webhook verification + normalisation. Outbound: text,
 * interactive reply buttons and approved templates via the Graph API. Per-org credentials live in
 * Organization.whatsappConfig (phoneNumberId + accessToken); the app secret is deployment-wide.
 */
@Injectable()
export class WhatsAppAdapter implements ChannelAdapter {
  readonly channel = "WHATSAPP" as const;
  readonly supportsButtons = true;
  private readonly log = new Logger(WhatsAppAdapter.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  verifyWebhook(req: WebhookRequest): { ok: boolean; challenge?: string; error?: string } {
    const q = req.query;
    if (q["hub.mode"] === "subscribe") {
      if (q["hub.verify_token"] === env().WHATSAPP_VERIFY_TOKEN) return { ok: true, challenge: String(q["hub.challenge"] ?? "") };
      return { ok: false, error: "verify token mismatch" };
    }
    let secret = env().WHATSAPP_APP_SECRET;
    if (!secret) {
      // The secret is often added to .env after the API booted; pick it up without a restart.
      reloadEnv();
      secret = env().WHATSAPP_APP_SECRET;
    }
    if (!secret) return { ok: false, error: "WHATSAPP_APP_SECRET is not configured (set it in .env)" };
    const header = req.headers["x-hub-signature-256"];
    const sig = (Array.isArray(header) ? header[0] : header) ?? "";
    const expected = `sha256=${createHmac("sha256", secret).update(req.rawBody, "utf8").digest("hex")}`;
    if (sig.length !== expected.length) return { ok: false, error: "bad signature" };
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? { ok: true } : { ok: false, error: "bad signature" };
  }

  /** Extract the phone_number_id(s) in a webhook payload so the controller can map them to orgs. */
  static phoneNumberIds(payload: unknown): string[] {
    const ids = new Set<string>();
    const entries = (payload as { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string } } }[] }[] })?.entry ?? [];
    for (const e of entries) for (const c of e.changes ?? []) if (c.value?.metadata?.phone_number_id) ids.add(c.value.metadata.phone_number_id);
    return [...ids];
  }

  normalize(payload: unknown, orgId: string): NormalizedEvent[] {
    const out: NormalizedEvent[] = [];
    const entries = (payload as { entry?: WaEntry[] })?.entry ?? [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const v = change.value;
        if (!v) continue;
        const threadId = v.metadata?.phone_number_id;
        const names = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
        for (const m of v.messages ?? []) {
          const base = { channel: "WHATSAPP" as const, orgId, providerMessageId: m.id, externalThreadId: threadId, from: { phoneE164: `+${m.from}`, displayName: names.get(m.from) }, receivedAt: new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString() };
          let msg: InboundMessage;
          if (m.type === "text" && m.text?.body) msg = { ...base, kind: "text", text: m.text.body };
          else if (m.type === "interactive" && m.interactive?.button_reply) msg = { ...base, kind: "button", text: m.interactive.button_reply.title, buttonId: m.interactive.button_reply.id };
          else if (m.type === "interactive" && m.interactive?.list_reply) msg = { ...base, kind: "button", text: m.interactive.list_reply.title, buttonId: m.interactive.list_reply.id };
          else if (m.type === "button" && m.button) msg = { ...base, kind: "button", text: m.button.text, buttonId: m.button.payload ?? m.button.text };
          else msg = { ...base, kind: "unsupported", text: "" };
          out.push({ eventId: m.id, message: msg });
        }
        for (const s of v.statuses ?? []) {
          out.push({ eventId: `${s.id}:${s.status}`, statusUpdate: { providerMessageId: s.id, status: s.status as "sent" | "delivered" | "read" | "failed", error: s.errors?.[0]?.title } });
        }
      }
    }
    return out;
  }

  async send(target: OutboundTarget, message: OutboundMessage): Promise<SendResult> {
    const org = await this.prisma.client.organization.findUniqueOrThrow({ where: { id: target.orgId } });
    const parsed = WhatsAppConfigSchema.safeParse(org.whatsappConfig ?? {});
    if (!parsed.success) throw new Error("WhatsApp is not configured for this organization");
    const cfg = parsed.data;
    const to = target.phoneE164.replace(/^\+/, "");
    let body: Record<string, unknown>;
    if (message.template) {
      const kindByName = Object.entries(getVerticalPack(org.vertical as Vertical).reminderTemplates).find(([, def]) => def.name === message.template!.name);
      const kind = kindByName?.[0] as ScheduledKind | undefined;
      const def = kindByName?.[1];
      const metaName = (kind && cfg.templateNames[kind]) || message.template.name;
      const params = def ? def.paramKeys.map((k) => message.template!.params[k] ?? "") : Object.values(message.template.params);
      const components: Record<string, unknown>[] = [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }];
      // Quick-reply buttons defined on the approved template get our stable ids as payloads.
      (def?.quickReplies ?? []).forEach((b, index) => components.push({ type: "button", sub_type: "quick_reply", index: String(index), parameters: [{ type: "payload", payload: b.id }] }));
      body = {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name: metaName, language: { code: message.template.language ?? cfg.templateLanguage }, components },
      };
    } else if (message.quickReplies?.length) {
      body = {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: { type: "button", body: { text: message.text.slice(0, 1024) }, action: { buttons: message.quickReplies.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) } },
      };
    } else {
      body = { messaging_product: "whatsapp", to, type: "text", text: { body: message.text.slice(0, 4096), preview_url: false } };
    }
    const res = await fetch(`https://graph.facebook.com/${env().WHATSAPP_GRAPH_VERSION}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok) {
      this.log.warn(`Graph API error ${res.status}: ${json.error?.message ?? "unknown"}`);
      throw new Error(`WhatsApp send failed: ${json.error?.message ?? res.status}`);
    }
    return { providerMessageId: json.messages?.[0]?.id ?? `wa-${Date.now()}` };
  }

  static configOf(org: { whatsappConfig: unknown }): WhatsAppConfig | null {
    const p = WhatsAppConfigSchema.safeParse(org.whatsappConfig ?? {});
    return p.success ? p.data : null;
  }
}

interface WaEntry {
  changes?: {
    value?: {
      metadata?: { phone_number_id?: string; display_phone_number?: string };
      contacts?: { wa_id: string; profile?: { name?: string } }[];
      messages?: {
        id: string;
        from: string;
        timestamp: string;
        type: string;
        text?: { body: string };
        button?: { text: string; payload?: string };
        interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
      }[];
      statuses?: { id: string; status: string; errors?: { title?: string }[] }[];
    };
  }[];
}
