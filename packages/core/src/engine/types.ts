import type Anthropic from "@anthropic-ai/sdk";
import type {
  BookingRules,
  BrandVoice,
  CancelBookingArgs,
  CheckAvailabilityArgs,
  ConfirmBookingArgs,
  ContactMemory,
  CreateBookingArgs,
  EscalationContact,
  FindBookingsArgs,
  GetBusinessInfoArgs,
  HandoffToHumanArgs,
  MessageRole,
  OutboundMessage,
  QuickReply,
  RescheduleBookingArgs,
  SearchFaqArgs,
  Slot,
  UpdateContactMemoryArgs,
  Vertical,
} from "@ar/shared";
import type { VerticalPack } from "../verticals/types.js";

/* ---------- Business snapshot given to the engine ---------- */

export interface ProfileProvider {
  id: string;
  name: string;
  title?: string;
  serviceIds: string[];
}
export interface ProfileService {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents?: number | null;
  currency: string;
  description?: string | null;
}
export interface ProfileHours {
  providerId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}
export interface BusinessProfile {
  id: string;
  name: string;
  vertical: Vertical;
  timezone: string;
  locations: { name: string; address?: string | null; phone?: string | null }[];
  providers: ProfileProvider[];
  services: ProfileService[];
  hours: ProfileHours[];
  faqs: { question: string; answer: string }[];
  bookingRules: BookingRules;
  brandVoice: BrandVoice;
  escalationContacts: EscalationContact[];
}

/* ---------- Conversation-scoped state ---------- */

export interface OfferedSlot {
  start: string;
  end: string;
  providerId: string;
  serviceId: string;
  offeredAt: string;
  label?: string;
  providerName?: string;
}

export interface EngineState {
  offeredSlots: OfferedSlot[];
  lastServiceId?: string;
  confirmedBookingIds: string[];
  consecutiveModelErrors: number;
  /** Free-form scratch space for the rule-based demo model. */
  demo?: Record<string, unknown>;
}

export function emptyEngineState(): EngineState {
  return { offeredSlots: [], confirmedBookingIds: [], consecutiveModelErrors: 0 };
}

export interface BookingSummary {
  id: string;
  serviceId: string;
  serviceName: string;
  providerId: string;
  providerName: string;
  startAt: string;
  endAt: string;
  status: string;
  /** Local wall-clock label, e.g. "Tue 9 Sep, 10:30". */
  label: string;
  notes?: string | null;
}

export interface ContactContext {
  id: string;
  phoneE164: string;
  name?: string | null;
  memory: ContactMemory;
  upcomingBookings?: BookingSummary[];
}

export interface StoredMessage {
  role: MessageRole;
  content: Anthropic.ContentBlockParam[];
  text?: string;
  buttons?: QuickReply[];
  templateName?: string;
}

/* ---------- Tool executor contract (implemented against the DB in apps/api, in memory in tests) ---------- */

export type BookingFailureReason =
  | "SLOT_TAKEN"
  | "NOT_FOUND"
  | "OUTSIDE_RULES"
  | "TOO_LATE_TO_CHANGE"
  | "INVALID";

export type BookingResult =
  | { ok: true; booking: BookingSummary }
  | { ok: false; reason: BookingFailureReason; message: string; alternatives?: Slot[] };

export interface ReceptionistTools {
  getBusinessInfo(args: GetBusinessInfoArgs): Promise<unknown>;
  searchFaq(args: SearchFaqArgs): Promise<{ hits: { question: string; answer: string }[] }>;
  checkAvailability(args: CheckAvailabilityArgs): Promise<{ slots: Slot[]; timezone: string; note?: string }>;
  createBooking(args: CreateBookingArgs): Promise<BookingResult>;
  findBookings(args: FindBookingsArgs): Promise<{ bookings: BookingSummary[] }>;
  /** `offeredServiceId` is the service check_availability was called with; implementations must reject a mismatch with the booking's service. */
  rescheduleBooking(args: RescheduleBookingArgs & { offeredServiceId?: string }): Promise<BookingResult>;
  cancelBooking(args: CancelBookingArgs): Promise<{ ok: boolean; reason?: string; message?: string; booking?: BookingSummary }>;
  confirmBooking(args: ConfirmBookingArgs): Promise<{ ok: boolean; message?: string; booking?: BookingSummary }>;
  updateContactMemory(args: UpdateContactMemoryArgs): Promise<{ ok: true; memory: ContactMemory }>;
  handoffToHuman(args: HandoffToHumanArgs): Promise<{ ok: true }>;
}

/* ---------- Model client contract ---------- */

export interface ModelContext {
  profile: BusinessProfile;
  pack: VerticalPack;
  contact: ContactContext;
  state: EngineState;
  now: string;
  inboundText: string;
}

export interface ModelRequest {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  maxTokens: number;
  metadata: { conversationId: string; context: ModelContext };
}

export interface ModelResponse {
  content: Anthropic.ContentBlock[];
  stopReason: Anthropic.StopReason | string | null;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ModelClient {
  readonly name: string;
  complete(req: ModelRequest): Promise<ModelResponse>;
}

export class ModelError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ModelError";
  }
}

/* ---------- Engine input / output ---------- */

export interface EngineInput {
  profile: BusinessProfile;
  pack: VerticalPack;
  contact: ContactContext;
  conversation: {
    id: string;
    state: EngineState;
    channelSupportsButtons: boolean;
    summary?: string | null;
  };
  /** Prior messages, oldest first. Must not include the inbound message. */
  history: StoredMessage[];
  inbound: { text: string; buttonId?: string };
  /** UTC ISO; defaults to the current time. */
  now?: string;
}

export type EngineEventType =
  | "AI_REPLIED"
  | "GUARDRAIL_BLOCKED"
  | "MODEL_ERROR"
  | "HANDOFF"
  | "BOOKING_CREATED"
  | "BOOKING_RESCHEDULED"
  | "BOOKING_CANCELLED"
  | "BOOKING_CONFIRMED_BY_CUSTOMER";

export interface EngineEvent {
  type: EngineEventType;
  meta?: Record<string, unknown>;
}

export interface EngineOutput {
  replies: OutboundMessage[];
  /** Messages to persist, in order (inbound user message first). */
  newMessages: StoredMessage[];
  state: EngineState;
  handoff?: { reason: string; urgency: "low" | "normal" | "high"; summary?: string };
  events: EngineEvent[];
  usage: { inputTokens: number; outputTokens: number; modelCalls: number };
}
