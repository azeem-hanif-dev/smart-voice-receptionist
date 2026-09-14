import { DateTime } from "luxon";
import type { VerticalPack } from "../verticals/types.js";
import type { BusinessProfile, ContactContext, EngineState } from "./types.js";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function minuteToClock(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function formatPrice(cents: number | null | undefined, currency: string): string {
  if (cents === null || cents === undefined) return "price on request";
  if (cents === 0) return "free";
  const symbol = currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "PKR" ? "Rs " : `${currency} `;
  return `${symbol}${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export function hoursSummary(profile: BusinessProfile): string {
  const lines: string[] = [];
  for (const p of profile.providers) {
    const rows = profile.hours.filter((h) => h.providerId === p.id).sort((a, b) => a.weekday - b.weekday);
    if (rows.length === 0) {
      lines.push(`- ${p.name}: no regular hours set`);
      continue;
    }
    const parts = rows.map((h) => `${WEEKDAY_NAMES[h.weekday].slice(0, 3)} ${minuteToClock(h.startMinute)}-${minuteToClock(h.endMinute)}`);
    lines.push(`- ${p.name}: ${parts.join(", ")}`);
  }
  return lines.join("\n");
}

/** Deterministic business section (cache-friendly: no timestamps). */
export function businessSection(profile: BusinessProfile, pack: VerticalPack): string {
  const v = pack.vocabulary;
  const services = profile.services
    .map((s) => {
      const offeredBy = profile.providers.filter((p) => p.serviceIds.includes(s.id)).map((p) => p.name);
      return `- ${s.name} (id: ${s.id}) — ${s.durationMinutes} min, ${formatPrice(s.priceCents, s.currency)}${s.description ? `. ${s.description}` : ""}${offeredBy.length ? `. Offered by: ${offeredBy.join(", ")}` : ""}`;
    })
    .join("\n");
  const providers = profile.providers
    .map((p) => `- ${p.name}${p.title ? `, ${p.title}` : ""} (id: ${p.id})`)
    .join("\n");
  const locations = profile.locations
    .map((l) => `- ${l.name}${l.address ? `: ${l.address}` : ""}${l.phone ? ` (phone ${l.phone})` : ""}`)
    .join("\n");
  const r = profile.bookingRules;
  const faqs = profile.faqs.slice(0, 30).map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n");
  return [
    `# Business: ${profile.name}`,
    profile.brandVoice.description ? profile.brandVoice.description : "",
    `Type: ${pack.displayName}. Timezone: ${profile.timezone}.`,
    locations ? `\n## Location(s)\n${locations}` : "",
    `\n## ${v.providerPlural[0].toUpperCase() + v.providerPlural.slice(1)}\n${providers || "- none set up yet"}`,
    `\n## Services\n${services || "- none set up yet"}`,
    `\n## Opening hours (per ${v.provider})\n${hoursSummary(profile)}`,
    `\n## Booking policies\n- Earliest booking: ${r.minLeadMinutes >= 60 ? `${Math.round(r.minLeadMinutes / 60)} hours` : `${r.minLeadMinutes} minutes`} from now.\n- Bookings up to ${r.maxAdvanceDays} days ahead.\n- Changes or cancellations need ${r.cancellationCutoffHours} hours' notice.\n- Reminders are sent ${r.reminderOffsetsMinutes.map((m) => (m >= 60 ? `${Math.round(m / 60)}h` : `${m}min`)).join(" and ")} before the ${v.appointment}.`,
    faqs ? `\n## FAQ\n${faqs}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function verticalSection(pack: VerticalPack): string {
  const v = pack.vocabulary;
  const q = pack.qualificationQuestions
    .map((x) => `- [${x.id}] (${x.when === "always" ? "every booking" : `new ${v.customerPlural} only`}) ${x.ask}${x.options ? ` Options: ${x.options.join(" / ")}.` : ""}`)
    .join("\n");
  return [
    `# Vertical: ${pack.displayName}`,
    `## Terminology\nCall the customer a "${v.customer}", the staff member a "${v.provider}", the booking an "${v.appointment}", and the business a "${v.business}".`,
    `## Tone\n${pack.toneGuidance}`,
    `## Before booking, find out (ask one thing at a time, skip what you already know from memory or the conversation)\n${q}`,
    `## Compliance rules (non-negotiable)\n${pack.complianceRules.map((r) => `- ${r}`).join("\n")}`,
    `## Emergencies\nIf the ${v.customer} describes an emergency, reply with exactly this and then call handoff_to_human with urgency "high": "${pack.emergencyMessage}"`,
  ].join("\n\n");
}

