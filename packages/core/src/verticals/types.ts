import type { ScheduledKind, Vertical } from "@ar/shared";

export interface DefaultService {
  name: string;
  durationMinutes: number;
  bufferAfterMinutes?: number;
  priceCents?: number;
  description?: string;
}

export interface QualificationQuestion {
  /** Stable id; answers are stored in ContactMemory.qualification[id]. */
  id: string;
  /** What the receptionist should find out, phrased for the model (it will rephrase naturally). */
  ask: string;
  /** Customer-facing wording; used verbatim by the demo model and as an example for Claude. */
  prompt: string;
  /** When the question is required before booking. */
  when: "always" | "new_customer";
  /** Optional quick-reply options. */
  options?: string[];
}

export interface FaqSeed {
  question: string;
  answer: string;
  keywords: string[];
}

export interface MessageTemplateDef {
  /** Template name (mirrors the approved WhatsApp template name by default). */
  name: string;
  /** Ordered parameter keys; WhatsApp body parameters are sent in this order. */
  paramKeys: string[];
  /** Text with {{param}} placeholders, rendered by the simulator and shown in the dashboard. */
  text: string;
  /** Optional quick replies attached when the channel supports them. */
  quickReplies?: { id: string; title: string }[];
}

export interface EscalationTrigger {
  /** Case-insensitive regex source matched against the inbound text. */
  pattern: string;
  reason: string;
  urgency: "low" | "normal" | "high";
  /** If true the customer is told to contact emergency services first. */
  emergency?: boolean;
}

export interface VerticalPack {
  id: Vertical;
  displayName: string;
  /** One-line description shown in onboarding. */
  tagline: string;
  vocabulary: {
    customer: string; // patient | client | pet owner
    customerPlural: string;
    provider: string; // dentist | doctor | stylist | physiotherapist | vet | chiropractor
    providerPlural: string;
    appointment: string; // appointment | visit | session
    business: string; // practice | clinic | salon
  };
  defaultServices: DefaultService[];
  /** Default weekly hours as [weekday, startMinute, endMinute]; weekday 0 = Sunday. */
  defaultHours: [number, number, number][];
  qualificationQuestions: QualificationQuestion[];
  faqSeeds: FaqSeed[];
  /** Tone guidance merged into the system prompt. */
  toneGuidance: string;
  /** Rules the model must follow. Rendered as a bulleted list. */
  complianceRules: string[];
  /** What the AI says when directing someone to emergency care. */
  emergencyMessage: string;
  escalationTriggers: EscalationTrigger[];
  reminderTemplates: Record<ScheduledKind, MessageTemplateDef>;
  followUp: {
    /** Days after a completed visit to nudge rebooking; 0 disables. */
    rebookAfterDays: number;
    /** Minutes after the appointment end to send the no-show follow-up. */
    noShowFollowUpMinutes: number;
  };
  /** Example messages used by the onboarding preview and the demo script. */
  sampleCustomerMessages: string[];
}
