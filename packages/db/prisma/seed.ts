/**
 * Seeds one demo organization per vertical with realistic providers, services, hours, FAQs, contacts,
 * past conversations, bookings and analytics events. Idempotent: existing demo orgs are replaced.
 *
 * Logins: owner@<vertical>.demo / demo1234   (dental, clinic, salon, physio, vet, chiro)
 */
import "dotenv/config";
import argon2 from "argon2";
import { DateTime } from "luxon";
import { PrismaClient, type Prisma } from "@prisma/client";
import { busyRangeFor, formatSlotLabel, listVerticalPacks, renderTemplate, type VerticalPack } from "@ar/core";
import { DEFAULT_BOOKING_RULES, type ScheduledKind } from "@ar/shared";

const prisma = new PrismaClient({ log: ["warn"] });
export const DEMO_PASSWORD = "demo1234";

interface OrgSeed {
  slug: string;
  name: string;
  timezone: string;
  currency: string;
  address: string;
  phone: string;
  providers: { name: string; title: string; color: string; serviceFilter?: (name: string) => boolean }[];
  assistantName: string;
  description: string;
  /** Overrides the vertical pack's default menu (real client data). */
  services?: { name: string; durationMinutes: number; bufferAfterMinutes?: number; priceCents?: number; description?: string }[];
  /** Overrides the pack's default hours: [weekday, startMinute, endMinute]. */
  hours?: [number, number, number][];
  ownerName?: string;
}

