import { z } from "zod";
import type { Channel } from "./enums.js";

export const QuickReplySchema = z.object({
  id: z.string().min(1).max(256),
  title: z.string().min(1).max(20),
});
export type QuickReply = z.infer<typeof QuickReplySchema>;

/** A message arriving from any channel, normalised. */
export interface InboundMessage {
  channel: Channel;
  orgId: string;
  /** Provider-side id used for idempotency (WhatsApp wamid, simulator uuid). */
  providerMessageId: string;
  /** Provider-side thread key, e.g. WhatsApp phone_number_id. */
  externalThreadId?: string;
  from: { phoneE164: string; displayName?: string };
  kind: "text" | "button" | "unsupported";
  text: string;
  buttonId?: string;
  receivedAt: string;
}

/** A message the engine or staff wants delivered. Channel-agnostic. */
export interface OutboundMessage {
  text: string;
  quickReplies?: QuickReply[];
  /** Business-initiated messages outside the 24h window must be templates on WhatsApp. */
  template?: { name: string; params: Record<string, string>; language?: string };
}

export interface OutboundTarget {
  orgId: string;
  conversationId: string;
  phoneE164: string;
  externalThreadId?: string;
}

export interface SendResult {
  providerMessageId: string;
}

export interface DeliveryStatusUpdate {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  error?: string;
}
