/** Local helpers for the demo chat. */
import { DateTime } from "luxon";
import type { ConversationDetail, QuickReply } from "@/lib/types";

export const DEFAULT_PHONE = "+1 555 010 2000";
export const DEFAULT_DISPLAY_NAME = "Demo Customer";

/** GET /orgs/:orgId/simulator/conversation returns `{ conversation: null }` when there is none. */
export type SimulatorConversation = ConversationDetail | { conversation: null };

export function hasConversation(value: SimulatorConversation | null): value is ConversationDetail {
  return Boolean(value && value.conversation);
}

/** "+1 555 010 2000" / "(555) 010-2000" -> "+15550102000". */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d]/g, "");
  if (!digits) return "";
  return input.trim().startsWith("+") || digits.length > 10 ? `+${digits}` : `+1${digits}`;
}

export function zonedDateTime(iso: string, timezone?: string | null): string {
  const dt = DateTime.fromISO(iso, timezone ? { zone: timezone } : undefined);
  return dt.isValid ? dt.toFormat("ccc d LLL, HH:mm") : iso;
}

export function zonedTime(iso: string, timezone?: string | null): string {
  const dt = DateTime.fromISO(iso, timezone ? { zone: timezone } : undefined);
  return dt.isValid ? dt.toFormat("HH:mm") : "";
}

export function isUpcoming(iso: string): boolean {
  const dt = DateTime.fromISO(iso);
  return dt.isValid && dt.toMillis() > Date.now();
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** What the phone renders. Mapped from API messages or appended optimistically. */
export interface Bubble {
  id: string;
  side: "customer" | "business";
  text: string;
  time: string;
  label?: "Staff" | "template";
  templateName?: string | null;
  buttons?: QuickReply[];
}