const ORGS: Record<string, OrgSeed> = {
  DENTAL: {
    slug: "demo-dental",
    name: "Bright Smile Dental",
    timezone: "America/New_York",
    currency: "USD",
    address: "412 Maple Avenue, Brooklyn, NY 11215",
    phone: "+17185550142",
    assistantName: "Mia",
    description: "Bright Smile Dental is a family dental practice in Park Slope offering check-ups, hygiene, fillings and cosmetic dentistry.",
    providers: [
      { name: "Dr Aisha Patel", title: "Dentist", color: "#2563eb" },
      { name: "Dr Ben Carter", title: "Dentist", color: "#16a34a" },
      { name: "Lena Ortiz", title: "Hygienist", color: "#d97706", serviceFilter: (n) => /check-up|child/i.test(n) },
    ],
  },
  CLINIC: {
    slug: "demo-clinic",
    name: "Riverside Family Clinic",
    timezone: "Europe/London",
    currency: "GBP",
    address: "18 Riverside Road, Reading RG1 8BX",
    phone: "+441189550110",
    assistantName: "Sam",
    description: "Riverside Family Clinic is a private GP clinic offering same-week consultations, vaccinations and health checks.",
    providers: [
      { name: "Dr Emily Shaw", title: "GP", color: "#2563eb" },
      { name: "Dr Omar Haddad", title: "GP", color: "#7c3aed" },
      { name: "Nurse Priya Nair", title: "Practice nurse", color: "#0891b2", serviceFilter: (n) => /vaccination|health check/i.test(n) },
    ],
  },
  SALON: {
    slug: "demo-salon",
    name: "Studio Luxe Hair",
    timezone: "Europe/London",
    currency: "GBP",
    address: "77 Broad Street, Manchester M2 4WU",
    phone: "+441615550183",
    assistantName: "Ava",
    description: "Studio Luxe is a boutique hair salon in Manchester known for colour, balayage and precision cuts.",
    providers: [
      { name: "Chloe Bennett", title: "Senior stylist", color: "#db2777" },
      { name: "Marcus Reid", title: "Stylist", color: "#2563eb", serviceFilter: (n) => !/keratin/i.test(n) },
      { name: "Sofia Alves", title: "Colour specialist", color: "#7c3aed", serviceFilter: (n) => /colour|highlights|keratin|blow/i.test(n) },
    ],
  },
  PHYSIO: {
    slug: "demo-physio",
    name: "Motion Physiotherapy",
    timezone: "Asia/Karachi",
    currency: "PKR",
    address: "Plot 12, Block 7, Clifton, Karachi",
    phone: "+922135550190",
    assistantName: "Zara",
    description: "Motion Physiotherapy in Clifton treats sports injuries, back and neck pain and post-surgery rehab.",
    providers: [
      { name: "Dr Hira Malik", title: "Physiotherapist", color: "#16a34a" },
      { name: "Ahmed Raza", title: "Sports physiotherapist", color: "#2563eb" },
    ],
  },
  VET: {
    slug: "demo-vet",
    name: "Oak Tree Veterinary Clinic",
    timezone: "America/Chicago",
    currency: "USD",
    address: "2200 Oak Tree Lane, Austin, TX 78704",
    phone: "+15125550177",
    assistantName: "Poppy",
    description: "Oak Tree Vets is a small-animal clinic in South Austin for dogs, cats and rabbits, with a 24-hour partner hospital for emergencies.",
    providers: [
      { name: "Dr Laura Kim", title: "Veterinarian", color: "#16a34a" },
      { name: "Dr Miguel Santos", title: "Veterinarian", color: "#d97706" },
      { name: "Jess Taylor", title: "Vet nurse", color: "#0891b2", serviceFilter: (n) => /nail|vaccination/i.test(n) },
    ],
  },
  NAILSPA: {
    slug: "a1-luxury-nail-spa",
    name: "A1 Luxury Nail & Spa",
    timezone: "America/New_York",
    currency: "USD",
    address: "351B Old Country Rd, Carle Place, NY 11514",
    phone: "+15162796826",
    assistantName: "Lily",
    description: "A1 Luxury Nail & Spa is a calm, elevated nail studio in Carle Place, NY offering manicures, spa pedicures, gel, extensions and spa combo packages. Premium skin-safe products; every tool sterilised between clients.",
    providers: [
      { name: "Linh Tran", title: "Senior Nail Artist", color: "#db2777" },
      { name: "Sofia Reyes", title: "Spa Specialist", color: "#0891b2", serviceFilter: (n) => /pedicure|combo|spa/i.test(n) },
      { name: "Mai Nguyen", title: "Nail Art Master", color: "#7c3aed" },
    ],
    /** Real in-store menu from the client's website (a1-spa-suite plugin, packages poster + pedicure menu). */
    services: [
      { name: "Mani + Pedi Combo", durationMinutes: 90, bufferAfterMinutes: 10, priceCents: 6000, description: "Package P1: regular manicure + regular pedicure + 10 min back massage + 10 min foot massage." },
      { name: "Lavender Spa Combo", durationMinutes: 95, bufferAfterMinutes: 10, priceCents: 6900, description: "Package P2: lavender spa pedicure + regular manicure + 10 min back massage." },
      { name: "Powder Gel Combo", durationMinutes: 105, bufferAfterMinutes: 10, priceCents: 7800, description: "Package P3: powder gel manicure + regular pedicure + 10 min back massage." },
      { name: "Mango Spa Combo", durationMinutes: 115, bufferAfterMinutes: 10, priceCents: 9800, description: "Package P4: powder gel manicure + mango spa pedicure + 10 min back massage." },
      { name: "Green Tea Spa Combo", durationMinutes: 120, bufferAfterMinutes: 10, priceCents: 10800, description: "Package P5: powder gel manicure + hot stone green tea spa pedicure + 10 min back massage." },
      { name: "Regular Pedicure", durationMinutes: 35, bufferAfterMinutes: 5, priceCents: 2800, description: "Nail care, shaping, exfoliation, scrub, mask, and a 5 min foot massage." },
      { name: "Lavender Spa Pedicure", durationMinutes: 50, bufferAfterMinutes: 5, priceCents: 4500, description: "Lavender soak with hot stone, hot towel, and a 10 min foot massage." },
      { name: "Callus Spa Pedicure", durationMinutes: 50, bufferAfterMinutes: 5, priceCents: 4800, description: "Callus remover treatment to soften hard skin, with a 10 min massage." },
      { name: "Mango Spa Pedicure", durationMinutes: 60, bufferAfterMinutes: 10, priceCents: 5500, description: "Mango extract soak, paraffin, hot stone, hot towel, callus remover, 20 min foot massage." },
      { name: "Green Tea Spa Pedicure", durationMinutes: 60, bufferAfterMinutes: 10, priceCents: 6000, description: "Green tea soak, paraffin, hot stone, hot towel, callus remover, 20 min foot massage." },
      { name: "Honey Milk Spa Pedicure", durationMinutes: 60, bufferAfterMinutes: 10, priceCents: 6500, description: "Honey & milk proteins deeply hydrate, with paraffin, hot stone, hot towel, callus remover, 20 min foot massage." },
      { name: "Regular Manicure", durationMinutes: 30, bufferAfterMinutes: 5, priceCents: 2500, description: "Nail shaping, cuticle care, hand massage and polish." },
      { name: "Powder Gel Manicure", durationMinutes: 45, bufferAfterMinutes: 5, priceCents: 4500, description: "Dip powder gel manicure, long-lasting and strong." },
    ],
    hours: [[1, 600, 1170], [2, 600, 1170], [3, 600, 1170], [4, 600, 1170], [5, 600, 1170], [6, 600, 1170], [0, 600, 1080]],
    ownerName: "Sami",
  },
  CHIRO: {
    slug: "demo-chiro",
    name: "Align Chiropractic",
    timezone: "America/Los_Angeles",
    currency: "USD",
    address: "950 Ocean Boulevard, Santa Monica, CA 90401",
    phone: "+13105550129",
    assistantName: "Noah",
    description: "Align Chiropractic in Santa Monica offers evidence-based adjustments and posture care for desk workers and athletes.",
    providers: [
      { name: "Dr Rachel Moore", title: "Chiropractor", color: "#7c3aed" },
      { name: "Dr David Chen", title: "Chiropractor", color: "#2563eb" },
    ],
  },
};

