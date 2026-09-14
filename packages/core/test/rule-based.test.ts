import { describe, expect, it } from "vitest";
import { RuleBasedModelClient } from "../src/index.js";
import { harness } from "./fixtures.js";

/** These flows double as the credential-free demo: the same model drives `pnpm demo` and the dashboard chat. */
describe("rule-based demo model", () => {
  it("dental: greets, qualifies, collects a name, offers slots, books only via the tools", async () => {
    const h = harness("DENTAL", new RuleBasedModelClient());
    let out = await h.send("Hi");
    expect(out.replies[0].text).toMatch(/Mia/);
    expect(out.replies[0].quickReplies?.length).toBe(3);

    out = await h.send("I'd like to book a check-up and clean");
    expect(out.replies[0].text).toMatch(/visited us before/);
    out = await h.send("New patient", "opt:New patient");
    expect(h.tools.memory.qualification.returning).toBe("New patient");
    expect(out.replies[0].text).toMatch(/insurance/);
    out = await h.send("No");
    expect(out.replies[0].text).toMatch(/name/);
    out = await h.send("Sara Khan");
    expect(h.tools.memory.name).toBe("Sara Khan");
    expect(out.replies[0].text).toMatch(/When would you like/);
    out = await h.send("Tomorrow", "opt:Tomorrow");
    expect(out.replies[0].text).toMatch(/1\. Wed 9 Sep/);
    expect(out.replies[0].quickReplies?.[0].id).toMatch(/^slot:/);
    expect(h.tools.bookings).toHaveLength(0);
    // Nothing above claimed a confirmation.
    for (const o of h.outputs) expect(o.events.every((e) => e.type !== "GUARDRAIL_BLOCKED")).toBe(true);

    const btn = out.replies[0].quickReplies![1];
    out = await h.send(btn.title, btn.id);
    expect(out.replies[0].text).toMatch(/Done, Sara! Your Check-up & clean is booked for Wed 9 Sep/);
    expect(h.tools.bookings).toHaveLength(1);
    expect(h.tools.bookings[0].startAt).toBe(btn.id.split(":").slice(2).join(":"));
    expect(h.tools.bookings[0].notes).toMatch(/returning: New patient/);
    expect(out.events.map((e) => e.type)).toContain("BOOKING_CREATED");
  });

  it("dental: picks a slot by saying 'the second one'", async () => {
    const h = harness("DENTAL", new RuleBasedModelClient(), { name: "Ali", memory: { isReturning: true, qualification: { returning: "Returning patient" } } });
    await h.send("Can I get a filling on Thursday morning?");
    let out = h.outputs[0];
    expect(out.replies[0].text).toMatch(/1\. Thu 10 Sep/);
    out = await h.send("the second one");
    expect(out.replies[0].text).toMatch(/Done, Ali!/);
    expect(h.tools.bookings[0].serviceName).toBe("Filling");
  });

  it("salon: reschedules an existing appointment to next week", async () => {
    const h = harness("SALON", new RuleBasedModelClient(), { name: "Sara", memory: { isReturning: true } });
    const created = await h.tools.createBooking({ serviceId: "svc_1", providerId: "prov_1", startAt: "2026-09-11T14:00:00.000Z", customerName: "Sara" });
    expect(created.ok).toBe(true);
    let out = await h.send("I need to move my appointment to next week");
    expect(out.replies[0].text).toMatch(/1\. (Tue|Wed|Thu|Fri|Sat) 1[5-9] Sep/);
    out = await h.send("the first one");
    expect(out.replies[0].text).toMatch(/All changed/);
    expect(h.tools.bookings[0].startAt.slice(0, 10)).toMatch(/2026-09-1[5-9]/);
    expect(out.events.map((e) => e.type)).toContain("BOOKING_RESCHEDULED");
  });

  it("salon: cancels and offers to rebook", async () => {
    const h = harness("SALON", new RuleBasedModelClient(), { name: "Sara" });
    await h.tools.createBooking({ serviceId: "svc_2", providerId: "prov_1", startAt: "2026-09-11T14:00:00.000Z", customerName: "Sara" });
    let out = await h.send("Please cancel my appointment");
    expect(out.replies[0].text).toMatch(/has been cancelled/);
    expect(h.tools.bookings[0].status).toBe("CANCELLED");
    out = await h.send("No thanks");
    expect(out.replies[0].text).toMatch(/No problem/);
  });

  it("vet: emergency goes straight to the emergency message and a high-urgency handoff", async () => {
    const h = harness("VET", new RuleBasedModelClient());
    const out = await h.send("My dog ate chocolate, what do I do?");
    expect(out.replies[0].text).toMatch(/urgent/i);
    expect(out.handoff?.urgency).toBe("high");
    expect(h.tools.handoffs).toHaveLength(1);
  });

  it("vet: asking for a human hands off; asking for advice declines and offers a booking", async () => {
    const h = harness("VET", new RuleBasedModelClient());
    let out = await h.send("Is it normal for my cat to sneeze a lot?");
    expect(out.replies[0].text).toMatch(/not able to give medical advice/);
    out = await h.send("Talk to a person", "opt:Talk to a person");
    expect(out.handoff).toBeDefined();
    expect(out.replies[0].text).toMatch(/team member will reply/);
  });

  it("answers from the FAQ and admits when it does not know", async () => {
    const h = harness("DENTAL", new RuleBasedModelClient());
    let out = await h.send("Do you take insurance?");
    expect(out.replies[0].text).toMatch(/accept most major dental insurance/);
    out = await h.send("Do you offer gold tooth engraving?");
    expect(out.replies[0].text).toMatch(/not sure/);
    expect(out.replies[0].quickReplies?.[0].title).toBe("Yes, please");
    out = await h.send("Yes, please", "opt:Yes, please");
    expect(out.handoff).toBeDefined();
  });

  it("parses 'next Friday' as the Friday of next week and rejects non-names", async () => {
    const h = harness("DENTAL", new RuleBasedModelClient(), { memory: { isReturning: true, qualification: { returning: "Returning patient", reason: "check" } } });
    let out = await h.send("book a check-up next friday");
    expect(out.replies[0].text).toMatch(/name/);
    out = await h.send("yes");
    expect(out.replies[0].text).toMatch(/what name/);
    out = await h.send("Nadia");
    expect(out.replies[0].text).toMatch(/1\. Fri 18 Sep/);
  });

  it("answers opening-hours questions from the profile instead of refusing them as medical advice", async () => {
    const h = harness("DENTAL", new RuleBasedModelClient());
    let out = await h.send("Can you tell me what is her timing throughout the day?");
    expect(out.replies[0].text).toMatch(/Mon 09:00–17:00/);
    expect(out.replies[0].text).not.toMatch(/medical advice/);
    out = await h.send("When is Dr Patel available?");
    expect(out.replies[0].text).toMatch(/Dr Aisha Patel: Mon/);
    expect(out.replies[0].text).not.toMatch(/Dr Ben Carter/);
    out = await h.send("Is it normal for my tooth to hurt after a filling?");
    expect(out.replies[0].text).toMatch(/not able to give medical advice/);
  });

  it("matches services by whole words, so 'gel manicure' is not a 'Mani + Pedi Combo'", async () => {
    const h = harness("NAILSPA", new RuleBasedModelClient(), { name: "Ayesha", memory: { isReturning: true, qualification: { removal: "No", technician: "anyone" } } });
    const out = await h.send("Hi, I'd like to book a gel manicure please");
    expect(out.replies[0].text).toMatch(/When would you like/);
    await h.send("Next week", "opt:Next week");
    const state = h.state;
    const svc = h.profile.services.find((s) => s.id === state.lastServiceId);
    expect(svc?.name).toBe("Gel Manicure");
    const advice = await h.send("My nail looks infected, what should I put on it?");
    expect(advice.replies[0].text).toMatch(/not able to give medical advice/);
    expect(advice.handoff).toBeUndefined();
  });

  it("handles small talk and 'are you a bot' honestly", async () => {
    const h = harness("DENTAL", new RuleBasedModelClient());
    let out = await h.send("How are you?");
    expect(out.replies[0].text).toMatch(/doing well/);
    expect(out.replies[0].quickReplies?.length).toBe(3);
    out = await h.send("Are you a bot?");
    expect(out.replies[0].text).toMatch(/automated receptionist/);
  });

  it("reminder replies confirm the upcoming booking", async () => {
    const h = harness("CLINIC", new RuleBasedModelClient(), { name: "Omar" });
    await h.tools.createBooking({ serviceId: "svc_1", providerId: "prov_1", startAt: "2026-09-10T14:00:00.000Z", customerName: "Omar" });
    const out = await h.send("Yes, I'll be there", "reminder:confirm");
    expect(out.replies[0].text).toMatch(/thanks for confirming/);
    expect(out.events.map((e) => e.type)).toContain("BOOKING_CONFIRMED_BY_CUSTOMER");
  });

  it("handles a slot that is taken between offer and booking by re-checking availability", async () => {
    const h = harness("CHIRO", new RuleBasedModelClient(), { name: "Lee", memory: { isReturning: true, qualification: { returning: "Existing patient", concern: "back" } } });
    let out = await h.send("book an adjustment tomorrow afternoon");
    const first = out.replies[0].quickReplies![0];
    const start = first.id.split(":").slice(2).join(":");
    // Someone else grabs the slot with the same provider.
    h.tools.bookings.push({ id: "bk_other", contactId: "contact_2", serviceId: "svc_2", serviceName: "Adjustment", providerId: first.id.split(":")[1], providerName: "x", startAt: start, endAt: start, busyStart: start, busyEnd: new Date(Date.parse(start) + 20 * 60000).toISOString(), status: "CONFIRMED", label: "" });
    out = await h.send(first.title, first.id);
    // The demo model re-ran check_availability and offered new slots rather than claiming success.
    expect(out.replies[0].text).toMatch(/I can offer one of these/);
    expect(h.tools.bookings.filter((b) => b.contactId === "contact_1")).toHaveLength(0);
    expect(out.events.every((e) => e.type !== "BOOKING_CREATED")).toBe(true);
  });
});
