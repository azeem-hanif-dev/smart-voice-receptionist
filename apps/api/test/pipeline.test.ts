import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { createTestApp, http } from "./app.js";
import { QueueService } from "../src/queues/queue.service.js";
import { RemindersService } from "../src/queues/reminders.service.js";
import { PrismaService } from "../src/common/prisma.service.js";

let app: INestApplication;
let api: ReturnType<typeof http>;
let orgId: string;
const PHONE = "+15550001234";

beforeAll(async () => {
  app = await createTestApp();
  api = http(app);
  const reg = await api.post("/auth/register", { email: `owner-${Date.now()}@test.dev`, password: "password123", name: "Owner" });
  expect(reg.status).toBe(201);
  const org = await api.post("/orgs", { name: "Pipeline Dental", vertical: "DENTAL", timezone: "America/New_York" });
  expect(org.status).toBe(201);
  orgId = org.json.id;
  const prov = await api.post(`/orgs/${orgId}/providers`, { name: "Dr Test", title: "Dentist" });
  expect(prov.status).toBe(201);
  expect(prov.json.workingHours.length).toBeGreaterThan(0);
  expect(prov.json.serviceIds.length).toBe(5);
});

afterAll(async () => {
  await api.close();
  await app.close();
});

describe("auth and org setup", () => {
  it("me reports demo model mode without an API key", async () => {
    const me = await api.get("/auth/me");
    expect(me.status).toBe(200);
    expect(me.json.modelMode).toBe("demo");
    expect(me.json.orgs[0].id).toBe(orgId);
  });
  it("org is prefilled from the vertical pack", async () => {
    const org = await api.get(`/orgs/${orgId}`);
    expect(org.json.counts.services).toBe(5);
    expect(org.json.counts.faqs).toBeGreaterThan(3);
    expect(org.json.businessHours.length).toBeGreaterThan(4);
  });
  it("rejects access to another user's org", async () => {
    const other = http(app);
    await other.post("/auth/register", { email: `x-${Date.now()}@test.dev`, password: "password123", name: "X" });
    const res = await other.get(`/orgs/${orgId}`);
    expect(res.status).toBe(403);
  });
});

