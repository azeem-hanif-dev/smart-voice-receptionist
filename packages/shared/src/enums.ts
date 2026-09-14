export const VERTICALS = ["DENTAL", "CLINIC", "SALON", "PHYSIO", "VET", "CHIRO", "NAILSPA"] as const;
export type Vertical = (typeof VERTICALS)[number];

export const CHANNELS = ["WHATSAPP", "SIMULATOR"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CONVERSATION_STATUSES = ["AI", "HUMAN", "CLOSED"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_SOURCES = ["AI", "MANUAL"] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const MESSAGE_ROLES = ["USER", "ASSISTANT", "TOOL", "STAFF", "SYSTEM"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const SCHEDULED_KINDS = [
  "CONFIRMATION",
  "REMINDER_24H",
  "REMINDER_2H",
  "NO_SHOW_FOLLOWUP",
  "REBOOK_NUDGE",
  "REENGAGE",
] as const;
export type ScheduledKind = (typeof SCHEDULED_KINDS)[number];

export const ANALYTICS_EVENT_TYPES = [
  "CONVERSATION_STARTED",
  "AI_REPLIED",
  "BOOKING_CREATED",
  "BOOKING_RESCHEDULED",
  "BOOKING_CANCELLED",
  "BOOKING_CONFIRMED_BY_CUSTOMER",
  "REMINDER_SENT",
  "HANDOFF",
  "HANDBACK",
  "HANDOFF_NOTIFIED",
  "GUARDRAIL_BLOCKED",
  "MODEL_ERROR",
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export const ROLES = ["OWNER", "STAFF"] as const;
export type Role = (typeof ROLES)[number];
