import type Anthropic from "@anthropic-ai/sdk";
import { DateTime } from "luxon";
import { TOOL_INPUT_SCHEMAS, type OutboundMessage, type QuickReply, type ToolName } from "@ar/shared";
import { expandButton, extractButtons, slotButtons } from "./buttons.js";
import {
  HANDED_OFF_MESSAGE,
  SAFE_UNCONFIRMED_TEXT,
  claimsConfirmation,
  findOffered,
  notOfferedMessage,
  preCheck,
  pruneOfferedSlots,
  recordOfferedSlots,
} from "./guardrails.js";
import { buildHistory, textOf } from "./history.js";
import { assembleSystemPrompt } from "./prompt.js";
import { receptionistTools } from "./tool-definitions.js";
import {
  ModelError,
  type EngineEvent,
  type EngineInput,
  type EngineOutput,
  type EngineState,
  type ModelClient,
  type ModelResponse,
  type OfferedSlot,
  type ReceptionistTools,
  type StoredMessage,
} from "./types.js";

export const MAX_ITERATIONS = 8;
export const MAX_TOKENS = 1024;
const RETRY_DELAY_MS = 1500;

export interface EngineDeps {
  model: ModelClient;
  tools: ReceptionistTools;
  /** For tests; defaults to a real delay. */
  sleep?: (ms: number) => Promise<void>;
}

function userText(text: string): StoredMessage {
  return { role: "USER", content: [{ type: "text", text }], text };
}

function assistantText(text: string, buttons?: QuickReply[]): StoredMessage {
  return { role: "ASSISTANT", content: [{ type: "text", text }], text, buttons };
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof ModelError) return err.retryable;
  const status = (err as { status?: number })?.status;
  if (typeof status === "number") return status === 408 || status === 409 || status === 429 || status >= 500;
  const ctor = (err as { constructor?: { name?: string } })?.constructor?.name ?? "";
  const name = (err as { name?: string })?.name ?? "";
  const message = String((err as Error)?.message ?? "");
  return (
    /APIConnection|Timeout|Retryable/i.test(ctor) ||
    /APIConnection|Timeout|ECONN|ETIMEDOUT/i.test(name) ||
    /connection error|timed out|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(message)
  );
}

/**
 * Run one conversational turn: inbound customer message in, outbound replies + persistence instructions out.
 * Pure with respect to storage: the caller persists `newMessages` and `state`.
 */