describe("simulator round trip through the real pipeline", () => {
  let conversationId: string;
  it("books an appointment end to end with the demo model", async () => {
    const send = (text: string, buttonId?: string) => api.post(`/orgs/${orgId}/simulator/messages`, { phoneE164: PHONE, text, buttonId });
    let r = await send("Hi");
    expect(r.status).toBe(201);
    expect(r.json.replies[0].text).toMatch(/Mia/);
    conversationId = r.json.conversationId;
    r = await send("I'd like to book a check-up and clean");
    r = await send("New patient", "opt:New patient");
    r = await send("No");
    r = await send("Sara Khan");
    // "Next week" keeps the appointment more than 24h away whatever time of day the tests run.
    r = await send("Next week", "opt:Next week");
    expect(r.json.replies[0].quickReplies?.[0].id).toMatch(/^slot:/);
    const btn = r.json.replies[0].quickReplies[0];
    r = await send(btn.title, btn.id);
    expect(r.json.replies[0].text).toMatch(/Done, Sara/);
    const bookings = await api.get(`/orgs/${orgId}/bookings`);
    expect(bookings.json).toHaveLength(1);
    expect(bookings.json[0].source).toBe("AI");
    expect(bookings.json[0].contact.name).toBe("Sara Khan");
    const contact = await api.get(`/orgs/${orgId}/contacts`);
    expect(contact.json[0].memory.qualification.returning).toBe("New patient");
  });

  it("schedules confirmation + reminders + follow-ups for the booking", async () => {
    const bookings = await api.get(`/orgs/${orgId}/bookings`);
    const sched = await api.get(`/orgs/${orgId}/scheduled-messages?bookingId=${bookings.json[0].id}`);
    const kinds = sched.json.map((s: { kind: string }) => s.kind).sort();
    expect(kinds).toEqual(["CONFIRMATION", "NO_SHOW_FOLLOWUP", "REBOOK_NUDGE", "REMINDER_24H", "REMINDER_2H"].sort());
    const queues = app.get(QueueService);
    const job = await queues.scheduled.getJob(`${bookings.json[0].id}__REMINDER_24H`);
    expect(job).toBeTruthy();
    const startAt = Date.parse(bookings.json[0].startAt);
    const r24 = sched.json.find((s: { kind: string }) => s.kind === "REMINDER_24H");
    expect(Date.parse(r24.runAt)).toBe(startAt - 24 * 3600_000);
  });

  it("the demo 'send reminder now' delivers into the conversation and counts as a reminder", async () => {
    const bookings = await api.get(`/orgs/${orgId}/bookings`);
    const r = await api.post(`/orgs/${orgId}/simulator/send-reminder`, { bookingId: bookings.json[0].id, kind: "REMINDER_24H" });
    expect(r.json.ok).toBe(true);
    const conv = await api.get(`/orgs/${orgId}/conversations/${conversationId}`);
    const last = conv.json.messages[conv.json.messages.length - 1];
    expect(last.role).toBe("SYSTEM");
    expect(last.text).toMatch(/reminder/i);
    expect(last.buttons?.[0].id).toBe("reminder:confirm");
    const analytics = await api.get(`/orgs/${orgId}/analytics?days=7`);
    expect(analytics.json.remindersSent).toBe(1);
    expect(analytics.json.bookingsByAi).toBe(1);
    expect(analytics.json.conversations).toBe(1);
    expect(analytics.json.medianFirstResponseMs).toBeGreaterThan(0);
  });

  it("customer confirms via the reminder button", async () => {
    const r = await api.post(`/orgs/${orgId}/simulator/messages`, { phoneE164: PHONE, text: "Yes, I'll be there", buttonId: "reminder:confirm" });
    expect(r.json.replies[0].text).toMatch(/thanks for confirming/i);
    const bookings = await api.get(`/orgs/${orgId}/bookings`);
    expect(bookings.json[0].confirmedByCustomerAt).toBeTruthy();
  });

  it("reschedule from the dashboard re-queues reminders; cancel removes them", async () => {
    const bookings = await api.get(`/orgs/${orgId}/bookings`);
    const b = bookings.json[0];
    const newStart = new Date(Date.parse(b.startAt) + 7 * 86400_000).toISOString();
    const up = await api.patch(`/orgs/${orgId}/bookings/${b.id}`, { startAt: newStart });
    expect(up.status).toBe(200);
    expect(up.json.startAt).toBe(newStart);
    const sched = await api.get(`/orgs/${orgId}/scheduled-messages?bookingId=${b.id}`);
    const r24 = sched.json.find((s: { kind: string; status: string }) => s.kind === "REMINDER_24H" && s.status === "SCHEDULED");
    expect(Date.parse(r24.runAt)).toBe(Date.parse(newStart) - 24 * 3600_000);
    const cancel = await api.post(`/orgs/${orgId}/bookings/${b.id}/cancel`, { reason: "test" });
    expect(cancel.json.status).toBe("CANCELLED");
    const after = await api.get(`/orgs/${orgId}/scheduled-messages?bookingId=${b.id}`);
    expect(after.json.every((s: { status: string }) => s.status !== "SCHEDULED")).toBe(true);
    const queues = app.get(QueueService);
    expect(await queues.scheduled.getJob(`${b.id}__REMINDER_2H`)).toBeFalsy();
  });

  it("manual double booking is refused with 409 and alternatives", async () => {
    const services = await api.get(`/orgs/${orgId}/services`);
    const providers = await api.get(`/orgs/${orgId}/providers`);
    const start = "2030-01-08T15:00:00.000Z";
    const first = await api.post(`/orgs/${orgId}/bookings`, { serviceId: services.json[0].id, providerId: providers.json[0].id, startAt: start, contact: { phoneE164: "+15550009999", name: "Manual" } });
    expect(first.status).toBe(201);
    const second = await api.post(`/orgs/${orgId}/bookings`, { serviceId: services.json[0].id, providerId: providers.json[0].id, startAt: start, contact: { phoneE164: "+15550008888" } });
    expect(second.status).toBe(409);
    expect(second.json.reason).toBe("SLOT_TAKEN");
    expect(Array.isArray(second.json.alternatives)).toBe(true);
  });

  it("handoff pauses the AI; staff reply and hand back from the inbox", async () => {
    const r = await api.post(`/orgs/${orgId}/simulator/messages`, { phoneE164: PHONE, text: "Can I speak to a real person?" });
    expect(r.json.status).toBe("HUMAN");
    const list = await api.get(`/orgs/${orgId}/conversations?status=HUMAN`);
    expect(list.json.some((c: { id: string }) => c.id === conversationId)).toBe(true);
    const silent = await api.post(`/orgs/${orgId}/simulator/messages`, { phoneE164: PHONE, text: "hello?" });
    expect(silent.json.replies).toHaveLength(0);
    const staff = await api.post(`/orgs/${orgId}/conversations/${conversationId}/messages`, { text: "Hi Sara, this is Jo from the front desk." });
    expect(staff.json.role).toBe("STAFF");
    const back = await api.post(`/orgs/${orgId}/conversations/${conversationId}/handback`);
    expect(back.json.status).toBe("AI");
    const again = await api.post(`/orgs/${orgId}/simulator/messages`, { phoneE164: PHONE, text: "thanks!" });
    expect(again.json.replies.length).toBe(1);
  });
});

