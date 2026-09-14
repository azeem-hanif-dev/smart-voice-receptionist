/**
 * TypeScript shapes for the HTTP API described in docs/API.md.
 * Config objects (brand voice, booking rules, ...) reuse the zod-inferred types from @ar/shared.
 */
import type {
  BookingRules,
  BookingSource,
  BookingStatus,
  BrandVoice,
  CalendarConfig,
  Channel,
  ContactMemory,
  ConversationStatus,
  EscalationContact,
  MessageRole,
  QuickReply,
  Role,
  ScheduledKind,
  Slot as AvailabilitySlot,
  Vertical,
} from "@ar/shared";

export type {
  BookingRules,
  BookingSource,
  BookingStatus,
  BrandVoice,
  CalendarConfig,
  Channel,
  ContactMemory,
  ConversationStatus,
  EscalationContact,
  MessageRole,
  QuickReply,
  Role,
  ScheduledKind,
  Vertical,
};

/** A slot returned by GET /orgs/:orgId/availability. */
export type Slot = AvailabilitySlot;

/** Weekly opening hours: local wall-clock minutes from midnight, weekday 0 = Sunday. */
export interface WeeklyHour {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  vertical: Vertical;
  timezone: string;
  role: Role;
  onboardedAt: string | null;
}

export type ModelMode = "anthropic" | "demo";

export interface Me {
  user: User;
  orgs: OrgSummary[];
  modelMode: ModelMode;
  model: string;
}

export interface AuthResult {
  user: User;
  orgs: OrgSummary[];
}

/* -------------------------------------------------------------------------- */
/* Organization                                                                */
/* -------------------------------------------------------------------------- */

/** As returned by the API: the access token is masked. */
export interface WhatsAppConfigView {
  phoneNumberId: string;
  wabaId?: string;
  accessToken: string;
  displayPhone?: string;
  templateNames?: Record<string, string>;
  templateLanguage?: string;
}

export interface OrgCounts {
  providers: number;
  services: number;
  faqs: number;
  contacts: number;
  conversations: number;
  bookings: number;
}

export interface Org {
  id: string;
  name: string;
  slug: string;
  vertical: Vertical;
  timezone: string;
  plan: string;
  brandVoice: BrandVoice;
  bookingRules: BookingRules;
  businessHours: WeeklyHour[];
  whatsappConfig: WhatsAppConfigView | null;
  whatsappConnected: boolean;
  escalationContacts: EscalationContact[];
  calendarConfig: CalendarConfig;
  onboardedAt: string | null;
  counts: OrgCounts;
}

export interface CreateOrgInput {
  name: string;
  vertical: Vertical;
  timezone: string;
}

export interface UpdateOrgInput {
  name?: string;
  timezone?: string;
  brandVoice?: Partial<BrandVoice>;
  bookingRules?: Partial<BookingRules>;
  escalationContacts?: EscalationContact[];
  businessHours?: WeeklyHour[];
  whatsappConfig?: WhatsAppConfigInput | null;
  calendarConfig?: Partial<CalendarConfig>;
  onboarded?: true;
}

export interface WhatsAppConfigInput {
  phoneNumberId: string;
  accessToken: string;
  displayPhone?: string;
  wabaId?: string;
}

/* -------------------------------------------------------------------------- */
/* Settings sub-resources                                                      */
/* -------------------------------------------------------------------------- */

export interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  priceCents: number | null;
  currency: string | null;
  active: boolean;
  sortOrder: number;
  providerIds: string[];
}

export interface ServiceInput {
  name: string;
  description?: string;
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  priceCents?: number | null;
  currency?: string;
  active?: boolean;
  sortOrder?: number;
  providerIds?: string[];
}

export interface Provider {
  id: string;
  name: string;
  title: string | null;
  active: boolean;
  color: string | null;
  serviceIds: string[];
  workingHours: WeeklyHour[];
}

export interface ProviderInput {
  name: string;
  title?: string;
  active?: boolean;
  color?: string;
  serviceIds?: string[];
  workingHours?: WeeklyHour[];
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  sortOrder: number;
}

export interface FaqInput {
  question: string;
  answer: string;
  keywords?: string[];
  sortOrder?: number;
}

export interface Holiday {
  id: string;
  /** YYYY-MM-DD in the org timezone. */
  date: string;
  name: string;
}

export interface HolidayInput {
  date: string;
  name: string;
}

export interface BlockedTime {
  id: string;
  providerId: string | null;
  startAt: string;
  endAt: string;
  reason: string | null;
}

export interface BlockedTimeInput {
  providerId?: string | null;
  startAt: string;
  endAt: string;
  reason?: string;
}

export interface Location {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
}