export async function runTurn(input: EngineInput, deps: EngineDeps): Promise<EngineOutput> {
  const now = input.now ?? new Date().toISOString();
  const tz = input.profile.timezone;
  const pack = input.pack;
  const state: EngineState = structuredClone(input.conversation.state);
  pruneOfferedSlots(state, now);
  const events: EngineEvent[] = [];
  const newMessages: StoredMessage[] = [];
  const usage = { inputTokens: 0, outputTokens: 0, modelCalls: 0 };
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  const inboundText = input.inbound.buttonId
    ? expandButton(input.inbound.buttonId, input.inbound.text, tz)
    : input.inbound.text;
  // The model sees the expanded button text; people (inbox, demo phone) see what the customer tapped.
  const displayText = input.inbound.buttonId && input.inbound.text ? input.inbound.text : inboundText;
  newMessages.push({ role: "USER", content: [{ type: "text", text: inboundText }], text: displayText });

  const finish = (replies: OutboundMessage[], handoff?: EngineOutput["handoff"]): EngineOutput => ({
    replies,
    newMessages,
    state,
    handoff,
    events,
    usage,
  });

  /* ---- Deterministic pre-checks: emergencies and explicit requests for a human ---- */
  const pre = preCheck(inboundText, pack);
  if (pre) {
    const text =
      pre.kind === "emergency"
        ? pack.emergencyMessage
        : "Of course. I've let the team know and a team member will reply to you here shortly.";
    await deps.tools.handoffToHuman({ reason: pre.reason, urgency: pre.urgency, summary: inboundText.slice(0, 200) });
    newMessages.push(assistantText(text));
    events.push({ type: "HANDOFF", meta: { reason: pre.reason, urgency: pre.urgency, deterministic: true } });
    return finish([{ text }], { reason: pre.reason, urgency: pre.urgency, summary: inboundText.slice(0, 200) });
  }

  /* ---- Model loop ---- */
  const prompt = assembleSystemPrompt({
    profile: input.profile,
    pack,
    contact: input.contact,
    state,
    now,
    summary: input.conversation.summary,
  });
  const tools = receptionistTools();
  const messages: Anthropic.MessageParam[] = [...buildHistory(input.history), { role: "user", content: [{ type: "text", text: inboundText }] }];

  let handoff: EngineOutput["handoff"] | undefined;
  let offeredThisTurn: OfferedSlot[] = [];
  let bookingSucceededThisTurn = false;
  let listedBookingsThisTurn = false;
  let confirmationRetryUsed = false;

  const callModel = async (): Promise<ModelResponse> => {
    const req = {
      system: prompt.full,
      messages,
      tools,
      maxTokens: MAX_TOKENS,
      metadata: {
        conversationId: input.conversation.id,
        context: { profile: input.profile, pack, contact: input.contact, state, now, inboundText },
      },
    };
    try {
      usage.modelCalls++;
      return await deps.model.complete(req);
    } catch (err) {
      if (!isRetryable(err)) throw err;
      await sleep(RETRY_DELAY_MS);
      usage.modelCalls++;
      return await deps.model.complete(req);
    }
  };

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let response: ModelResponse;
    try {
      response = await callModel();
      state.consecutiveModelErrors = 0;
    } catch (err) {
      state.consecutiveModelErrors++;
      const message = err instanceof Error ? err.message : String(err);
      events.push({ type: "MODEL_ERROR", meta: { message } });
      const apology = "Sorry, I'm having trouble right now. I've let the team know and someone will reply to you here shortly.";
      await deps.tools.handoffToHuman({ reason: `AI error: ${message.slice(0, 120)}`, urgency: "normal" });
      newMessages.push(assistantText(apology));
      events.push({ type: "HANDOFF", meta: { reason: "model_error" } });
      return finish([{ text: apology }], { reason: "AI error", urgency: "normal" });
    }
    if (response.usage) {
      usage.inputTokens += response.usage.inputTokens;
      usage.outputTokens += response.usage.outputTokens;
    }

    const content = response.content as Anthropic.ContentBlockParam[];
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const text = textOf(response.content);

    if (toolUses.length === 0 || response.stopReason === "end_turn" || handoff) {
      // After a handoff the AI is paused: any further tool calls are ignored and only the text is delivered.
      if (toolUses.length > 0) events.push({ type: "GUARDRAIL_BLOCKED", meta: { kind: handoff ? "tool_use_after_handoff" : "tool_use_on_end_turn" } });
      const safeContent = toolUses.length > 0 ? content.filter((b) => b.type !== "tool_use") : content;
      // ---- Final text: guardrail against unearned confirmations ----
      const claimed = claimsConfirmation(text);
      const earned = bookingSucceededThisTurn || listedBookingsThisTurn || state.confirmedBookingIds.length > 0;
      if (claimed && !earned) {
        events.push({ type: "GUARDRAIL_BLOCKED", meta: { kind: "unearned_confirmation", text } });
        if (!confirmationRetryUsed) {
          confirmationRetryUsed = true;
          messages.push({ role: "assistant", content: safeContent });
          newMessages.push({ role: "ASSISTANT", content: safeContent, text });
          const correction =
            "[System] You told the customer the booking is confirmed, but create_booking was not called successfully. Either call create_booking now with an offered slot, or tell the customer honestly that nothing is booked yet and what you need from them.";
          messages.push({ role: "user", content: [{ type: "text", text: correction }] });
          newMessages.push({ role: "SYSTEM", content: [{ type: "text", text: correction }], text: correction });
          continue;
        }
        const safe = SAFE_UNCONFIRMED_TEXT;
        newMessages.push(assistantText(safe));
        events.push({ type: "AI_REPLIED" });
        return finish([{ text: safe }], handoff);
      }

      const { text: cleanText, buttons: explicitButtons } = extractButtons(text);
      let buttons = explicitButtons;
      if (!buttons && input.conversation.channelSupportsButtons && offeredThisTurn.length && !handoff) {
        buttons = slotButtons(offeredThisTurn, tz);
      }
      const finalText = cleanText || (handoff ? "A team member will reply to you here shortly." : "Sorry, could you say that again?");
      newMessages.push({ role: "ASSISTANT", content: safeContent, text: finalText, buttons });
      events.push({ type: "AI_REPLIED" });
      const reply: OutboundMessage = { text: finalText };
      if (buttons?.length && input.conversation.channelSupportsButtons) reply.quickReplies = buttons;
      return finish([reply], handoff);
    }

    // ---- Tool calls ----
    messages.push({ role: "assistant", content });
    newMessages.push({ role: "ASSISTANT", content, text: text || undefined });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      const name = call.name as ToolName;
      if (handoff) {
        events.push({ type: "GUARDRAIL_BLOCKED", meta: { kind: "tool_use_after_handoff", tool: name } });
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify({ error: HANDED_OFF_MESSAGE }), is_error: true });
        continue;
      }
      const result = await executeTool(name, call.input, {
        deps,
        state,
        now,
        tz,
        events,
        onHandoff: (h) => (handoff = h),
        onBookingSuccess: () => (bookingSucceededThisTurn = true),
        onListedBookings: () => (listedBookingsThisTurn = true),
        onOffered: (slots) => (offeredThisTurn = slots),
      });
      results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result.value), is_error: result.isError || undefined });
    }
    messages.push({ role: "user", content: results });
    newMessages.push({ role: "TOOL", content: results });
  }

  // Iteration cap reached.
  const fallback = "Sorry, I got stuck on that. I've asked a team member to take over and they'll reply here shortly.";
  await deps.tools.handoffToHuman({ reason: "AI exceeded tool-call limit", urgency: "normal" });
  newMessages.push(assistantText(fallback));
  events.push({ type: "HANDOFF", meta: { reason: "iteration_cap" } });
  return finish([{ text: fallback }], { reason: "AI exceeded tool-call limit", urgency: "normal" });
}