const CUSTOMERS = [
  { name: "Sara Khan", phone: "+15550100001", language: "en", isReturning: true, preferences: ["prefers mornings"] },
  { name: "James Whitfield", phone: "+15550100002", language: "en", isReturning: true, preferences: [] },
  { name: "Maria Lopez", phone: "+15550100003", language: "es", isReturning: false, preferences: ["Saturdays only"] },
  { name: "Ahmed Siddiqui", phone: "+15550100004", language: "ur", isReturning: true, preferences: [] },
  { name: "Emily Chen", phone: "+15550100005", language: "en", isReturning: false, preferences: [] },
  { name: "Tom Becker", phone: "+15550100006", language: "en", isReturning: true, preferences: ["after 5pm"] },
];

/** Move a wanted local time onto the provider's next working day/hours so seeded bookings are realistic. */
function nextWorkingSlot(day: DateTime, hours: { weekday: number; startMinute: number; endMinute: number }[], hour: number, minute: number, durationMinutes: number): DateTime {
  for (let i = 0; i < 14; i++) {
    const d = day.plus({ days: i });
    const wd = d.weekday % 7;
    const h = hours.find((x) => x.weekday === wd);
    if (!h) continue;
    let m = Math.max(h.startMinute, hour * 60 + minute);
    if (m + durationMinutes > h.endMinute) m = h.startMinute;
    if (m + durationMinutes > h.endMinute) continue;
    return d.set({ hour: Math.floor(m / 60), minute: m % 60, second: 0, millisecond: 0 });
  }
  return day.set({ hour, minute });
}