export function basePrompt(profile: BusinessProfile, pack: VerticalPack): string {
  const bv = profile.brandVoice;
  const v = pack.vocabulary;
  return `You are ${bv.assistantName || "the receptionist"}, the WhatsApp receptionist for ${profile.name}. You answer questions, qualify ${v.customerPlural}, book, reschedule and cancel ${v.appointment}s, and hand off to a human when appropriate. You are talking to one ${v.customer} over WhatsApp.

# How to behave
- Be ${bv.tone}. Keep every reply short and WhatsApp-native: one to three brief sentences or a short list. No headings, no markdown tables, no long paragraphs.
- Reply in the ${v.customer}'s language. If they write in Urdu, Spanish, Arabic or anything else, answer in that language (keep service names as they are). Default to ${bv.defaultLanguage === "en" ? "English" : bv.defaultLanguage}.
- Answer only from the business profile, the FAQ and tool results. Never invent prices, hours, availability, policies or staff. If you don't know, say so plainly and offer to have a team member follow up (call handoff_to_human if they want that).
- Ask one question at a time. Use the ${v.customer}'s name once you know it.
${bv.greeting ? `- Opening greeting to use on the first message of a conversation: "${bv.greeting}"` : ""}
${bv.signoff ? `- Sign-off to use when a conversation naturally ends: "${bv.signoff}"` : ""}
${bv.extraInstructions ? `- Owner instructions: ${bv.extraInstructions}` : ""}

# Booking discipline (enforced by the system; violations are rejected)
1. Never propose a date or time you did not receive from check_availability in this conversation.
2. Offer 2 to 4 concrete options, not a wall of times. Say the day and time in the business timezone. When a ${v.customer} asks for "next week" or "Friday", call check_availability for that range.
3. Call create_booking only with a start time and providerId exactly as returned by check_availability.
4. Never say an ${v.appointment} is booked or confirmed until create_booking (or reschedule_booking) returns ok=true. If it fails, apologise briefly and offer the alternatives it returned.
5. To reschedule or cancel, first call find_bookings to identify the ${v.customer}'s ${v.appointment} by their phone number, then check_availability for the new time, then reschedule_booking or cancel_booking.
6. If the ${v.customer} has no provider preference and the business allows it, omit providerId to search all ${v.providerPlural}.
7. Remember useful facts with update_contact_memory (name, preferences, qualification answers) as soon as you learn them.

# Quick-reply buttons
When a short menu helps, end your message with a line like <<buttons: Option A|Option B|Option C>> (max 3 options, each under 20 characters). The system turns it into WhatsApp buttons. After check_availability, slot buttons are added automatically, so just describe the options in words.

# Handing off
Call handoff_to_human (and tell the ${v.customer} a team member will reply here shortly) when they ask for a person, seem frustrated or upset, have a complaint, ask about something outside bookings and the FAQ (medical or professional advice, billing disputes, results), or describe an emergency (give the emergency message first). After handing off, do not keep answering.

# Reminders
${v.customerPlural[0].toUpperCase() + v.customerPlural.slice(1)} may reply to a reminder with "yes" (call confirm_booking), "reschedule" (find_bookings, check_availability, reschedule_booking) or "cancel" (find_bookings, cancel_booking).`;
}

export function contactSection(contact: ContactContext, state: EngineState, now: string, tz: string): string {
  const m = contact.memory;
  const lines: string[] = [];
  const localNow = DateTime.fromISO(now, { zone: tz });
  lines.push(`# Right now\nToday is ${localNow.toFormat("cccc d LLLL yyyy")}, ${localNow.toFormat("HH:mm")} in ${tz}. Use this to interpret "tomorrow", "next week", etc. Dates for tools are YYYY-MM-DD in this timezone.`);
  lines.push(`\n# This customer\n- Phone: ${contact.phoneE164}`);
  if (contact.name || m.name) lines.push(`- Name: ${contact.name ?? m.name}`);
  if (m.language) lines.push(`- Preferred language: ${m.language}`);
  lines.push(`- ${m.isReturning ? "Returning customer" : "No previous visits recorded"}`);
  if (m.preferredProviderName) lines.push(`- Preferred provider: ${m.preferredProviderName}${m.preferredProviderId ? ` (id: ${m.preferredProviderId})` : ""}`);
  if (m.preferences.length) lines.push(`- Preferences: ${m.preferences.join("; ")}`);
  if (m.notes.length) lines.push(`- Notes for staff: ${m.notes.join("; ")}`);
  const q = Object.entries(m.qualification);
  if (q.length) lines.push(`- Known answers: ${q.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  if (m.lastBookingSummary) lines.push(`- Last booking: ${m.lastBookingSummary}`);
  if (contact.upcomingBookings?.length) {
    lines.push(`- Upcoming: ${contact.upcomingBookings.map((b) => `${b.serviceName} on ${b.label} with ${b.providerName} (booking id ${b.id}, ${b.status})`).join("; ")}`);
  }
  if (state.offeredSlots.length) {
    const recent = state.offeredSlots.slice(-8).map((s) => `${s.label ?? s.start} with ${s.providerName ?? s.providerId}`);
    lines.push(`- Slots already offered in this conversation: ${recent.join("; ")}`);
  }
  return lines.join("\n");
}

export interface AssembledPrompt {
  /** Stable part (base + business + vertical). */
  stable: string;
  /** Volatile part (now, contact memory, offered slots, summary). */
  volatile: string;
  full: string;
}

export function assembleSystemPrompt(input: {
  profile: BusinessProfile;
  pack: VerticalPack;
  contact: ContactContext;
  state: EngineState;
  now: string;
  summary?: string | null;
}): AssembledPrompt {
  const stable = [basePrompt(input.profile, input.pack), businessSection(input.profile, input.pack), verticalSection(input.pack)].join("\n\n");
  const volatileParts = [contactSection(input.contact, input.state, input.now, input.profile.timezone)];
  if (input.summary) volatileParts.push(`\n# Earlier in this conversation\n${input.summary}`);
  const volatile = volatileParts.join("\n");
  return { stable, volatile, full: `${stable}\n\n${volatile}` };
}
