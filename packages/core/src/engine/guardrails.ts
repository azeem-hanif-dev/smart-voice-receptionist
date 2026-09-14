import type { VerticalPack } from "../verticals/types.js";
import type { EngineState, OfferedSlot } from "./types.js";

export interface PreCheckResult {
  kind: "emergency" | "handoff";
  reason: string;
  urgency: "low" | "normal" | "high";
}

const HUMAN_REQUEST_RE =
  /\b(speak|talk|chat)\s+(to|with)\s+(a\s+|an\s+|the\s+)?(human|person|real person|real human|staff member|member of staff|manager|agent|operator|live agent)\b|\b(real|actual)\s+(person|human)\b|\bnot a bot\b|\bhuman please\b|\bI want a human\b|\bget me a (human|person|manager)\b/i;
const HUMAN_NEGATION_RE = /\b(don'?t|do not|no need to|not|never|without|rather than)\s+(need to |have to |want to )?(speak|talk|chat)\b/i;

function firstMatch(re: RegExp, text: string): RegExpMatchArray | null {
  return text.match(re);
}

/** Deterministic pre-model checks: emergencies and explicit requests for a human never depend on the model. */
export function preCheck(text: string, pack: VerticalPack): PreCheckResult | null {
  for (const t of pack.escalationTriggers) {
    let re: RegExp;
    try {
      re = new RegExp(t.pattern, "i");
    } catch {
      continue;
    }
    if (re.test(text)) {
      return { kind: t.emergency ? "emergency" : "handoff", reason: t.reason, urgency: t.urgency };
    }
  }
  const m = firstMatch(HUMAN_REQUEST_RE, text);
  if (m && !HUMAN_NEGATION_RE.test(text.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + m[0].length))) {
    return { kind: "handoff", reason: "Customer asked for a human", urgency: "normal" };
  }
  return null;
}

export const OFFERED_SLOT_TTL_MS = 30 * 60 * 1000;
export const MAX_OFFERED_SLOTS = 60;

export function recordOfferedSlots(state: EngineState, slots: OfferedSlot[]): void {
  state.offeredSlots = [...state.offeredSlots, ...slots].slice(-MAX_OFFERED_SLOTS);
}

export function pruneOfferedSlots(state: EngineState, nowIso: string): void {
  const now = Date.parse(nowIso);
  state.offeredSlots = state.offeredSlots.filter((s) => now - Date.parse(s.offeredAt) <= OFFERED_SLOT_TTL_MS);
}

/** The offered slot matching (start, providerId[, serviceId]) if check_availability returned it recently. */
export function findOffered(state: EngineState, start: string, providerId: string, serviceId?: string): OfferedSlot | undefined {
  const target = Date.parse(start);
  if (Number.isNaN(target)) return undefined;
  return state.offeredSlots.find((s) => s.providerId === providerId && Date.parse(s.start) === target && (!serviceId || s.serviceId === serviceId));
}

export function wasOffered(state: EngineState, start: string, providerId: string, serviceId?: string): boolean {
  return Boolean(findOffered(state, start, providerId, serviceId));
}

export function notOfferedMessage(start: string, providerId: string, serviceId?: string): string {
  return `Start time ${start} with provider ${providerId}${serviceId ? ` for service ${serviceId}` : ""} was not returned by check_availability in this conversation. Call check_availability for that service and offer only the slots it returns.`;
}

export const HANDED_OFF_MESSAGE = "The conversation has been handed to a human team member and the AI is paused. No further actions are allowed. Tell the customer a team member will reply here shortly, then stop.";

const SUBJECT = String.raw`(?:your|the|this|that|his|her|their)\s+(?:\w+\s+){0,2}?(?:appointment|booking|slot|session|visit|spot|consultation|check-?up|cleaning|cut|colou?r)`;
const CONFIRM_VERB = String.raw`(?:'s|\s+is|\s+are|\s+has\s+been|\s+have\s+been|\s+is\s+now|\s+are\s+now)\s+(?:all\s+)?(?:confirmed|booked(?:\s+in)?|scheduled|reserved|locked\s+in|secured|set)\b(?!\s+(?:already|out|up|as\b|through|by\s+(?:someone|another)|at\s+\d|for\s+other|solid|full))`;
const CLAIM_PATTERNS: RegExp[] = [
  new RegExp(SUBJECT + CONFIRM_VERB, "i"),
  /\byou(?:'re|\s+are)\s+(?:all\s+)?(?:set|booked(?:\s+in)?|confirmed|in\s+the\s+(?:diary|book|calendar|system))\b/i,
  /\bI(?:'ve|\s+have)\s+(?:just\s+)?(?:booked|scheduled|reserved|confirmed|locked\s+in|put)\s+(?:you|your|that|it|a\b|an\b|the\b)/i,
  /\bI\s+have\s+you\s+(?:down|booked|in|pencilled\s+in|penciled\s+in)\s+(?:for|on|at)\b/i,
  /\b(?:locked|pencil+ed)\s+in\s+for\b/i,
  /\breserved\s+for\s+you\b/i,
  /\bbooked\s+you\s+(?:in|for)\b/i,
  /^\W*(?:done|booked|confirmed|all\s+set|sorted)\s*[!.,:—-]/i,
  /\b(?:that'?s|it'?s)\s+(?:booked|confirmed|all\s+set|sorted|in\s+the\s+diary)\s+(?:for|on|at)\b/i,
  /\bsee\s+you\s+(?:then|there|tomorrow|on\s+\w+day|next\s+(?:week|mon|tue|wed|thu|fri|sat|sun)\w*|this\s+(?:mon|tue|wed|thu|fri|sat|sun)\w*|(?:mon|tues|wednes|thurs|fri|satur|sun)day|at\s+\d)/i,
];
const NEGATION_BEFORE_RE = /\b(?:not|nothing|no|never|isn'?t|aren'?t|hasn'?t|haven'?t|wasn'?t|unable|couldn'?t|can'?t|cannot|won'?t|until|before|once|unless|if)\b[^.!?]{0,30}$/i;
const NEGATION_AFTER_RE = /^[^.!?]{0,12}\b(?:yet|until|once|unless|if)\b/i;

/**
 * True when the text tells the customer something is booked/confirmed. A negation shortly before the claim
 * ("nothing is booked yet", "not confirmed until") or "yet/until" shortly after it disarms the claim.
 */
export function claimsConfirmation(text: string): boolean {
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  for (const sentence of sentences) {
    for (const re of CLAIM_PATTERNS) {
      const m = sentence.match(re);
      if (!m || m.index === undefined) continue;
      const before = sentence.slice(0, m.index);
      const after = sentence.slice(m.index + m[0].length);
      if (NEGATION_BEFORE_RE.test(before) || NEGATION_AFTER_RE.test(after)) continue;
      return true;
    }
  }
  return false;
}

export const SAFE_UNCONFIRMED_TEXT =
  "I haven't been able to lock that in yet. Let me check the calendar and confirm with you in a moment.";
