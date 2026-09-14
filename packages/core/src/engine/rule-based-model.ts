import type Anthropic from "@anthropic-ai/sdk";
import { DateTime } from "luxon";
import type { BookingSummary, ModelClient, ModelContext, ModelRequest, ModelResponse, OfferedSlot } from "./types.js";
import { callTools, reply, toolUse } from "./scripted-model.js";
import type { QualificationQuestion } from "../verticals/types.js";
import { formatPrice } from "./prompt.js";

/**
 * Deterministic "model" used when no ANTHROPIC_API_KEY is configured. It is a keyword-driven state machine
 * that produces the same tool calls a real model would, so the entire pipeline (guardrails, booking,
 * reminders, inbox, analytics) runs for real in a credential-free demo. English only; the real model handles
 * other languages.
 */

type Intent = "book" | "reschedule" | "cancel" | "confirm";
type Pending =
  | { kind: "service" }
  | { kind: "qual"; id: string }
  | { kind: "name" }
  | { kind: "day" }
  | { kind: "slot" }
  | { kind: "which_booking"; action: Intent }
  | { kind: "offer_human" }
  | { kind: "offer_rebook" };

interface DemoState {
  intent?: Intent;
  serviceId?: string;
  providerId?: string;
  reason?: string;
  name?: string;
  qual?: Record<string, string>;
  askedQual?: string[];
  pending?: Pending;
  fromDate?: string;
  toDate?: string;
  preference?: "morning" | "afternoon" | "evening" | "any";
  targetBookingId?: string;
  candidates?: BookingSummary[];
  greeted?: boolean;
}

const RE = {
  greeting: /^(hi|hello|hey|hiya|salaam|assalam.*|good (morning|afternoon|evening)|hi there)[!. ]*$/i,
  thanks: /^(thanks|thank you|thank you so much|thanks so much|thanks a lot|many thanks|thankyou|ty|cheers|great|perfect|ok|okay|cool)( very much| so much| a lot)?[!. ]*$/i,
  bye: /^(bye|goodbye|no thanks|not now|no that's all|that's all|nothing else|no)[,!. ]*(thanks)?[!. ]*$/i,
  reschedule: /reschedul|\bmove\b|change (my|the|our) (appointment|booking|time|slot)|different (time|day)|push (it )?back|bring (it )?forward/i,
  cancel: /\bcancel/i,
  confirmYes: /^(yes|yeah|yep|yup|confirm|i confirm|on my way|i'?ll be there|see you then|sure)[!. ]*/i,
  book: /\b(book|appointment|schedule|come in|see (a|the|someone|one of)|slot|available|availability|need (a|an|to)|get in|fit me|make an?)\b/i,
  frustrated: /useless|stupid|ridiculous|angry|frustrat|terrible|worst|not helpful|waste of time|annoy/i,
  advice: /should i (take|use|stop)|what (medicine|medication|dose|painkiller|antibiotic)|is (it|this|that) (normal|serious|dangerous|infected)|diagnos|what'?s wrong with (my|his|her|the)|do you think (it|i|he|she|my) (is|has|have|need|might)|(is|are) (my|his|her) \w+ (infected|broken|serious)|looks? (infected|swollen|broken|cracked)|what should i (put|use|apply|do about)|prescri(be|ption)/i,
  smallTalk: /^(how are you|how're you|how are u|how is it going|how's it going|how do you do|what's up|whats up|are you (a )?(bot|robot|human|real)|who are you|what are you|what can you do|help)\b[?!. ]*$/i,
  hours: /\b(timings?|opening hours|open(ing)? (times?|hours?)|what time (do|does|are) (you|they|she|he)|when (are|do|does) (you|they|she|he) (open|close|work|start|finish)|working hours|(are|is) (you|she|he|they) (open|available|in) on|hours (on|for|today|tomorrow)|schedule for the day|throughout the day|when (is|are) [\w .]+ (available|in|working|on duty))\b/i,
  faqCue: /price|cost|how much|insurance|parking|open|hours|where|address|referral|patch test|walk|payment|pay|children|kids|fast|exotic|emergency|after hours|voucher|cancellation policy|wear|bring|blood|prescription|plan|bulk/i,
  later: /^(not now|later|maybe later|no thanks|no)[,!. ]*(thanks)?[!. ]*$/i,
  yes: /^(yes|yeah|yep|yup|sure|please|ok|okay|go ahead|yes,? book one|yes,? rebook)(,? please)?[!. ]*$/i,
  slotPick: /start=([^,\s)]+),\s*providerId=([^\s)]+)/,
};

