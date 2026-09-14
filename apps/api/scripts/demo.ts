/**
 * `pnpm demo` — walks three conversations through the real engine via the simulator channel and prints
 * the transcripts: a dental booking, a salon reschedule and a vet emergency handoff.
 * Needs Postgres + Redis running and `pnpm db:seed` applied. Works with or without ANTHROPIC_API_KEY.
 */
import "reflect-metadata";
import "dotenv/config";
process.env.AR_DISABLE_WORKERS = process.env.AR_DISABLE_WORKERS ?? "1";
import { NestFactory } from "@nestjs/core";
import { DateTime } from "luxon";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/common/prisma.service.js";
import { InboundService } from "../src/inbound/inbound.service.js";
import { BookingsService } from "../src/bookings/bookings.service.js";
import { ConversationsService } from "../src/conversations/conversations.service.js";
import { RemindersService } from "../src/queues/reminders.service.js";
import { env, hasAnthropicKey } from "../src/config.js";

const c = { dim: "\x1b[2m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", bold: "\x1b[1m", reset: "\x1b[0m" };

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  const prisma = app.get(PrismaService).client;
  const inbound = app.get(InboundService);
  const bookings = app.get(BookingsService);
  const conversations = app.get(ConversationsService);

  const orgs = Object.fromEntries(
    await Promise.all(["demo-dental", "demo-salon", "demo-vet"].map(async (slug) => [slug, await prisma.organization.findUnique({ where: { slug } })] as const)),
  );
  for (const [slug, org] of Object.entries(orgs)) if (!org) throw new Error(`Seed org ${slug} is missing. Run \`pnpm db:seed\` first.`);

  console.log(`${c.bold}AI Receptionist demo${c.reset}  model: ${hasAnthropicKey() ? `${env().ANTHROPIC_MODEL} (Anthropic)` : "rule-based demo (no ANTHROPIC_API_KEY)"}\n`);
  const stamp = Date.now().toString().slice(-6);
  let seq = 0;

  async function converse(orgId: string, phone: string, name: string, script: (last: Reply | null, turn: number) => string | { text: string; buttonId: string } | null, opts: { maxTurns?: number } = {}) {
    let last: Reply | null = null;
    for (let turn = 0; turn < (opts.maxTurns ?? 14); turn++) {
      const next = script(last, turn);
      if (next === null) break;
      const msg: { text: string; buttonId?: string } = typeof next === "string" ? { text: next } : next;
      console.log(`${c.cyan}${name}:${c.reset} ${msg.text}`);
      const r = await inbound.handle({ channel: "SIMULATOR", orgId, providerMessageId: `demo-${stamp}-${++seq}`, from: { phoneE164: phone, displayName: name }, kind: msg.buttonId ? "button" : "text", text: msg.text, buttonId: msg.buttonId, receivedAt: new Date().toISOString() });
      last = { text: r.replies.map((x) => x.text).join("\n"), buttons: r.replies.flatMap((x) => x.quickReplies ?? []), status: r.status, conversationId: r.conversationId, handoff: r.handoff };
      if (r.replies.length === 0) console.log(`${c.dim}(no AI reply: conversation is with a human)${c.reset}`);
      for (const rep of r.replies) {
        console.log(`${c.green}Receptionist:${c.reset} ${rep.text.replace(/\n/g, "\n              ")}`);
        if (rep.quickReplies?.length) console.log(`${c.dim}              [${rep.quickReplies.map((b) => b.title).join("] [")}]${c.reset}`);
      }
      if (r.handoff) console.log(`${c.yellow}→ Handed off to a human: ${r.handoff.reason} (urgency ${r.handoff.urgency})${c.reset}`);
    }
    return last;
  }

  /* ---------------- 1. Dental booking ---------------- */
  section("1. Dental — new patient books a check-up (Bright Smile Dental)");
  const dentalPhone = `+1555020${stamp.slice(0, 4)}`;
  const dentalEnd = await converse(orgs["demo-dental"]!.id, dentalPhone, "Sara", (last, turn) => {
    if (turn === 0) return "Hi";
    if (!last) return null;
    const t = last.text.toLowerCase();
    if (/done|booked for/.test(t) && turn > 2) return null;
    if (turn === 1) return "I'd like to book a check-up and clean";
    const slot = last.buttons.find((b) => b.id.startsWith("slot:"));
    if (slot) return { text: slot.title, buttonId: slot.id };
    if (/what name|your name|who am i booking/.test(t)) return "Sara Khan";
    if (/when would you like|which day|another day/.test(t)) return { text: "Next week", buttonId: "opt:Next week" };
    if (last.buttons.length) return { text: last.buttons[0].title, buttonId: last.buttons[0].id };
    if (/reason|visit for|what's the visit/.test(t)) return "Just a routine check-up";
    return "Yes";
  });
  const dentalBooking = await prisma.booking.findFirst({ where: { contact: { phoneE164: dentalPhone } }, include: { service: true, provider: true, org: true } });
  if (dentalBooking) {
    const when = DateTime.fromJSDate(dentalBooking.startAt, { zone: dentalBooking.org.timezone }).toFormat("cccc d LLLL 'at' HH:mm");
    const reminders = await prisma.scheduledMessage.findMany({ where: { bookingId: dentalBooking.id }, orderBy: { runAt: "asc" } });
    console.log(`${c.dim}✔ Booking ${dentalBooking.id}: ${dentalBooking.service.name} with ${dentalBooking.provider.name} on ${when} (source ${dentalBooking.source}). Scheduled: ${reminders.map((r) => r.kind).join(", ")}${c.reset}`);
  } else {
    console.log(`${c.yellow}✘ No booking was created in the dental flow${c.reset}`);
  }
  void dentalEnd;

  /* ---------------- 2. Salon reschedule ---------------- */
  section("2. Salon — returning client moves her appointment (Studio Luxe Hair)");
  const salonOrg = orgs["demo-salon"]!;
  const salonPhone = `+1555021${stamp.slice(0, 4)}`;
  const contact = await prisma.contact.upsert({ where: { orgId_phoneE164: { orgId: salonOrg.id, phoneE164: salonPhone } }, create: { orgId: salonOrg.id, phoneE164: salonPhone, name: "Priya Shah", memory: { name: "Priya Shah", isReturning: true, preferences: [], notes: [], qualification: {} } }, update: {} });
  const service = await prisma.service.findFirstOrThrow({ where: { orgId: salonOrg.id, name: { contains: "cut" } }, include: { providers: true } });
  const providerId = service.providers[0].providerId;
  const avail = await bookings.availability(salonOrg.id, { serviceId: service.id, providerId, fromDate: DateTime.now().setZone(salonOrg.timezone).plus({ days: 2 }).toISODate()! });
  const created = await bookings.create(salonOrg.id, { contactId: contact.id, serviceId: service.id, providerId, startAt: avail.slots[0].start, source: "MANUAL" });
  if (!created.ok) throw new Error(`could not create the salon booking: ${created.message}`);
  console.log(`${c.dim}(existing booking: ${created.booking.serviceName} on ${created.booking.label} with ${created.booking.providerName})${c.reset}`);
  await converse(salonOrg.id, salonPhone, "Priya", (last, turn) => {
    if (turn === 0) return "Hi, I need to move my appointment to next week";
    if (!last) return null;
    const t = last.text.toLowerCase();
    if (/all changed|now on/.test(t)) return null;
    const slot = last.buttons.find((b) => b.id.startsWith("slot:"));
    if (slot) return { text: slot.title, buttonId: slot.id };
    if (/when would you like|which day|another day/.test(t)) return { text: "Next week", buttonId: "opt:Next week" };
    if (last.buttons.length) return { text: last.buttons[0].title, buttonId: last.buttons[0].id };
    return "the first one";
  });
  const moved = await prisma.booking.findUniqueOrThrow({ where: { id: created.booking.id } });
  console.log(`${c.dim}✔ Booking ${moved.id} moved from ${created.booking.label} to ${DateTime.fromJSDate(moved.startAt, { zone: salonOrg.timezone }).toFormat("ccc d LLL, HH:mm")}${c.reset}`);

  /* ---------------- 3. Vet emergency handoff ---------------- */
  section("3. Vet — emergency triggers the emergency message and a human handoff (Oak Tree Vets)");
  const vetOrg = orgs["demo-vet"]!;
  const vetPhone = `+1555022${stamp.slice(0, 4)}`;
  const vetEnd = await converse(vetOrg.id, vetPhone, "Omar", (last, turn) => {
    if (turn === 0) return "My dog ate a bar of chocolate an hour ago and now he's collapsed";
    if (turn === 1) return "Is anyone there??";
    return null;
  });
  if (vetEnd?.conversationId) {
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: vetEnd.conversationId } });
    console.log(`${c.dim}✔ Conversation ${conv.id} is now ${conv.status} — reason: ${conv.handoffReason}${c.reset}`);
    const owner = await prisma.membership.findFirstOrThrow({ where: { orgId: vetOrg.id, role: "OWNER" } });
    await conversations.staffMessage(vetOrg.id, conv.id, owner.userId, "This is Dr Kim. Bring him straight in, we're ready for you.");
    console.log(`${c.yellow}Staff (from the inbox):${c.reset} This is Dr Kim. Bring him straight in, we're ready for you.`);
    await conversations.handback(vetOrg.id, conv.id);
    console.log(`${c.dim}(staff handed the conversation back to the AI)${c.reset}`);
    await converse(vetOrg.id, vetPhone, "Omar", (_l, turn) => (turn === 0 ? "Thank you so much" : null));
  }

  if (process.env.DEMO_KEEP === "1") {
    console.log(`\n${c.bold}Done.${c.reset} Open http://localhost:3000 and sign in as owner@dental.demo / demo1234 to see these conversations in the inbox and calendar.`);
  } else {
    // Leave the seeded demo orgs exactly as the seed made them (set DEMO_KEEP=1 to keep these conversations).
    const reminders = app.get(RemindersService);
    for (const [orgId, phone] of [[orgs["demo-dental"]!.id, dentalPhone], [salonOrg.id, salonPhone], [vetOrg.id, vetPhone]] as const) {
      const contact = await prisma.contact.findUnique({ where: { orgId_phoneE164: { orgId, phoneE164: phone } } });
      if (!contact) continue;
      for (const b of await prisma.booking.findMany({ where: { contactId: contact.id } })) await reminders.cancelForBooking(b.id);
      await prisma.contact.delete({ where: { id: contact.id } });
    }
    console.log(`\n${c.bold}Done.${c.reset} Demo data was cleaned up again (run with DEMO_KEEP=1 to keep these conversations in the inbox).`);
  }
  await app.close();
}

interface Reply {
  text: string;
  buttons: { id: string; title: string }[];
  status: string | null;
  conversationId: string | null;
  handoff?: { reason: string; urgency: string };
}

function section(title: string) {
  console.log(`\n${c.bold}── ${title} ──${c.reset}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