describe("webhook idempotency and signature", () => {
  const secret = "test-app-secret";
  const payload = (msgId: string) =>
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { metadata: { phone_number_id: "PNID1" }, contacts: [{ wa_id: "15550007777", profile: { name: "Wa User" } }], messages: [{ id: msgId, from: "15550007777", timestamp: "1700000000", type: "text", text: { body: "hello" } }] } }] }],
    });
  const sign = (body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  beforeAll(async () => {
    process.env.WHATSAPP_APP_SECRET = secret;
    (await import("../src/config.js")).resetEnvCache();
    await api.patch(`/orgs/${orgId}`, { whatsappConfig: { phoneNumberId: "PNID1", accessToken: "tok" } });
  });

  it("verifies the subscription challenge", async () => {
    const r = await api.get(`/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${process.env.WHATSAPP_VERIFY_TOKEN}&hub.challenge=12345`);
    expect(r.status).toBe(200);
    expect(r.text).toBe("12345");
    const bad = await api.get(`/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`);
    expect(bad.status).toBe(403);
  });

  it("rejects a bad signature and accepts a good one exactly once", async () => {
    // Env is read lazily and cached; the adapter reads the secret through env(). Reset the cache by re-importing.
    const wamid = `wamid.TEST-${Date.now()}`;
    const body = payload(wamid);
    const bad = await api.post("/webhooks/whatsapp", undefined, { "x-hub-signature-256": "sha256=deadbeef" }, body);
    expect(bad.status).toBe(403);
    const ok1 = await api.post("/webhooks/whatsapp", undefined, { "x-hub-signature-256": sign(body) }, body);
    expect(ok1.status).toBe(200);
    expect(ok1.json.enqueued).toBe(1);
    const ok2 = await api.post("/webhooks/whatsapp", undefined, { "x-hub-signature-256": sign(body) }, body);
    expect(ok2.status).toBe(200);
    expect(ok2.json.enqueued).toBe(0);
    const prisma = app.get(PrismaService).client;
    expect(await prisma.webhookEvent.count({ where: { provider: "WHATSAPP", eventId: wamid } })).toBe(1);
    const queues = app.get(QueueService);
    const job = await queues.inbound.getJob(wamid);
    expect(job?.data.orgId).toBe(orgId);
  });

  it("the worker processes the stored webhook event through the pipeline exactly once", async () => {
    const { WorkersService } = await import("../src/queues/workers.service.js");
    const workers = app.get(WorkersService);
    const wamid = `wamid.WORKER-${Date.now()}`;
    const body = payload(wamid);
    const ok = await api.post("/webhooks/whatsapp", undefined, { "x-hub-signature-256": sign(body) }, body);
    expect(ok.json.enqueued).toBe(1);
    const first = await workers.processInboundEvent(wamid);
    expect(first?.duplicate).toBe(false);
    expect(first?.replies.length).toBeGreaterThan(0); // the engine replied (delivery to WhatsApp fails without a token and is recorded on the message)
    const prisma = app.get(PrismaService).client;
    const conv = await prisma.conversation.findFirst({ where: { orgId, channel: "WHATSAPP", contact: { phoneE164: "+15550007777" } }, include: { messages: true } });
    expect(conv).toBeTruthy();
    expect(conv!.messages.some((m) => m.role === "USER" && m.text === "hello")).toBe(true);
    const ev = await prisma.webhookEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: "WHATSAPP", eventId: wamid } } });
    expect(ev.processedAt).toBeTruthy();
    const again = await workers.processInboundEvent(wamid);
    expect(again).toBeNull();
  });

  it("the inbound pipeline itself dedupes on provider message id", async () => {
    const inbound = app.get((await import("../src/inbound/inbound.service.js")).InboundService);
    const msg = { channel: "SIMULATOR" as const, orgId, providerMessageId: "dup-1", from: { phoneE164: "+15550006666" }, kind: "text" as const, text: "hi", receivedAt: new Date().toISOString() };
    const first = await inbound.handle(msg);
    const second = await inbound.handle(msg);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.replies).toHaveLength(0);
  });
});

