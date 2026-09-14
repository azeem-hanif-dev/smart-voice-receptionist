import { z } from "zod";

export const BookingRulesSchema = z.object({
  /** Earliest a customer may book, in minutes from now. */
  minLeadMinutes: z.number().int().min(0).default(120),
  /** Furthest ahead a customer may book, in days. */
  maxAdvanceDays: z.number().int().min(1).max(365).default(60),
  /** Slot grid on the local clock. */
  slotGranularityMinutes: z.number().int().min(5).max(120).default(30),
  /** Customers may cancel or reschedule up to this many hours before the appointment. */
  cancellationCutoffHours: z.number().int().min(0).default(24),
  /** Reminder offsets before the appointment, in minutes. */
  reminderOffsetsMinutes: z.array(z.number().int().min(5)).default([1440, 120]),
  /** Let the AI pick a provider when the customer has no preference. */
  allowAnyProvider: z.boolean().default(true),
  /** How many slots the AI offers at once. */
  slotsToOffer: z.number().int().min(2).max(4).default(3),
});
export type BookingRules = z.infer<typeof BookingRulesSchema>;
export const DEFAULT_BOOKING_RULES: BookingRules = BookingRulesSchema.parse({});

export const BrandVoiceSchema = z.object({
  tone: z.enum(["friendly", "professional", "warm", "concise"]).default("friendly"),
  /** One or two sentences about the business, shown to the model. */
  description: z.string().default(""),
  greeting: z.string().default(""),
  signoff: z.string().default(""),
  defaultLanguage: z.string().default("en"),
  /** Free-form instructions from the owner, e.g. "Never mention competitors". */
  extraInstructions: z.string().default(""),
  /** Name the AI uses for itself. */
  assistantName: z.string().default("Receptionist"),
});
export type BrandVoice = z.infer<typeof BrandVoiceSchema>;
export const DEFAULT_BRAND_VOICE: BrandVoice = BrandVoiceSchema.parse({});

export const WhatsAppConfigSchema = z.object({
  phoneNumberId: z.string().min(1),
  wabaId: z.string().optional(),
  accessToken: z.string().min(1),
  displayPhone: z.string().optional(),
  /** Approved template names in Meta, keyed by our ScheduledKind. */
  templateNames: z.record(z.string()).default({}),
  templateLanguage: z.string().default("en"),
});
export type WhatsAppConfig = z.infer<typeof WhatsAppConfigSchema>;

export const EscalationContactSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  notifyVia: z.enum(["whatsapp", "email", "dashboard"]).default("dashboard"),
});
export type EscalationContact = z.infer<typeof EscalationContactSchema>;

export const CalendarConfigSchema = z.object({
  provider: z.enum(["none", "google"]).default("none"),
  calendarId: z.string().optional(),
  refreshToken: z.string().optional(),
  connectedAt: z.string().optional(),
});
export type CalendarConfig = z.infer<typeof CalendarConfigSchema>;

export const ContactMemorySchema = z.object({
  name: z.string().optional(),
  language: z.string().optional(),
  preferredProviderId: z.string().optional(),
  preferredProviderName: z.string().optional(),
  /** Free-form preferences the customer stated, e.g. "prefers mornings". */
  preferences: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
  /** Answers to vertical qualification questions keyed by question id. */
  qualification: z.record(z.string()).default({}),
  lastBookingSummary: z.string().optional(),
  isReturning: z.boolean().default(false),
});
export type ContactMemory = z.infer<typeof ContactMemorySchema>;
export const DEFAULT_CONTACT_MEMORY: ContactMemory = ContactMemorySchema.parse({});
