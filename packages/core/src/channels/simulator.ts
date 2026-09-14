import { randomUUID } from "node:crypto";
import type { InboundMessage, OutboundMessage, OutboundTarget, SendResult } from "@ar/shared";
import type { ChannelAdapter, NormalizedEvent, WebhookRequest } from "./types.js";

export interface SimulatorSent {
  target: OutboundTarget;
  message: OutboundMessage;
  /** Rendered text (templates become plain text in the simulator). */
  text: string;
  providerMessageId: string;
  sentAt: string;
}

/**
 * In-process channel used by the dashboard demo chat, the demo script and tests. Outbound messages are
 * collected in `sent` and can be observed by listeners.
 */
export class SimulatorAdapter implements ChannelAdapter {
  readonly channel = "SIMULATOR" as const;
  readonly supportsButtons = true;
  readonly sent: SimulatorSent[] = [];
  private listeners = new Set<(s: SimulatorSent) => void>();

  constructor(private readonly renderTemplateText?: (message: OutboundMessage) => string) {}

  verifyWebhook(_req: WebhookRequest) {
    return { ok: true };
  }

  normalize(payload: unknown, orgId: string): NormalizedEvent[] {
    const p = payload as Partial<InboundMessage> & { text?: string; phoneE164?: string; buttonId?: string };
    const id = p.providerMessageId ?? randomUUID();
    return [
      {
        eventId: id,
        message: {
          channel: "SIMULATOR",
          orgId,
          providerMessageId: id,
          from: { phoneE164: p.from?.phoneE164 ?? p.phoneE164 ?? "+10000000000", displayName: p.from?.displayName },
          kind: p.buttonId ? "button" : "text",
          text: p.text ?? "",
          buttonId: p.buttonId,
          receivedAt: new Date().toISOString(),
        },
      },
    ];
  }

  async send(target: OutboundTarget, message: OutboundMessage): Promise<SendResult> {
    const text = message.template && this.renderTemplateText ? this.renderTemplateText(message) : message.text;
    const record: SimulatorSent = {
      target,
      message,
      text,
      providerMessageId: `sim-${randomUUID()}`,
      sentAt: new Date().toISOString(),
    };
    this.sent.push(record);
    for (const l of this.listeners) l(record);
    return { providerMessageId: record.providerMessageId };
  }

  onSend(listener: (s: SimulatorSent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.sent.length = 0;
  }
}