describe("authorization and validation", () => {
  it("staff members cannot change settings, owners can", async () => {
    const owners = await api.get(`/orgs/${orgId}/members`);
    const staff = http(app);
    const email = `staff-${Date.now()}@test.dev`;
    const add = await api.post(`/orgs/${orgId}/members`, { email, name: "Staff", password: "password123", role: "STAFF" });
    expect(add.status).toBe(201);
    await staff.post("/auth/login", { email, password: "password123" });
    expect((await staff.get(`/orgs/${orgId}/services`)).status).toBe(200);
    expect((await staff.patch(`/orgs/${orgId}`, { name: "Hacked" })).status).toBe(403);
    expect((await staff.post(`/orgs/${orgId}/members`, { email: "x@y.dev", name: "X", password: "password123", role: "OWNER" })).status).toBe(403);
    expect((await staff.post(`/orgs/${orgId}/faqs`, { question: "q", answer: "a" })).status).toBe(403);
    expect((await staff.get(`/orgs/${orgId}/conversations`)).status).toBe(200);
    expect(owners.json.length).toBeGreaterThan(0);
  });

  it("rejects malformed query parameters with 400 instead of 500", async () => {
    expect((await api.get(`/orgs/${orgId}/bookings?from=notadate`)).status).toBe(400);
    expect((await api.get(`/orgs/${orgId}/bookings?status=BOGUS`)).status).toBe(400);
    expect((await api.get(`/orgs/${orgId}/conversations?status=BOGUS`)).status).toBe(400);
    expect((await api.get(`/orgs/${orgId}/availability?serviceId=x&fromDate=garbage`)).status).toBe(400);
    expect((await api.get(`/orgs/${orgId}/blocked-times?from=x&to=y`)).status).toBe(400);
    // an unencoded "+" in an offset arrives as a space and is tolerated
    expect((await api.get(`/orgs/${orgId}/bookings?from=2026-09-07T12:00:00 00:00`)).status).toBe(200);
  });

  it("cross-tenant ids in settings writes are rejected", async () => {
    const res = await api.post(`/orgs/${orgId}/services`, { name: "X", durationMinutes: 30, providerIds: ["not-mine"] });
    expect(res.status).toBe(400);
  });

  it("duplicate registration is a 409", async () => {
    const email = `dup-${Date.now()}@test.dev`;
    const other = http(app);
    expect((await other.post("/auth/register", { email, password: "password123", name: "A" })).status).toBe(201);
    expect((await other.post("/auth/register", { email, password: "password123", name: "A" })).status).toBe(409);
  });
});

describe("reminder plan", () => {
  it("uses the org's offsets and the pack's follow-up cadence", async () => {
    const reminders = app.get(RemindersService);
    const prisma = app.get(PrismaService).client;
    const b = await prisma.booking.findFirstOrThrow({ where: { orgId, status: "CONFIRMED" }, include: { service: true, provider: true, contact: true, org: true } });
    const now = new Date(b.startAt.getTime() - 3 * 86400_000);
    const plan = reminders.plan(b, now);
    const byKind = Object.fromEntries(plan.map((p) => [p.kind, p.runAt.getTime()]));
    expect(byKind.CONFIRMATION).toBe(now.getTime());
    expect(byKind.REMINDER_24H).toBe(b.startAt.getTime() - 24 * 3600_000);
    expect(byKind.REMINDER_2H).toBe(b.startAt.getTime() - 2 * 3600_000);
    expect(byKind.NO_SHOW_FOLLOWUP).toBe(b.endAt.getTime() + 60 * 60_000);
    expect(byKind.REBOOK_NUDGE).toBe(b.endAt.getTime() + 180 * 86400_000);
    // A reminder whose time has already passed is not scheduled.
    const late = reminders.plan(b, new Date(b.startAt.getTime() - 60 * 60_000));
    expect(late.map((p) => p.kind)).not.toContain("REMINDER_24H");
    expect(late.map((p) => p.kind)).not.toContain("REMINDER_2H");
  });
});