/** Small deterministic PRNG so seeds are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function conversationScript(pack: VerticalPack, org: OrgSeed, customer: (typeof CUSTOMERS)[number], service: string, provider: string, label: string) {
  const first = customer.name.split(" ")[0];
  const v = pack.vocabulary;
  return [
    { role: "USER" as const, text: pack.sampleCustomerMessages[0] },
    { role: "ASSISTANT" as const, text: `Hi ${first}! I'm ${org.assistantName} at ${org.name}. I can help with that. Which service would you like?`, buttons: pack.defaultServices.slice(0, 3).map((s) => ({ id: `opt:${s.name}`, title: s.name.slice(0, 20) })) },
    { role: "USER" as const, text: service },
    { role: "ASSISTANT" as const, text: `${pack.qualificationQuestions[0].prompt}`, buttons: (pack.qualificationQuestions[0].options ?? []).map((o) => ({ id: `opt:${o}`, title: o })) },
    { role: "USER" as const, text: pack.qualificationQuestions[0].options?.[customer.isReturning ? 1 : 0] ?? "Yes" },
    { role: "ASSISTANT" as const, text: `When would you like to come in?`, buttons: [{ id: "opt:Tomorrow", title: "Tomorrow" }, { id: "opt:This week", title: "This week" }, { id: "opt:Next week", title: "Next week" }] },
    { role: "USER" as const, text: "This week" },
    { role: "ASSISTANT" as const, text: `I can offer one of these:\n1. ${label} with ${provider}\n2. ${label.replace(/\d{2}:\d{2}$/, "14:30")} with ${provider}\nWhich works for you?` },
    { role: "USER" as const, text: `I'll take the slot on ${label}.` },
    { role: "ASSISTANT" as const, text: `Done, ${first}! Your ${service} is booked for ${label} with ${provider}. You'll get a reminder before the ${v.appointment}. Anything else I can help with?` },
    { role: "USER" as const, text: "No that's all, thanks!" },
    { role: "ASSISTANT" as const, text: `You're welcome, ${first}. See you then!` },
  ];
}

async function seedOrg(pack: VerticalPack, seed: OrgSeed, index: number) {
  const random = rng(42 + index);
  const now = DateTime.now().setZone(seed.timezone);

  await prisma.organization.deleteMany({ where: { slug: seed.slug } });
  const email = `owner@${pack.id.toLowerCase()}.demo`;
  const staffEmail = `staff@${pack.id.toLowerCase()}.demo`;
  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const owner = await prisma.user.upsert({ where: { email }, create: { email, name: seed.ownerName ?? `${seed.name} Owner`, passwordHash }, update: { passwordHash, name: seed.ownerName ?? `${seed.name} Owner` } });
  const staff = await prisma.user.upsert({ where: { email: staffEmail }, create: { email: staffEmail, name: "Front Desk", passwordHash }, update: { passwordHash } });

  const businessHours = (seed.hours ?? pack.defaultHours).map(([weekday, startMinute, endMinute]) => ({ weekday, startMinute, endMinute }));
  const menu = seed.services ?? pack.defaultServices;
  const org = await prisma.organization.create({
    data: {
      name: seed.name,
      slug: seed.slug,
      vertical: pack.id,
      timezone: seed.timezone,
      brandVoice: { tone: pack.id === "SALON" ? "warm" : "friendly", assistantName: seed.assistantName, description: seed.description, greeting: "", signoff: "", defaultLanguage: "en", extraInstructions: "" },
      bookingRules: { ...DEFAULT_BOOKING_RULES, minLeadMinutes: pack.id === "SALON" ? 120 : 60 },
      businessHours,
      escalationContacts: [{ name: "Front desk", phone: seed.phone, notifyVia: "dashboard" }, { name: seed.ownerName ?? `${seed.name} Owner`, email, notifyVia: "email" }],
      onboardedAt: now.minus({ days: 45 }).toJSDate(),
      memberships: { create: [{ userId: owner.id, role: "OWNER" }, { userId: staff.id, role: "STAFF" }] },
      locations: { create: { name: seed.name, address: seed.address, phone: seed.phone } },
      services: {
        create: menu.map((s, i) => ({
          name: s.name,
          description: s.description,
          durationMinutes: s.durationMinutes,
          bufferAfterMinutes: s.bufferAfterMinutes ?? 0,
          priceCents: s.priceCents === undefined ? null : seed.currency === "PKR" ? s.priceCents * 3 : s.priceCents,
          currency: seed.currency,
          sortOrder: i,
        })),
      },
      faqs: { create: pack.faqSeeds.map((f, i) => ({ question: f.question, answer: f.answer, keywords: f.keywords, sortOrder: i })) },
      holidays: { create: [{ date: now.plus({ days: 20 }).toISODate()!, name: "Staff training day" }] },
    },
    include: { services: true },
  });

  const providers = [];
  for (const p of seed.providers) {
    const svc = org.services.filter((s) => (p.serviceFilter ? p.serviceFilter(s.name) : true));
    providers.push(
      await prisma.provider.create({
        data: {
          orgId: org.id,
          name: p.name,
          title: p.title,
          color: p.color,
          services: { create: svc.map((s) => ({ serviceId: s.id })) },
          workingHours: { create: businessHours.filter((h) => (p.title.match(/nurse|hygienist/i) ? h.weekday !== 6 : true)) },
        },
        include: { services: true, workingHours: true },
      }),
    );
  }
  // Lunch break for the first provider on weekdays this week (blocked time).
  for (let d = 0; d < 5; d++) {
    const day = now.startOf("week").plus({ days: d });
    await prisma.blockedTime.create({ data: { orgId: org.id, providerId: providers[0].id, startAt: day.set({ hour: 12, minute: 30 }).toJSDate(), endAt: day.set({ hour: 13, minute: 15 }).toJSDate(), reason: "Lunch" } });
  }

  // Contacts with memory.
  const contacts = [];
  for (const c of CUSTOMERS) {
    contacts.push(
      await prisma.contact.create({
        data: {
          orgId: org.id,
          phoneE164: c.phone,
          name: c.name,
          language: c.language,
          memory: { name: c.name, language: c.language, preferences: c.preferences, notes: [], qualification: { [pack.qualificationQuestions[0].id]: pack.qualificationQuestions[0].options?.[c.isReturning ? 1 : 0] ?? "yes" }, isReturning: c.isReturning },
        },
      }),
    );
  }

  const events: Prisma.AnalyticsEventCreateManyInput[] = [];
  const pastBookings: { id: string; contactId: string; startAt: Date }[] = [];

  // Past conversations + bookings over the last 30 days.
  for (let i = 0; i < 14; i++) {
    const contact = contacts[i % contacts.length];
    const customer = CUSTOMERS[i % CUSTOMERS.length];
    const daysAgo = 2 + Math.floor(random() * 27);
    const startedAt = now.minus({ days: daysAgo }).set({ hour: 9 + Math.floor(random() * 8), minute: [0, 15, 30, 45][Math.floor(random() * 4)] });
    const provider = providers[i % providers.length];
    const serviceRow = org.services.find((s) => provider.services.some((ps) => ps.serviceId === s.id))!;
    const apptAt = nextWorkingSlot(startedAt.plus({ days: 1 + Math.floor(random() * 4) }), provider.workingHours, 10 + (i % 6), i % 2 ? 30 : 0, serviceRow.durationMinutes);
    const label = formatSlotLabel(apptAt.toUTC().toISO()!, seed.timezone);
    const handoff = i % 7 === 3;

    const conv = await prisma.conversation.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        channel: i % 3 === 0 ? "SIMULATOR" : "WHATSAPP",
        status: handoff ? "HUMAN" : "CLOSED",
        handoffReason: handoff ? "Customer asked about a billing question" : null,
        handoffAt: handoff ? startedAt.plus({ minutes: 4 }).toJSDate() : null,
        createdAt: startedAt.toJSDate(),
        lastInboundAt: startedAt.plus({ minutes: 6 }).toJSDate(),
        lastMessageAt: startedAt.plus({ minutes: 6 }).toJSDate(),
        lastMessagePreview: handoff ? "Actually, I have a question about my last invoice." : "No that's all, thanks!",
        unreadCount: handoff ? 1 : 0,
      },
    });
    events.push({ orgId: org.id, type: "CONVERSATION_STARTED", conversationId: conv.id, createdAt: startedAt.toJSDate(), meta: {} });
    const script = conversationScript(pack, seed, customer, serviceRow.name, provider.name, label);
    const lines = handoff ? [...script.slice(0, 4), { role: "USER" as const, text: "Actually, I have a question about my last invoice." }, { role: "ASSISTANT" as const, text: "I can't help with billing myself, but I've let the team know and someone will reply here shortly." }] : script;
    let t = startedAt;
    for (const line of lines) {
      t = t.plus({ seconds: 20 + Math.floor(random() * 40) });
      await prisma.message.create({
        data: { conversationId: conv.id, direction: line.role === "USER" ? "INBOUND" : "OUTBOUND", role: line.role, content: [{ type: "text", text: line.text }], text: line.text, buttons: (line as { buttons?: unknown }).buttons as Prisma.InputJsonValue | undefined, createdAt: t.toJSDate() },
      });
      if (line.role === "ASSISTANT") events.push({ orgId: org.id, type: "AI_REPLIED", conversationId: conv.id, createdAt: t.toJSDate(), meta: { responseMs: 900 + Math.floor(random() * 2500) } });
    }
    if (handoff) {
      events.push({ orgId: org.id, type: "HANDOFF", conversationId: conv.id, createdAt: t.toJSDate(), meta: { reason: "billing" } });
      continue;
    }
    const range = busyRangeFor(apptAt.toUTC().toISO()!, serviceRow.durationMinutes, serviceRow.bufferBeforeMinutes, serviceRow.bufferAfterMinutes);
    const isPast = apptAt < now;
    const status = isPast ? (i % 9 === 5 ? "NO_SHOW" : "COMPLETED") : i % 11 === 6 ? "CANCELLED" : "CONFIRMED";
    try {
      const booking = await prisma.booking.create({
        data: {
          orgId: org.id,
          contactId: contact.id,
          providerId: provider.id,
          serviceId: serviceRow.id,
          conversationId: conv.id,
          status,
          source: "AI",
          startAt: new Date(range.startAt),
          endAt: new Date(range.endAt),
          busyStartAt: new Date(range.busyStartAt),
          busyEndAt: new Date(range.busyEndAt),
          notes: `${pack.qualificationQuestions[0].id}: ${customer.isReturning ? "returning" : "new"}`,
          confirmedByCustomerAt: status === "COMPLETED" && i % 2 === 0 ? apptAt.minus({ hours: 20 }).toJSDate() : null,
          cancelledAt: status === "CANCELLED" ? startedAt.plus({ hours: 5 }).toJSDate() : null,
          cancelReason: status === "CANCELLED" ? "Customer request" : null,
          createdAt: t.toJSDate(),
        },
      });
      pastBookings.push({ id: booking.id, contactId: contact.id, startAt: booking.startAt });
      events.push({ orgId: org.id, type: "BOOKING_CREATED", conversationId: conv.id, bookingId: booking.id, createdAt: t.toJSDate(), meta: { source: "AI" } });
      // Reminders and follow-ups; those in the past count as sent (subject to the same rules as the worker).
      const kinds: ScheduledKind[] = ["CONFIRMATION", "REMINDER_24H", "REMINDER_2H", "NO_SHOW_FOLLOWUP", "REBOOK_NUDGE"];
      const apptEnd = apptAt.plus({ minutes: serviceRow.durationMinutes });
      for (const kind of kinds) {
        const runAt =
          kind === "CONFIRMATION" ? t
          : kind === "REMINDER_24H" ? apptAt.minus({ hours: 24 })
          : kind === "REMINDER_2H" ? apptAt.minus({ hours: 2 })
          : kind === "NO_SHOW_FOLLOWUP" ? apptEnd.plus({ minutes: pack.followUp.noShowFollowUpMinutes })
          : apptEnd.plus({ days: pack.followUp.rebookAfterDays });
        const applicable = kind === "NO_SHOW_FOLLOWUP" ? status === "NO_SHOW" : kind === "REBOOK_NUDGE" ? pack.followUp.rebookAfterDays > 0 && status === "COMPLETED" : true;
        if (!applicable) continue;
        const sent = runAt < now && status !== "CANCELLED";
        const def = pack.reminderTemplates[kind];
        const params = { customerName: customer.name.split(" ")[0], businessName: seed.name, service: serviceRow.name, dateTime: apptAt.toFormat("cccc d LLLL 'at' HH:mm"), providerName: provider.name };
        await prisma.scheduledMessage.create({
          data: { orgId: org.id, bookingId: booking.id, contactId: contact.id, kind, templateName: def.name, templateParams: params, runAt: runAt.toJSDate(), status: sent ? "SENT" : status === "CANCELLED" ? "CANCELLED" : "SCHEDULED", jobId: `${booking.id}__${kind}`, sentAt: sent ? runAt.toJSDate() : null },
        });
        if (sent) {
          await prisma.message.create({ data: { conversationId: conv.id, direction: "OUTBOUND", role: "SYSTEM", content: [{ type: "text", text: renderTemplate(def, params) }], text: renderTemplate(def, params), templateName: def.name, buttons: def.quickReplies as unknown as Prisma.InputJsonValue, createdAt: runAt.toJSDate() } });
          if (kind !== "CONFIRMATION") events.push({ orgId: org.id, type: "REMINDER_SENT", conversationId: conv.id, bookingId: booking.id, createdAt: runAt.toJSDate(), meta: { kind } });
        }
      }
      if (booking.confirmedByCustomerAt) events.push({ orgId: org.id, type: "BOOKING_CONFIRMED_BY_CUSTOMER", conversationId: conv.id, bookingId: booking.id, createdAt: booking.confirmedByCustomerAt, meta: {} });
      if (status === "CANCELLED") events.push({ orgId: org.id, type: "BOOKING_CANCELLED", conversationId: conv.id, bookingId: booking.id, createdAt: booking.cancelledAt!, meta: {} });
    } catch (e) {
      // Overlapping seed slot for the same provider: skip it, the constraint is doing its job.
      if (!/booking_no_overlap/.test(String(e))) throw e;
    }
  }

  // A couple of manual bookings from the dashboard this week.
  for (let i = 0; i < 2; i++) {
    const day = now.plus({ days: 2 + i });
    if (day.weekday === 7) continue;
    const provider = providers[(i + 1) % providers.length];
    const serviceRow = org.services.find((s) => provider.services.some((ps) => ps.serviceId === s.id))!;
    const startAt = nextWorkingSlot(day, provider.workingHours, 15, 0, serviceRow.durationMinutes);
    const range = busyRangeFor(startAt.toUTC().toISO()!, serviceRow.durationMinutes, serviceRow.bufferBeforeMinutes, serviceRow.bufferAfterMinutes);
    try {
      const b = await prisma.booking.create({
        data: { orgId: org.id, contactId: contacts[(i + 4) % contacts.length].id, providerId: provider.id, serviceId: serviceRow.id, status: "CONFIRMED", source: "MANUAL", startAt: new Date(range.startAt), endAt: new Date(range.endAt), busyStartAt: new Date(range.busyStartAt), busyEndAt: new Date(range.busyEndAt), notes: "Booked by phone", createdAt: now.minus({ days: 1 }).toJSDate() },
      });
      events.push({ orgId: org.id, type: "BOOKING_CREATED", bookingId: b.id, createdAt: b.createdAt, meta: { source: "MANUAL" } });
    } catch (e) {
      if (!/booking_no_overlap/.test(String(e))) throw e;
    }
  }

  await prisma.analyticsEvent.createMany({ data: events });
  const counts = { bookings: await prisma.booking.count({ where: { orgId: org.id } }), conversations: await prisma.conversation.count({ where: { orgId: org.id } }) };
  console.log(`  ${pack.id.padEnd(7)} ${seed.name.padEnd(28)} ${email.padEnd(24)} providers=${providers.length} bookings=${counts.bookings} conversations=${counts.conversations}`);
}

async function main() {
  console.log("Seeding demo organizations (password for every login: demo1234)");
  let i = 0;
  for (const pack of listVerticalPacks()) {
    const seed = ORGS[pack.id];
    if (!seed) throw new Error(`No seed for vertical ${pack.id}`);
    await seedOrg(pack, seed, i++);
  }
  console.log("Done. Sign in at http://localhost:3000/login");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