export interface LocationInput {
  name: string;
  address?: string;
  phone?: string;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: string;
}

export interface MemberInput {
  email: string;
  name: string;
  password: string;
  role: Role;
}

/* -------------------------------------------------------------------------- */
/* Contacts                                                                    */
/* -------------------------------------------------------------------------- */

export interface Contact {
  id: string;
  phoneE164: string;
  name: string | null;
  email?: string | null;
  language: string | null;
  memory: ContactMemory;
  optedOut: boolean;
  lastConversationAt: string | null;
  bookingsCount: number;
  createdAt: string;
}

export interface ContactDetail extends Contact {
  bookings: Booking[];
  conversations: ConversationSummary[];
}

/* -------------------------------------------------------------------------- */
/* Inbox                                                                       */
/* -------------------------------------------------------------------------- */

export interface ConversationSummary {
  id: string;
  channel: Channel;
  status: ConversationStatus;
  handoffReason: string | null;
  handoffAt: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  assignedUserId?: string | null;
  createdAt?: string;
  contact: { id: string; name: string | null; phoneE164: string };
}

export interface Message {
  id: string;
  role: MessageRole;
  direction: "INBOUND" | "OUTBOUND";
  text: string;
  buttons?: QuickReply[];
  templateName?: string | null;
  createdAt: string;
  authorUserId?: string | null;
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  contact: Contact;
  messages: Message[];
  bookings: Booking[];
}

/* -------------------------------------------------------------------------- */
/* Bookings and calendar                                                       */
/* -------------------------------------------------------------------------- */

export interface Booking {
  id: string;
  status: BookingStatus;
  source: BookingSource;
  startAt: string;
  endAt: string;
  notes: string | null;
  cancelReason: string | null;
  confirmedByCustomerAt: string | null;
  contact: { id: string; name: string | null; phoneE164: string };
  service: { id: string; name: string; durationMinutes: number };
  provider: { id: string; name: string; color: string | null };
  conversationId: string | null;
  createdAt: string;
}

export interface BookingInput {
  serviceId: string;
  providerId: string;
  startAt: string;
  notes?: string;
  contactId?: string;
  contact?: { phoneE164: string; name?: string };
}

export interface AvailabilityResponse {
  slots: Slot[];
  timezone: string;
}

export interface ScheduledMessage {
  id: string;
  kind: ScheduledKind;
  templateName: string | null;
  runAt: string;
  status: string;
  sentAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Analytics                                                                   */
/* -------------------------------------------------------------------------- */

export interface AnalyticsPoint {
  date: string;
  conversations: number;
  bookings: number;
}

export interface Analytics {
  days: number;
  from: string;
  to: string;
  conversations: number;
  aiReplies: number;
  bookingsByAi: number;
  bookingsManual: number;
  remindersSent: number;
  customerConfirmations: number;
  cancellations: number;
  reschedules: number;
  handoffs: number;
  handoffRate: number | null;
  medianFirstResponseMs: number | null;
  series: AnalyticsPoint[];
}

/* -------------------------------------------------------------------------- */
/* Simulator                                                                   */
/* -------------------------------------------------------------------------- */

export interface SimulatorReply {
  conversationId: string;
  status: ConversationStatus;
  replies: { text: string; quickReplies?: QuickReply[] }[];
  handoff?: { reason: string; urgency: string; summary?: string } | null;
  modelMode: ModelMode;
}

/* -------------------------------------------------------------------------- */
/* Vertical packs                                                              */
/* -------------------------------------------------------------------------- */

export interface VerticalVocabulary {
  customer: string;
  customerPlural: string;
  provider: string;
  providerPlural: string;
  appointment: string;
  business: string;
}

export interface DefaultService {
  name: string;
  durationMinutes: number;
  bufferAfterMinutes?: number;
  priceCents?: number;
  description?: string;
}

export interface FaqSeed {
  question: string;
  answer: string;
  keywords: string[];
}

export interface QualificationQuestion {
  id: string;
  ask: string;
  prompt: string;
  when: "always" | "new_customer";
  options?: string[];
}

/** GET /verticals. `defaultHours` is `[weekday, startMinute, endMinute]` tuples. */
export interface VerticalPackSummary {
  id: Vertical;
  displayName: string;
  tagline: string;
  vocabulary: VerticalVocabulary;
  defaultServices: DefaultService[];
  defaultHours: [number, number, number][];
  faqSeeds: FaqSeed[];
  qualificationQuestions: QualificationQuestion[];
  sampleCustomerMessages: string[];
}

/* -------------------------------------------------------------------------- */
/* Integrations                                                                */
/* -------------------------------------------------------------------------- */

export interface GoogleIntegrationStatus {
  configured: boolean;
  connected: boolean;
}