interface ExecContext {
  deps: EngineDeps;
  state: EngineState;
  now: string;
  tz: string;
  events: EngineEvent[];
  onHandoff: (h: EngineOutput["handoff"]) => void;
  onBookingSuccess: () => void;
  onListedBookings: () => void;
  onOffered: (slots: OfferedSlot[]) => void;
}

async function executeTool(
  name: ToolName,
  rawInput: unknown,
  ctx: ExecContext,
): Promise<{ value: unknown; isError: boolean }> {
  const schema = TOOL_INPUT_SCHEMAS[name];
  if (!schema) return { value: { error: `Unknown tool ${name}` }, isError: true };
  const parsed = schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { value: { error: "Invalid input", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, isError: true };
  }
  const t = ctx.deps.tools;
  try {
    switch (name) {
      case "get_business_info":
        return { value: await t.getBusinessInfo(parsed.data as never), isError: false };
      case "search_faq":
        return { value: await t.searchFaq(parsed.data as never), isError: false };
      case "check_availability": {
        const args = parsed.data as import("@ar/shared").CheckAvailabilityArgs;
        const res = await t.checkAvailability(args);
        const offered: OfferedSlot[] = res.slots.map((s) => ({
          start: s.start,
          end: s.end,
          providerId: s.providerId,
          providerName: s.providerName,
          serviceId: args.serviceId,
          offeredAt: ctx.now,
          label: s.label ?? DateTime.fromISO(s.start, { zone: ctx.tz }).toFormat("ccc d LLL, HH:mm"),
        }));
        recordOfferedSlots(ctx.state, offered);
        ctx.onOffered(offered);
        ctx.state.lastServiceId = args.serviceId;
        return {
          value: {
            timezone: res.timezone,
            note: res.note,
            slots: offered.map((s) => ({ start: s.start, providerId: s.providerId, providerName: s.providerName, label: s.label })),
          },
          isError: false,
        };
      }
      case "create_booking": {
        const args = parsed.data as import("@ar/shared").CreateBookingArgs;
        if (!findOffered(ctx.state, args.startAt, args.providerId, args.serviceId)) {
          ctx.events.push({ type: "GUARDRAIL_BLOCKED", meta: { kind: "slot_not_offered", startAt: args.startAt, providerId: args.providerId, serviceId: args.serviceId } });
          return { value: { error: notOfferedMessage(args.startAt, args.providerId, args.serviceId) }, isError: true };
        }
        if (Date.parse(args.startAt) < Date.parse(ctx.now)) {
          ctx.events.push({ type: "GUARDRAIL_BLOCKED", meta: { kind: "slot_in_past", startAt: args.startAt } });
          return { value: { error: "That start time is in the past. Call check_availability again." }, isError: true };
        }
        const res = await t.createBooking(args);
        if (res.ok) {
          ctx.state.confirmedBookingIds.push(res.booking.id);
          ctx.onBookingSuccess();
          ctx.events.push({ type: "BOOKING_CREATED", meta: { bookingId: res.booking.id } });
        }
        return { value: res, isError: false };
      }
      case "reschedule_booking": {
        const args = parsed.data as import("@ar/shared").RescheduleBookingArgs;
        const offered = findOffered(ctx.state, args.newStartAt, args.providerId);
        if (!offered) {
          ctx.events.push({ type: "GUARDRAIL_BLOCKED", meta: { kind: "slot_not_offered", startAt: args.newStartAt, providerId: args.providerId } });
          return { value: { error: notOfferedMessage(args.newStartAt, args.providerId) }, isError: true };
        }
        const res = await t.rescheduleBooking({ ...args, offeredServiceId: offered.serviceId });
        if (res.ok) {
          ctx.state.confirmedBookingIds.push(res.booking.id);
          ctx.onBookingSuccess();
          ctx.events.push({ type: "BOOKING_RESCHEDULED", meta: { bookingId: res.booking.id } });
        }
        return { value: res, isError: false };
      }
      case "find_bookings": {
        const res = await t.findBookings(parsed.data as never);
        ctx.onListedBookings();
        return { value: res, isError: false };
      }
      case "cancel_booking": {
        const res = await t.cancelBooking(parsed.data as never);
        if (res.ok) {
          ctx.onBookingSuccess();
          ctx.events.push({ type: "BOOKING_CANCELLED", meta: { bookingId: (parsed.data as { bookingId: string }).bookingId } });
        }
        return { value: res, isError: false };
      }
      case "confirm_booking": {
        const res = await t.confirmBooking(parsed.data as never);
        if (res.ok) {
          ctx.onBookingSuccess();
          ctx.events.push({ type: "BOOKING_CONFIRMED_BY_CUSTOMER", meta: { bookingId: (parsed.data as { bookingId: string }).bookingId } });
        }
        return { value: res, isError: false };
      }
      case "update_contact_memory":
        return { value: await t.updateContactMemory(parsed.data as never), isError: false };
      case "handoff_to_human": {
        const args = parsed.data as import("@ar/shared").HandoffToHumanArgs;
        await t.handoffToHuman(args);
        ctx.onHandoff({ reason: args.reason, urgency: args.urgency, summary: args.summary });
        ctx.events.push({ type: "HANDOFF", meta: { reason: args.reason, urgency: args.urgency } });
        return { value: { ok: true, note: "The AI is now paused on this conversation. Tell the customer a team member will reply here shortly, then stop." }, isError: false };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { value: { error: `Tool failed: ${message}` }, isError: true };
  }
  return { value: { error: "Unhandled tool" }, isError: true };
}
