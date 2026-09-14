import type Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { TOOL_INPUT_SCHEMAS, type ToolName } from "@ar/shared";

const DESCRIPTIONS: Record<ToolName, string> = {
  get_business_info:
    "Get the business profile: opening hours, location, services with ids/durations/prices, providers with ids, and policies. Use it before answering questions about these and before check_availability if you need a service id.",
  search_faq:
    "Search the business's FAQ for an answer to the customer's question. Returns matching question/answer pairs. If nothing relevant is returned, say you don't know and offer to have a team member follow up.",
  check_availability:
    "Get bookable appointment slots for a service (and optionally a specific provider) across a date range. You must call this before proposing any time. Only ever offer times that this tool returned.",
  create_booking:
    "Book an appointment at a slot previously returned by check_availability. Only tell the customer the appointment is confirmed after this returns ok=true. If ok=false, read the reason and offer the alternatives.",
  find_bookings:
    "List this customer's existing bookings (identified by their phone number). Use before rescheduling, cancelling or confirming, and when the customer asks about their appointment.",
  reschedule_booking:
    "Move an existing booking to a new slot previously returned by check_availability. Only confirm the change after ok=true.",
  cancel_booking: "Cancel an existing booking. Only confirm the cancellation after ok=true.",
  confirm_booking: "Record that the customer confirmed they will attend an upcoming booking (e.g. replying to a reminder).",
  update_contact_memory:
    "Remember facts about the customer across conversations: their name, language, preferred provider, preferences, notes for staff, and answers to qualification questions.",
  handoff_to_human:
    "Hand the conversation to a human team member and pause the AI. Use when the customer asks for a person, is frustrated, has a complaint, asks something outside booking/FAQ scope, describes an emergency, or when the vertical rules require it.",
};

function schemaFor(name: ToolName): Anthropic.Tool.InputSchema {
  const json = zodToJsonSchema(TOOL_INPUT_SCHEMAS[name], { $refStrategy: "none" }) as Record<string, unknown>;
  delete json.$schema;
  return json as Anthropic.Tool.InputSchema;
}

let cached: Anthropic.Tool[] | null = null;
export function receptionistTools(): Anthropic.Tool[] {
  if (cached) return cached;
  cached = (Object.keys(TOOL_INPUT_SCHEMAS) as ToolName[]).map((name) => ({
    name,
    description: DESCRIPTIONS[name],
    input_schema: schemaFor(name),
  }));
  return cached;
}
