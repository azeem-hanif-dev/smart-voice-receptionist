import type { Channel, DeliveryStatusUpdate, InboundMessage, OutboundMessage, OutboundTarget, SendResult } from "@ar/shared";

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  query: Record<string, string | string[] | undefined>;
}

export interface NormalizedEvent {
  /** Provider-side unique id, used for idempotency. */
  eventId: string;
  message?: InboundMessage;
  statusUpdate?: DeliveryStatusUpdate;
}

/**
 * A channel is anything that can deliver messages to and from a customer. Adding a channel (Twilio, web
 * widget) means implementing this interface in apps/api; nothing in @ar/core changes.
 */
export interface ChannelAdapter {
  readonly channel: Channel;
  readonly supportsButtons: boolean;
  /** Verify an inbound webhook (signature and/or challenge). */
  verifyWebhook(req: WebhookRequest): { ok: boolean; challenge?: string; error?: string };
  /** Turn a raw webhook payload into normalised events. */
  normalize(payload: unknown, orgId: string): NormalizedEvent[];
  send(target: OutboundTarget, message: OutboundMessage): Promise<SendResult>;
}
