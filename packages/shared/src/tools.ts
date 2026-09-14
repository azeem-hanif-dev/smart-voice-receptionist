import { z } from "zod";

/** Tool input schemas. The engine builds Anthropic tool definitions from these. */
export const GetBusinessInfoInput = z.object({
  topic: z
    .enum(["hours", "location", "services", "providers", "policies", "all"])
    .default("all")
    .describe("Which part of the business profile you need."),
});

export const SearchFaqInput = z.object({
  query: z.string().min(1).describe("The customer's question in their own words."),
});

export const CheckAvailabilityInput = z.object({
  serviceId: z.string().min(1).describe("Service id from the business profile."),
  providerId: z
    .string()
    .optional()
    .describe("Provider id, or omit for any available provider."),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("First local calendar day to search, YYYY-MM-DD."),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Last local calendar day to search, YYYY-MM-DD. Defaults to fromDate + 6 days."),
  preference: z
    .enum(["morning", "afternoon", "evening", "any"])
    .default("any")
    .describe("Time-of-day preference if the customer stated one."),
});

export const CreateBookingInput = z.object({
  serviceId: z.string().min(1),
  providerId: z.string().min(1).describe("Provider id exactly as returned by check_availability."),
  startAt: z.string().min(1).describe("Slot start exactly as returned by check_availability (ISO 8601 UTC)."),
  customerName: z.string().min(1).describe("Customer's name as they gave it."),
  notes: z.string().optional().describe("Reason for visit or anything staff should know."),
});

export const FindBookingsInput = z.object({
  includePast: z.boolean().default(false),
});

export const RescheduleBookingInput = z.object({
  bookingId: z.string().min(1),
  newStartAt: z.string().min(1).describe("New slot start exactly as returned by check_availability."),
  providerId: z.string().min(1).describe("Provider id exactly as returned by check_availability."),
});

export const CancelBookingInput = z.object({
  bookingId: z.string().min(1),
  reason: z.string().optional(),
});

export const ConfirmBookingInput = z.object({
  bookingId: z.string().min(1),
});

export const UpdateContactMemoryInput = z.object({
  name: z.string().optional(),
  language: z.string().optional(),
  preferredProviderId: z.string().optional(),
  addPreference: z.string().optional().describe("A preference to remember, e.g. 'prefers mornings'."),
  addNote: z.string().optional().describe("A fact to remember for staff, e.g. 'allergic to latex'."),
  qualification: z
    .record(z.string())
    .optional()
    .describe("Answers to qualification questions keyed by question id."),
});

export const HandoffToHumanInput = z.object({
  reason: z.string().min(1).describe("Short reason staff will see, e.g. 'customer asked for a person'."),
  urgency: z.enum(["low", "normal", "high"]).default("normal"),
  summary: z.string().optional().describe("One or two sentences summarising the conversation for staff."),
});

export const TOOL_INPUT_SCHEMAS = {
  get_business_info: GetBusinessInfoInput,
  search_faq: SearchFaqInput,
  check_availability: CheckAvailabilityInput,
  create_booking: CreateBookingInput,
  find_bookings: FindBookingsInput,
  reschedule_booking: RescheduleBookingInput,
  cancel_booking: CancelBookingInput,
  confirm_booking: ConfirmBookingInput,
  update_contact_memory: UpdateContactMemoryInput,
  handoff_to_human: HandoffToHumanInput,
} as const;
export type ToolName = keyof typeof TOOL_INPUT_SCHEMAS;
export const TOOL_NAMES = Object.keys(TOOL_INPUT_SCHEMAS) as ToolName[];

export type GetBusinessInfoArgs = z.infer<typeof GetBusinessInfoInput>;
export type SearchFaqArgs = z.infer<typeof SearchFaqInput>;
export type CheckAvailabilityArgs = z.infer<typeof CheckAvailabilityInput>;
export type CreateBookingArgs = z.infer<typeof CreateBookingInput>;
export type FindBookingsArgs = z.infer<typeof FindBookingsInput>;
export type RescheduleBookingArgs = z.infer<typeof RescheduleBookingInput>;
export type CancelBookingArgs = z.infer<typeof CancelBookingInput>;
export type ConfirmBookingArgs = z.infer<typeof ConfirmBookingInput>;
export type UpdateContactMemoryArgs = z.infer<typeof UpdateContactMemoryInput>;
export type HandoffToHumanArgs = z.infer<typeof HandoffToHumanInput>;