function lastUserText(msg: Anthropic.MessageParam | undefined): string {
  if (!msg || msg.role !== "user") return "";
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function toolResultsOf(messages: Anthropic.MessageParam[]): { name: string; value: any; isError: boolean }[] {
  const last = messages[messages.length - 1];
  const prev = messages[messages.length - 2];
  if (!last || last.role !== "user" || typeof last.content === "string") return [];
  const results = last.content.filter((b): b is Anthropic.ToolResultBlockParam => b.type === "tool_result");
  if (results.length === 0) return [];
  const names = new Map<string, string>();
  if (prev && prev.role === "assistant" && Array.isArray(prev.content)) {
    for (const b of prev.content) if (b.type === "tool_use") names.set(b.id, b.name);
  }
  return results.map((r) => {
    let value: unknown = r.content;
    if (typeof r.content === "string") {
      try {
        value = JSON.parse(r.content);
      } catch {
        value = r.content;
      }
    }
    return { name: names.get(r.tool_use_id) ?? "", value, isError: Boolean(r.is_error) };
  });
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export class RuleBasedModelClient implements ModelClient {
  readonly name = "rule-based-demo";

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const ctx = req.metadata.context;
    const demo = ((ctx.state.demo ??= {}) as DemoState);
    demo.qual ??= {};
    demo.askedQual ??= [];
    const results = toolResultsOf(req.messages);
    if (results.length) return this.afterTools(results, ctx, demo);
    const text = lastUserText(req.messages[req.messages.length - 1]).trim();
    if (text.startsWith("[System]")) return reply("Nothing is booked yet. Which of the times I mentioned would you like?");
    return this.onText(text, ctx, demo);
  }

  /* ------------------------------------------------------------------ user text ------------------------------------------------------------------ */

  private onText(text: string, ctx: ModelContext, demo: DemoState): ModelResponse {
    const v = ctx.pack.vocabulary;
    const lower = text.toLowerCase();

    // Slot selection (button tap or typed) takes priority.
    const pick = this.pickSlot(text, ctx);
    if (pick && (demo.pending?.kind === "slot" || demo.intent)) return this.bookPickedSlot(pick, ctx, demo);

    if (RE.frustrated.test(lower)) {
      return callTools(toolUse("handoff_to_human", { reason: "Customer seems frustrated", urgency: "high", summary: text.slice(0, 200) }));
    }
    if (RE.smallTalk.test(text.trim())) {
      const v = ctx.pack.vocabulary;
      const who = /bot|robot|human|real|who are you|what are you/i.test(text)
        ? `I'm ${ctx.profile.brandVoice.assistantName || "the assistant"}, the automated receptionist for ${ctx.profile.name}. A team member can step in any time you ask.`
        : `I'm doing well, thanks for asking!`;
      return reply(`${who} I can book, move or cancel ${v.appointment}s and answer questions about ${ctx.profile.name}. What can I do for you? <<buttons: Book ${v.appointment}|Reschedule|Ask a question>>`);
    }
    if (RE.hours.test(lower)) return reply(this.hoursReply(text, ctx));
    if (RE.advice.test(lower)) {
      return reply(`I'm not able to give ${ctx.pack.id === "SALON" ? "professional" : "medical"} advice, but I can book you in with a ${v.provider} or ask a team member to call you. <<buttons: Book ${v.appointment}|Talk to a person>>`);
    }
    if (/^talk to a person$/i.test(text) || (demo.pending?.kind === "offer_human" && RE.yes.test(lower))) {
      demo.pending = undefined;
      return callTools(toolUse("handoff_to_human", { reason: "Customer asked for follow-up", urgency: "normal", summary: text.slice(0, 200) }));
    }
    if (demo.pending?.kind === "offer_human" && RE.later.test(lower)) {
      demo.pending = undefined;
      return reply("No problem. Is there anything else I can help with?");
    }

    // Reminder replies ("yes", "I'll be there") when the customer has an upcoming booking.
    if (
      RE.confirmYes.test(lower) &&
      (ctx.contact.upcomingBookings?.length ?? 0) > 0 &&
      !demo.pending &&
      !/\b(book(ing)? (a|an|another|new)|new appointment|reschedul|cancel)\b/.test(lower)
    ) {
      this.resetFlow(demo, "confirm");
      return callTools(toolUse("find_bookings", { includePast: false }));
    }

    // Strong intents override any pending question.
    if (RE.cancel.test(lower) && !/cancellation policy/.test(lower)) {
      this.resetFlow(demo, "cancel");
      return callTools(toolUse("find_bookings", { includePast: false }));
    }
    if (RE.reschedule.test(lower)) {
      this.resetFlow(demo, "reschedule");
      this.absorbDay(text, ctx, demo);
      return callTools(toolUse("find_bookings", { includePast: false }));
    }
    if (demo.pending?.kind === "offer_rebook") {
      demo.pending = undefined;
      if (RE.yes.test(lower) || /rebook|book/.test(lower)) {
        this.resetFlow(demo, "book");
        return this.nextBookingStep(text, ctx, demo, true);
      }
      return reply("No problem. Message me any time and I'll find you a slot.");
    }

    // Answers to pending questions.
    if (demo.pending) {
      const p = demo.pending;
      if (p.kind === "name") {
        const name = this.parseName(text);
        if (!name) {
          this.absorbDay(text, ctx, demo);
          return reply("Sorry, what name should I put the booking under?");
        }
        demo.name = name;
        demo.pending = undefined;
        return callTools(toolUse("update_contact_memory", { name: demo.name }));
      }
      if (p.kind === "qual") {
        // If the customer answered something else (a day, a service), keep the flow moving instead of storing it as the answer.
        if (this.absorbDay(text, ctx, demo) || this.matchService(text, ctx)) {
          const svc = this.matchService(text, ctx);
          if (svc) demo.serviceId = svc.id;
          demo.askedQual = demo.askedQual!.filter((id) => id !== p.id);
          demo.pending = undefined;
          return this.nextBookingStep(text, ctx, demo);
        }
        demo.qual![p.id] = text.replace(/^opt:/, "").slice(0, 120);
        demo.pending = undefined;
        return callTools(toolUse("update_contact_memory", { qualification: { [p.id]: demo.qual![p.id] } }));
      }
      if (p.kind === "service") {
        const svc = this.matchService(text, ctx);
        if (!svc) return reply(`Sorry, which of these did you mean? ${this.serviceMenu(ctx)}`);
        demo.serviceId = svc.id;
        demo.pending = undefined;
        return this.nextBookingStep(text, ctx, demo);
      }
      if (p.kind === "day") {
        if (!this.absorbDay(text, ctx, demo)) {
          return reply(`Which day suits you? You can say "tomorrow", a weekday, or "next week". <<buttons: Tomorrow|This week|Next week>>`);
        }
        demo.pending = undefined;
        return this.nextBookingStep(text, ctx, demo);
      }
      if (p.kind === "slot") {
        if (this.absorbDay(text, ctx, demo)) return this.nextBookingStep(text, ctx, demo);
        return reply(`Which of those times would you like? You can tap one or say "the first one". Or tell me another day.`);
      }
      if (p.kind === "which_booking") {
        const idx = this.parseIndex(text, demo.candidates?.length ?? 0);
        const chosen = idx !== null ? demo.candidates?.[idx] : undefined;
        if (!chosen) return reply(`Which one? Reply with the number: ${this.bookingMenu(demo.candidates ?? [])}`);
        demo.pending = undefined;
        return this.actOnBooking(chosen, p.action, ctx, demo, text);
      }
    }

    if (RE.greeting.test(text)) {
      demo.greeted = true;
      const name = ctx.contact.name ?? ctx.contact.memory.name;
      const greet = ctx.profile.brandVoice.greeting || `Hi${name ? ` ${name.split(" ")[0]}` : ""}! I'm ${ctx.profile.brandVoice.assistantName || "the receptionist"} at ${ctx.profile.name}.`;
      return reply(`${greet} I can book, move or cancel ${v.appointment}s and answer questions. What can I do for you? <<buttons: Book ${v.appointment}|Reschedule|Ask a question>>`);
    }
    if (RE.thanks.test(text)) return reply(`You're welcome! Message me any time. ${ctx.profile.brandVoice.signoff}`.trim());
    if (RE.bye.test(text)) return reply(`No problem. Have a good day! ${ctx.profile.brandVoice.signoff}`.trim());
    if (/^ask a question$/i.test(text)) return reply("Sure, what would you like to know?");


    const svc = this.matchService(text, ctx);
    if (RE.book.test(lower) || svc || demo.intent === "book") {
      if (!demo.intent) this.resetFlow(demo, "book");
      if (svc) demo.serviceId = svc.id;
      if (!demo.reason && text.length > 12 && !RE.greeting.test(text)) demo.reason = text.slice(0, 160);
      this.absorbDay(text, ctx, demo);
      this.absorbProvider(text, ctx, demo);
      return this.nextBookingStep(text, ctx, demo);
    }

    if (RE.faqCue.test(lower) || text.endsWith("?")) {
      return callTools(toolUse("search_faq", { query: text }));
    }

    return reply(`I can help you book, move or cancel an ${v.appointment}, or answer questions about ${ctx.profile.name}. What would you like to do? <<buttons: Book ${v.appointment}|Reschedule|Ask a question>>`);
  }

  /* ------------------------------------------------------------------ tool results ------------------------------------------------------------------ */

  private afterTools(results: { name: string; value: any; isError: boolean }[], ctx: ModelContext, demo: DemoState): ModelResponse {
    const r = results[results.length - 1];
    const v = ctx.pack.vocabulary;
    switch (r.name) {
      case "update_contact_memory":
        return this.nextBookingStep("", ctx, demo);
      case "search_faq": {
        const hits = (r.value?.hits ?? []) as { question: string; answer: string }[];
        if (hits.length) return reply(`${hits[0].answer}\n\nAnything else I can help with?`);
        demo.pending = { kind: "offer_human" };
        return reply(`I'm not sure about that one and I don't want to guess. Would you like a team member to get back to you here? <<buttons: Yes, please|No thanks>>`);
      }
      case "get_business_info":
        return reply(this.serviceMenu(ctx));
      case "check_availability": {
        const slots = (r.value?.slots ?? []) as OfferedSlot[];
        if (r.isError || slots.length === 0) {
          demo.pending = { kind: "day" };
          return reply(`I couldn't find anything free then. Would another day work? <<buttons: Tomorrow|This week|Next week>>`);
        }
        demo.pending = { kind: "slot" };
        const lines = slots.map((s, i) => `${i + 1}. ${s.label} with ${s.providerName ?? "our team"}`).join("\n");
        const verb = demo.intent === "reschedule" ? "move it to" : "offer";
        return reply(`I can ${verb} one of these:\n${lines}\nWhich works for you?`);
      }
      case "create_booking": {
        if (r.value?.ok) {
          const b = r.value.booking as BookingSummary;
          const name = demo.name ?? ctx.contact.name ?? ctx.contact.memory.name;
          this.resetFlow(demo, undefined);
          return reply(`Done${name ? `, ${name.split(" ")[0]}` : ""}! Your ${b.serviceName} is booked for ${b.label} with ${b.providerName}. You'll get a reminder before the ${v.appointment}. Anything else I can help with?`);
        }
        if (r.value?.reason === "SLOT_TAKEN" || r.isError) {
          return callTools(toolUse("check_availability", this.availabilityArgs(ctx, demo)));
        }
        return reply(`Sorry, I couldn't book that: ${r.value?.message ?? "unknown error"}. Would you like a team member to help? <<buttons: Yes, please|No thanks>>`);
      }
      case "find_bookings": {
        const bookings = (r.value?.bookings ?? []) as BookingSummary[];
        const action = demo.intent ?? "reschedule";
        if (bookings.length === 0) {
          this.resetFlow(demo, undefined);
          demo.pending = { kind: "offer_rebook" };
          return reply(`I can't find an upcoming ${v.appointment} under this number. Would you like to book one? <<buttons: Yes, book one|No thanks>>`);
        }
        if (bookings.length === 1) return this.actOnBooking(bookings[0], action, ctx, demo, "");
        demo.candidates = bookings;
        demo.pending = { kind: "which_booking", action };
        return reply(`You have ${bookings.length} upcoming ${v.appointment}s. Which one? ${this.bookingMenu(bookings)}`);
      }
      case "reschedule_booking": {
        if (r.value?.ok) {
          const b = r.value.booking as BookingSummary;
          this.resetFlow(demo, undefined);
          return reply(`All changed. Your ${b.serviceName} is now on ${b.label} with ${b.providerName}. Anything else?`);
        }
        if (r.value?.reason === "TOO_LATE_TO_CHANGE") {
          demo.pending = { kind: "offer_human" };
          return reply(`That ${v.appointment} is too close to change automatically (${ctx.profile.bookingRules.cancellationCutoffHours} hours' notice needed). Shall I ask a team member to help? <<buttons: Yes, please|No thanks>>`);
        }
        return callTools(toolUse("check_availability", this.availabilityArgs(ctx, demo)));
      }
      case "cancel_booking": {
        this.resetFlow(demo, undefined);
        if (r.value?.ok) {
          demo.pending = { kind: "offer_rebook" };
          return reply(`Your ${v.appointment} has been cancelled. Would you like to book another time? <<buttons: Yes, rebook|No thanks>>`);
        }
        return reply(`I couldn't cancel that: ${r.value?.message ?? "unknown error"}. A team member can help if you reply "talk to a person".`);
      }
      case "confirm_booking": {
        this.resetFlow(demo, undefined);
        return reply(r.value?.ok ? `Great, thanks for confirming. See you then!` : `I couldn't find that ${v.appointment}. Reply "reschedule" or "cancel" if you need to change it.`);
      }
      case "handoff_to_human":
        return reply("Of course. I've let the team know and a team member will reply to you here shortly.");
      default:
        return reply("Anything else I can help with?");
    }
  }

  /* ------------------------------------------------------------------ booking flow ------------------------------------------------------------------ */

  private nextBookingStep(text: string, ctx: ModelContext, demo: DemoState, skipMenuIfKnown = false): ModelResponse {
    const v = ctx.pack.vocabulary;
    if (!demo.intent) demo.intent = "book";
    if (!demo.serviceId) {
      if (ctx.profile.services.length === 1) demo.serviceId = ctx.profile.services[0].id;
      else {
        demo.pending = { kind: "service" };
        void skipMenuIfKnown;
        return reply(`Sure. Which service would you like? ${this.serviceMenu(ctx)}`);
      }
    }
    // Qualification questions from the vertical pack.
    const known = { ...ctx.contact.memory.qualification, ...demo.qual };
    const isReturning = ctx.contact.memory.isReturning;
    const questions: QualificationQuestion[] = ctx.pack.qualificationQuestions.filter((q) => q.when === "always" || (q.when === "new_customer" && !isReturning));
    for (const q of questions) {
      if (known[q.id] || demo.askedQual!.includes(q.id)) continue;
      if (demo.askedQual!.length >= 3) break;
      if (q.id === "reason" && demo.reason) {
        demo.qual![q.id] = demo.reason;
        continue;
      }
      if (q.id === "pain" && !/pain|ache|hurt/i.test(demo.reason ?? "")) continue;
      demo.askedQual!.push(q.id);
      demo.pending = { kind: "qual", id: q.id };
      const buttons = q.options?.length ? ` <<buttons: ${q.options.slice(0, 3).join("|")}>>` : "";
      return reply(`${q.prompt}${buttons}`);
    }
    if (!demo.name && !ctx.contact.name && !ctx.contact.memory.name) {
      demo.pending = { kind: "name" };
      return reply("And who am I booking this for? Just your name is fine.");
    }
    if (!demo.fromDate) {
      demo.pending = { kind: "day" };
      return reply(`When would you like to come in? <<buttons: Tomorrow|This week|Next week>>`);
    }
    demo.pending = { kind: "slot" };
    return callTools(toolUse("check_availability", this.availabilityArgs(ctx, demo)));
  }

  private availabilityArgs(ctx: ModelContext, demo: DemoState) {
    const args: Record<string, unknown> = { serviceId: demo.serviceId, fromDate: demo.fromDate, toDate: demo.toDate, preference: demo.preference ?? "any" };
    if (demo.providerId) args.providerId = demo.providerId;
    return args;
  }

  private bookPickedSlot(pick: { start: string; providerId: string }, ctx: ModelContext, demo: DemoState): ModelResponse {
    demo.pending = undefined;
    if (demo.intent === "reschedule" && demo.targetBookingId) {
      return callTools(toolUse("reschedule_booking", { bookingId: demo.targetBookingId, newStartAt: pick.start, providerId: pick.providerId }));
    }
    const customerName = demo.name ?? ctx.contact.name ?? ctx.contact.memory.name ?? "Customer";
    const notes = [demo.reason, ...Object.entries(demo.qual ?? {}).map(([k, val]) => `${k}: ${val}`)].filter(Boolean).join("; ") || undefined;
    return callTools(toolUse("create_booking", { serviceId: demo.serviceId, providerId: pick.providerId, startAt: pick.start, customerName, notes }));
  }

  private actOnBooking(b: BookingSummary, action: Intent, ctx: ModelContext, demo: DemoState, text: string): ModelResponse {
    demo.targetBookingId = b.id;
    demo.serviceId = b.serviceId;
    if (action === "cancel") return callTools(toolUse("cancel_booking", { bookingId: b.id, reason: text.slice(0, 120) || undefined }));
    if (action === "confirm") return callTools(toolUse("confirm_booking", { bookingId: b.id }));
    if (!demo.fromDate) {
      demo.pending = { kind: "day" };
      return reply(`Your ${b.serviceName} is on ${b.label} with ${b.providerName}. When would you like to move it to? <<buttons: Tomorrow|This week|Next week>>`);
    }
    demo.pending = { kind: "slot" };
    return callTools(toolUse("check_availability", this.availabilityArgs(ctx, demo)));
  }

  /* ------------------------------------------------------------------ parsing helpers ------------------------------------------------------------------ */

  private resetFlow(demo: DemoState, intent: Intent | undefined) {
    demo.intent = intent;
    demo.serviceId = undefined;
    demo.providerId = undefined;
    demo.reason = undefined;
    demo.pending = undefined;
    demo.fromDate = undefined;
    demo.toDate = undefined;
    demo.preference = undefined;
    demo.targetBookingId = undefined;
    demo.candidates = undefined;
  }

  private matchService(text: string, ctx: ModelContext) {
    const lower = text.toLowerCase();
    const words = new Set(lower.split(/[^a-z0-9+]+/).filter(Boolean));
    const STOP = new Set(["and", "with", "the", "for", "plus", "spa", "combo", "package", "regular", "visit", "first", "under", "consultation"]);
    let best: { id: string; score: number; len: number } | null = null;
    for (const s of ctx.profile.services) {
      const name = s.name.toLowerCase();
      let score = lower.includes(name) ? 100 : 0;
      for (const w of name.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w))) {
        if (words.has(w)) score += w.length; // whole-word matches only: "mani" does not match "manicure"
      }
      if (score > 0 && (!best || score > best.score || (score === best.score && name.length < best.len))) best = { id: s.id, score, len: name.length };
    }
    if (best) return ctx.profile.services.find((s) => s.id === best!.id) ?? null;
    // Common synonyms
    const synonyms: [RegExp, RegExp][] = [
      [/check ?up|cleaning|clean|hygien|routine/i, /check|clean/i],
      [/tooth ?ache|pain|broken tooth|emergency/i, /emergency|toothache/i],
      [/haircut|cut|trim/i, /cut/i],
      [/colou?r|dye|highlights|balayage/i, /colou?r|highlight/i],
      [/vaccin|shot|jab|booster/i, /vaccin/i],
      [/massage/i, /massage/i],
      [/adjust/i, /adjust/i],
      [/assess|first time|new patient/i, /initial|new patient/i],
      [/nails?\b.*(done|paint)|polish/i, /manicure/i],
      [/toes|feet|foot/i, /pedicure/i],
      [/gp|doctor|consult/i, /consult/i],
    ];
    for (const [cue, target] of synonyms) {
      if (cue.test(lower)) {
        const s = ctx.profile.services.find((x) => target.test(x.name));
        if (s) return s;
      }
    }
    return null;
  }

  /** Opening hours from the business profile, narrowed to a provider when one is named. */
  private hoursReply(text: string, ctx: ModelContext): string {
    const lower = text.toLowerCase();
    const named = ctx.profile.providers.filter((p) => {
      const surname = p.name.split(" ").pop()?.toLowerCase() ?? "";
      return surname.length >= 3 && lower.includes(surname);
    });
    const providers = named.length ? named : ctx.profile.providers;
    const lines = providers.map((p) => {
      const rows = ctx.profile.hours.filter((h) => h.providerId === p.id).sort((a, b) => a.weekday - b.weekday);
      if (!rows.length) return `${p.name}: no regular hours set`;
      const parts = rows.map((h) => `${WEEKDAYS[h.weekday]} ${clock(h.startMinute)}–${clock(h.endMinute)}`);
      return `${p.name}: ${parts.join(", ")}`;
    });
    const v = ctx.pack.vocabulary;
    return `${named.length ? "Here are the hours:" : `Our ${v.providerPlural} are available at these times:`}\n${lines.join("\n")}\nWould you like me to book a time? <<buttons: Book ${v.appointment}|Ask a question>>`;
  }

  private serviceMenu(ctx: ModelContext) {
    const list = ctx.profile.services.slice(0, 6).map((s) => `• ${s.name} (${s.durationMinutes} min, ${formatPrice(s.priceCents, s.currency)})`).join("\n");
    const buttons = ctx.profile.services.slice(0, 3).map((s) => s.name.slice(0, 20)).join("|");
    return `\n${list}\n<<buttons: ${buttons}>>`;
  }

  private bookingMenu(list: BookingSummary[]) {
    return list.map((b, i) => `\n${i + 1}. ${b.serviceName} on ${b.label} with ${b.providerName}`).join("") + `\n<<buttons: ${list.slice(0, 3).map((_, i) => `${i + 1}`).join("|")}>>`;
  }

  private parseIndex(text: string, n: number): number | null {
    const m = text.match(/\b(\d+)\b/);
    if (m) {
      const i = Number(m[1]) - 1;
      return i >= 0 && i < n ? i : null;
    }
    const words = ["first", "second", "third", "fourth"];
    const w = words.findIndex((x) => new RegExp(`\\b${x}\\b`, "i").test(text));
    return w >= 0 && w < n ? w : null;
  }

  /** Returns a plausible name or null when the text is clearly not one (yes/no, a day, a service...). */
  private parseName(text: string): string | null {
    const stripped = text.replace(/^(my name is|my name's|i am|i'm|it's|its|this is|name:|name is|it is|call me)\s+/i, "").trim();
    if (!stripped || /\d/.test(stripped)) return null;
    const lower = stripped.toLowerCase();
    if (RE.yes.test(lower) || RE.later.test(lower) || RE.thanks.test(lower) || RE.bye.test(lower)) return null;
    if (/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week|morning|afternoon|evening|book|appointment|cancel|reschedule|insurance|patient|anyone|whoever)\b/.test(lower)) return null;
    const words = stripped.replace(/[^\p{L}\p{M}' -]/gu, "").split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 4) return null;
    return words.slice(0, 3).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  }

  private absorbProvider(text: string, ctx: ModelContext, demo: DemoState) {
    const lower = text.toLowerCase();
    for (const p of ctx.profile.providers) {
      const surname = p.name.split(" ").pop()?.toLowerCase() ?? "";
      if (surname.length >= 3 && lower.includes(surname)) demo.providerId = p.id;
    }
    if (/anyone|any (one|provider|stylist|dentist|doctor|vet)|whoever|no preference|don'?t mind/i.test(lower)) demo.providerId = undefined;
  }

  /** Parse a day/time preference from text. Returns true if a range was set. */
  private absorbDay(text: string, ctx: ModelContext, demo: DemoState): boolean {
    const lower = text.toLowerCase();
    const tz = ctx.profile.timezone;
    const today = DateTime.fromISO(ctx.now, { zone: tz }).startOf("day");
    if (/morning/.test(lower)) demo.preference = "morning";
    else if (/afternoon/.test(lower)) demo.preference = "afternoon";
    else if (/evening|after work|after 5/.test(lower)) demo.preference = "evening";
    const set = (from: DateTime, to: DateTime) => {
      demo.fromDate = from.toISODate()!;
      demo.toDate = to.toISODate()!;
      return true;
    };
    const iso = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (iso) return set(DateTime.fromISO(iso[1], { zone: tz }), DateTime.fromISO(iso[1], { zone: tz }));
    if (/\btoday\b|\basap\b|as soon as|earliest|first available|soonest|right away/.test(lower)) return set(today, today.plus({ days: 6 }));
    if (/\btomorrow\b/.test(lower)) return set(today.plus({ days: 1 }), today.plus({ days: 1 }));
    if (/next week/.test(lower)) {
      const nextMon = today.plus({ days: (8 - today.weekday) % 7 || 7 });
      return set(nextMon, nextMon.plus({ days: 6 }));
    }
    if (/this week|sometime this week/.test(lower)) return set(today, today.plus({ days: 7 - today.weekday }));
    if (/\bweekend\b/.test(lower)) {
      const sat = today.plus({ days: (6 - today.weekday + 7) % 7 || 7 });
      return set(sat, sat.plus({ days: 1 }));
    }
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    for (let i = 0; i < days.length; i++) {
      const abbr = days[i].slice(0, 3);
      if (new RegExp(`\\b${days[i]}\\b|\\b${abbr}\\b`).test(lower)) {
        const target = i + 1; // luxon weekday 1..7
        let delta = (target - today.weekday + 7) % 7;
        if (delta === 0) delta = 7; // "Tuesday" said on a Tuesday means next Tuesday
        // "next Friday" said on a Tuesday means the Friday of next week; "next Monday" is simply the coming Monday.
        if (/\bnext\b/.test(lower) && target > today.weekday) delta += 7;
        const d = today.plus({ days: delta });
        return set(d, d);
      }
    }
    const dm = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/);
    if (dm) {
      const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(dm[2]) + 1;
      let d = DateTime.fromObject({ year: today.year, month, day: Number(dm[1]) }, { zone: tz });
      if (d < today) d = d.plus({ years: 1 });
      if (d.isValid) return set(d, d);
    }
    return false;
  }

  private pickSlot(text: string, ctx: ModelContext): { start: string; providerId: string } | null {
    const m = text.match(RE.slotPick);
    if (m) return { start: m[1], providerId: m[2] };
    const offered = ctx.state.offeredSlots;
    if (offered.length === 0) return null;
    const latestAt = offered[offered.length - 1].offeredAt;
    const batch = offered.filter((s) => s.offeredAt === latestAt);
    const idx = this.parseIndex(text, batch.length);
    if (idx !== null && /\b(first|second|third|fourth|option|number|\d)\b/i.test(text) && !/\d{1,2}:\d{2}/.test(text)) return batch[idx];
    const time = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (time) {
      let hour = Number(time[1]);
      const minute = Number(time[2] ?? "0");
      if (time[3]?.toLowerCase() === "pm" && hour < 12) hour += 12;
      if (time[3]?.toLowerCase() === "am" && hour === 12) hour = 0;
      const found = batch.find((s) => {
        const d = DateTime.fromISO(s.start, { zone: ctx.profile.timezone });
        return d.hour === hour && d.minute === minute;
      });
      if (found) return found;
    }
    return null;
  }
}
