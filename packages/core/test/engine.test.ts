import { describe, expect, it } from "vitest";
import {
  ModelError,
  SAFE_UNCONFIRMED_TEXT,
  ScriptedModelClient,
  buildHistory,
  callTools,
  claimsConfirmation,
  expandButton,
  extractButtons,
  getVerticalPack,
  isRetryable,
  lastToolResults,
  preCheck,
  reply,
  textBlock,
  toolUse,
  type StoredMessage,
} from "../src/index.js";
import { harness, NOW, TZ } from "./fixtures.js";

const FAKE_SLOT = "2026-09-09T14:00:00.000Z";

describe("engine tool-calling contract", () => {
  it("books only after check_availability and confirms only after create_booking succeeds", async () => {
    const model = new ScriptedModelClient([
      callTools(toolUse("check_availability", { serviceId: "svc_1", fromDate: "2026-09-09" })),
      (req) => {
        const [res] = lastToolResults(req);
        expect(res.name).toBe("check_availability");
        const slots = (res.value as { slots: { start: string; providerId: string }[] }).slots;
        expect(slots.length).toBeGreaterThanOrEqual(2);
        expect(slots.length).toBeLessThanOrEqual(4);
        return callTools(toolUse("create_booking", { serviceId: "svc_1", providerId: slots[0].providerId, startAt: slots[0].start, customerName: "Sara" }));
      },
      (req) => {
        const [res] = lastToolResults(req);
        expect(res.name).toBe("create_booking");
        expect((res.value as { ok: boolean }).ok).toBe(true);
        return reply("You're booked for Wednesday at 9:00 with Dr Patel. See you then!");
      },
    ]);
    const h = harness("DENTAL", model);
    const out = await h.send("I'd like to book a check-up tomorrow");
    expect(out.replies[0].text).toMatch(/booked/);
    expect(h.tools.bookings).toHaveLength(1);
    expect(out.events.map((e) => e.type)).toContain("BOOKING_CREATED");
    expect(out.newMessages.map((m) => m.role)).toEqual(["USER", "ASSISTANT", "TOOL", "ASSISTANT", "TOOL", "ASSISTANT"]);
    expect(out.state.confirmedBookingIds).toEqual([h.tools.bookings[0].id]);
    expect(model.remaining).toBe(0);
  });

  it("rejects create_booking for a slot that was never offered, then accepts an offered one", async () => {
    const model = new ScriptedModelClient([
      callTools(toolUse("create_booking", { serviceId: "svc_1", providerId: "prov_1", startAt: FAKE_SLOT, customerName: "Sara" })),
      (req) => {
        const [res] = lastToolResults(req);
        expect(res.isError).toBe(true);
        expect(JSON.stringify(res.value)).toMatch(/not returned by check_availability/);
        return callTools(toolUse("check_availability", { serviceId: "svc_1", fromDate: "2026-09-09" }));
      },
      (req) => {
        const slots = (lastToolResults(req)[0].value as { slots: { start: string; providerId: string }[] }).slots;
        return callTools(toolUse("create_booking", { serviceId: "svc_1", providerId: slots[1].providerId, startAt: slots[1].start, customerName: "Sara" }));
      },
      reply("Booked! You're all set."),
    ]);
    const h = harness("DENTAL", model);
    const out = await h.send("Book me in");
    expect(out.events.filter((e) => e.type === "GUARDRAIL_BLOCKED")).toHaveLength(1);
    expect(h.tools.bookings).toHaveLength(1);
    expect(h.tools.bookings[0].startAt).not.toBe(FAKE_SLOT);
  });

  it("rejects reschedule_booking to a slot that was never offered", async () => {
    const model = new ScriptedModelClient([
      callTools(toolUse("find_bookings", {})),
      (req) => {
        const bookings = (lastToolResults(req)[0].value as { bookings: { id: string }[] }).bookings;
        return callTools(toolUse("reschedule_booking", { bookingId: bookings[0].id, newStartAt: FAKE_SLOT, providerId: "prov_1" }));
      },
      (req) => {
        expect(lastToolResults(req)[0].isError).toBe(true);
        return reply("Let me check the calendar first.");
      },
    ]);
    const h = harness("SALON", model);
    await h.tools.createBooking({ serviceId: "svc_1", providerId: "prov_1", startAt: "2026-09-16T14:00:00.000Z", customerName: "Sara" });
    await h.send("move my appointment");
    expect(h.tools.bookings[0].startAt).toBe("2026-09-16T14:00:00.000Z");
  });

  it("blocks an unearned confirmation, gives the model one chance to correct itself", async () => {
    const model = new ScriptedModelClient([
      reply("Great, you're all set for Tuesday at 10am. See you then!"),
      (req) => {
        const last = req.messages[req.messages.length - 1];
        expect(JSON.stringify(last.content)).toMatch(/create_booking was not called/);
        return reply("Sorry, nothing is booked yet. Which day would you like?");
      },
    ]);
    const h = harness("DENTAL", model);
    const out = await h.send("Tuesday at 10 please");
    expect(out.replies[0].text).toMatch(/nothing is booked yet/i);
    expect(out.events.some((e) => e.type === "GUARDRAIL_BLOCKED" && e.meta?.kind === "unearned_confirmation")).toBe(true);
    expect(out.newMessages.some((m) => m.role === "SYSTEM")).toBe(true);
    expect(h.tools.bookings).toHaveLength(0);
  });

  it("replaces a repeated unearned confirmation with safe text", async () => {
    const model = new ScriptedModelClient([reply("You're booked for Tuesday at 10!"), reply("Confirmed, see you Tuesday at 10!")]);
    const h = harness("DENTAL", model);
    const out = await h.send("Tuesday at 10 please");
    expect(out.replies[0].text).toBe(SAFE_UNCONFIRMED_TEXT);
  });

  it("allows confirmation language once a booking succeeded earlier in the conversation", async () => {
    const model = new ScriptedModelClient([
      callTools(toolUse("check_availability", { serviceId: "svc_1", fromDate: "2026-09-09" })),
      (req) => {
        const slots = (lastToolResults(req)[0].value as { slots: { start: string; providerId: string }[] }).slots;
        return callTools(toolUse("create_booking", { serviceId: "svc_1", providerId: slots[0].providerId, startAt: slots[0].start, customerName: "Sara" }));
      },
      reply("Booked for Wednesday 9:00."),
      reply("You're all set, see you on Wednesday!"),
    ]);
    const h = harness("DENTAL", model);
    await h.send("book a check-up tomorrow");
    const out = await h.send("thanks!");
    expect(out.replies[0].text).toMatch(/all set/);
    expect(out.events.every((e) => e.type !== "GUARDRAIL_BLOCKED")).toBe(true);
  });

  it("hands off when the model calls handoff_to_human and pauses after", async () => {
    const model = new ScriptedModelClient([
      callTools(toolUse("handoff_to_human", { reason: "Billing dispute", urgency: "high", summary: "Customer disputes an invoice" })),
      reply("I've passed this to the team; someone will reply here shortly."),
    ]);
    const h = harness("CLINIC", model);
    const out = await h.send("I was charged twice last month and I want it sorted");
    expect(out.handoff?.reason).toBe("Billing dispute");
    expect(h.tools.handoffs).toHaveLength(1);
    expect(out.events.map((e) => e.type)).toContain("HANDOFF");
  });

  it("emergencies are handled before the model is called", async () => {
    const model = new ScriptedModelClient([]);
    const h = harness("VET", model);
    const out = await h.send("My dog ate chocolate and is now collapsed");
    expect(out.replies[0].text).toBe(getVerticalPack("VET").emergencyMessage);
    expect(out.handoff?.urgency).toBe("high");
    expect(h.tools.handoffs[0].reason).toMatch(/emergency/i);
    expect(model.requests).toHaveLength(0);
  });

  it("explicit requests for a human are handled deterministically", async () => {
    const model = new ScriptedModelClient([]);
    const h = harness("DENTAL", model);
    const out = await h.send("Can I speak to a real person please?");
    expect(out.handoff).toBeDefined();
    expect(out.replies[0].text).toMatch(/team member will reply/);
    expect(model.requests).toHaveLength(0);
  });

  it("retries once on a retryable model error, then succeeds", async () => {
    const model = new ScriptedModelClient([new ModelError("overloaded", true, "529"), reply("Hello! How can I help?")]);
    const h = harness("DENTAL", model);
    const out = await h.send("hello");
    expect(out.replies[0].text).toBe("Hello! How can I help?");
    expect(out.usage.modelCalls).toBe(2);
    expect(out.handoff).toBeUndefined();
  });

  it("apologises and hands off after a second failure", async () => {
    const model = new ScriptedModelClient([new ModelError("overloaded", true), new ModelError("overloaded", true)]);
    const h = harness("DENTAL", model);
    const out = await h.send("hello");
    expect(out.replies[0].text).toMatch(/trouble right now/);
    expect(out.handoff).toBeDefined();
    expect(h.tools.handoffs[0].reason).toMatch(/AI error/);
    expect(out.events.map((e) => e.type)).toEqual(expect.arrayContaining(["MODEL_ERROR", "HANDOFF"]));
  });

  it("does not retry non-retryable errors", async () => {
    const model = new ScriptedModelClient([new ModelError("bad request", false), reply("should not be reached")]);
    const h = harness("DENTAL", model);
    const out = await h.send("hello");
    expect(out.usage.modelCalls).toBe(1);
    expect(out.handoff).toBeDefined();
  });

  it("returns is_error for invalid tool input instead of crashing", async () => {
    const model = new ScriptedModelClient([
      callTools(toolUse("check_availability", { serviceId: "svc_1", fromDate: "next tuesday" })),
      (req) => {
        const [res] = lastToolResults(req);
        expect(res.isError).toBe(true);
        expect(JSON.stringify(res.value)).toMatch(/fromDate/);
        return reply("Which date did you mean?");
      },
    ]);
    const h = harness("DENTAL", model);
    const out = await h.send("book something");
    expect(out.replies[0].text).toMatch(/Which date/);
  });

  it("hands off when the tool-call iteration cap is exceeded", async () => {
    const model = new ScriptedModelClient(Array.from({ length: 10 }, () => callTools(toolUse("get_business_info", {}))));
    const h = harness("DENTAL", model);
    const out = await h.send("hi");
    expect(out.handoff?.reason).toMatch(/limit/);
    expect(out.usage.modelCalls).toBe(8);
  });

  it("parses <<buttons>> and auto-attaches slot buttons after check_availability", async () => {
    const model = new ScriptedModelClient([
      reply("Are you a new or returning patient? <<buttons: New patient|Returning patient>>"),
      callTools(toolUse("check_availability", { serviceId: "svc_1", fromDate: "2026-09-09" })),
      reply("I can offer Wednesday 9:00, 9:30 or 10:00. Which suits?"),
    ]);
    const h = harness("DENTAL", model);
    const first = await h.send("book a check-up");
    expect(first.replies[0].text).toBe("Are you a new or returning patient?");
    expect(first.replies[0].quickReplies?.map((b) => b.title)).toEqual(["New patient", "Returning patient"]);
    const second = await h.send("New");
    expect(second.replies[0].quickReplies).toHaveLength(3);
    expect(second.replies[0].quickReplies![0].id).toMatch(/^slot:prov_\d:2026-09-09T/);
  });

  it("expands tapped buttons into text the model can act on", () => {
    expect(expandButton("slot:prov_1:2026-09-09T14:00:00.000Z", undefined, TZ)).toMatch(/start=2026-09-09T14:00:00.000Z, providerId=prov_1/);
    expect(expandButton("reminder:confirm", undefined, TZ)).toMatch(/confirm/);
    expect(expandButton("opt:Returning patient", "Returning patient", TZ)).toBe("Returning patient");
    expect(extractButtons("Hello <<buttons: A|B|C|D>>").buttons).toHaveLength(3);
  });

  it("caps history and never splits a tool_use from its tool_result", () => {
    const rows: StoredMessage[] = [];
    for (let i = 0; i < 30; i++) {
      rows.push({ role: "USER", content: [{ type: "text", text: `u${i}` }] });
      rows.push({ role: "ASSISTANT", content: [{ type: "tool_use", id: `t${i}`, name: "search_faq", input: {} }] });
      rows.push({ role: "TOOL", content: [{ type: "tool_result", tool_use_id: `t${i}`, content: "{}" }] });
      rows.push({ role: "ASSISTANT", content: [{ type: "text", text: `a${i}` }] });
    }
    const history = buildHistory(rows, 40);
    expect(history.length).toBeLessThanOrEqual(40);
    expect(history[0].role).toBe("user");
    expect(JSON.stringify(history[0].content)).toMatch(/"text":"u/);
    for (let i = 0; i < history.length; i++) {
      const m = history[i];
      if (m.role === "assistant" && JSON.stringify(m.content).includes("tool_use")) {
        expect(JSON.stringify(history[i + 1]?.content)).toContain("tool_result");
      }
    }
  });

  it("system prompt carries business facts, vertical rules and contact memory", async () => {
    const model = new ScriptedModelClient([reply("ok")]);
    const h = harness("VET", model, { memory: { name: "Omar", preferences: ["prefers mornings"], isReturning: true } });
    await h.send("hi");
    const sys = model.requests[0].system;
    expect(sys).toMatch(/Veterinary clinic Demo/);
    expect(sys).toMatch(/svc_1/);
    expect(sys).toMatch(/Never give veterinary advice/);
    expect(sys).toMatch(/Omar/);
    expect(sys).toMatch(/prefers mornings/);
    expect(sys).toMatch(/Returning customer/);
    expect(sys).toMatch(/Tuesday 8 September 2026/);
    expect(model.requests[0].tools.map((t) => t.name)).toContain("create_booking");
  });
});

describe("review regressions", () => {
  it("rejects create_booking when the service differs from the one availability was checked for", async () => {
    const model = new ScriptedModelClient([
      callTools(toolUse("check_availability", { serviceId: "svc_4", fromDate: "2026-09-09" })),
      (req) => {
        const slots = (lastToolResults(req)[0].value as { slots: { start: string; providerId: string }[] }).slots;
        return callTools(toolUse("create_booking", { serviceId: "svc_3", providerId: slots[0].providerId, startAt: slots[0].start, customerName: "Sara" }));
      },
      (req) => {
        expect(lastToolResults(req)[0].isError).toBe(true);
        return reply("Let me check availability for the filling instead.");
      },
    ]);
    const h = harness("DENTAL", model);
    await h.send("book me a filling");
    expect(h.tools.bookings).toHaveLength(0);
  });

  it("ignores tool calls after handoff_to_human in the same turn", async () => {
    const model = new ScriptedModelClient([
      callTools(toolUse("handoff_to_human", { reason: "Customer upset", urgency: "high" }), toolUse("check_availability", { serviceId: "svc_1", fromDate: "2026-09-09" })),
      (req) => {
        const results = lastToolResults(req);
        expect(results[1].isError).toBe(true);
        return callTools(toolUse("create_booking", { serviceId: "svc_1", providerId: "prov_1", startAt: "2026-09-09T13:00:00.000Z", customerName: "x" }));
      },
    ]);
    const h = harness("DENTAL", model);
    const out = await h.send("this is ridiculous, I want to complain");
    expect(out.handoff).toBeDefined();
    expect(h.tools.bookings).toHaveLength(0);
    expect(out.replies[0].text).toMatch(/team member/);
    expect(model.remaining).toBe(0);
  });

  it("does not persist orphaned tool_use blocks when the model ends its turn with a tool call", async () => {
    const model = new ScriptedModelClient([
      { content: [textBlock("One sec."), toolUse("get_business_info", {})], stopReason: "end_turn" },
      (req) => {
        for (const m of req.messages) if (m.role === "assistant") expect(JSON.stringify(m.content)).not.toContain("tool_use");
        return reply("ok");
      },
    ]);
    const h = harness("DENTAL", model);
    await h.send("hi");
    await h.send("hello?");
    expect(model.requests).toHaveLength(2);
  });

  it("history drops orphaned tool_use and orphaned tool_result rows anywhere", () => {
    const rows: StoredMessage[] = [
      { role: "USER", content: [{ type: "text", text: "u1" }] },
      { role: "ASSISTANT", content: [{ type: "text", text: "a" }, { type: "tool_use", id: "t1", name: "search_faq", input: {} }] },
      { role: "USER", content: [{ type: "text", text: "u2" }] },
      { role: "TOOL", content: [{ type: "tool_result", tool_use_id: "zzz", content: "{}" }] },
      { role: "ASSISTANT", content: [{ type: "text", text: "b" }] },
    ];
    const h = buildHistory(rows);
    expect(JSON.stringify(h)).not.toContain("tool_use");
    expect(JSON.stringify(h)).not.toContain("tool_result");
    expect(h.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("classifies SDK-style connection errors as retryable", () => {
    class APIConnectionError extends Error {}
    expect(isRetryable(new APIConnectionError("Connection error."))).toBe(true);
    expect(isRetryable(Object.assign(new Error("x"), { status: 429 }))).toBe(true);
    expect(isRetryable(Object.assign(new Error("x"), { status: 400 }))).toBe(false);
    expect(isRetryable(new ModelError("bad", false))).toBe(false);
  });

  it("confirmation-claim detection: catches real claims, ignores ordinary replies", () => {
    const claims = [
      "Your appointment is confirmed, no need to bring anything.",
      "You are booked in, nothing else to do.",
      "Great, that's booked for Tuesday at 10:00.",
      "Perfect, I have you down for Tuesday at 10:00.",
      "Locked in for Tuesday 10:00.",
      "I've put you in the diary for Tuesday at 10.",
      "Done! Tuesday at 10 with Dr Patel.",
      "You're all set, see you then!",
      "See you on Tuesday at 10.",
    ];
    const benign = [
      "That 10:00 time is booked already, but I have 11:00 free.",
      "All appointments are booked through this chat.",
      "Thursday is booked out, shall I look at Friday?",
      "Deep cleaning is booked as a 60-minute visit.",
      "The consultation fee is set at 40.",
      "Parking is reserved for patients.",
      "See you at the clinic entrance on the ground floor.",
      "See you next time!",
      "Nothing is booked yet. Which day would you like?",
      "Your appointment isn't confirmed until you pick a time.",
      "I can't confirm a booking without checking the calendar first.",
    ];
    for (const c of claims) expect(claimsConfirmation(c), c).toBe(true);
    for (const b of benign) expect(claimsConfirmation(b), b).toBe(false);
  });

  it("escalation triggers ignore benign sentences and catch real ones", () => {
    const benign: [string, string][] = [
      ["DENTAL", "Hi, this is Sue - can I book a clean?"],
      ["DENTAL", "My son knocked out his baby tooth last year, is he due a check-up?"],
      ["DENTAL", "Do you have a written cancellation and refund policy?"],
      ["CLINIC", "I had a stroke of luck getting an early slot!"],
      ["CLINIC", "My grandfather had a stroke ten years ago, does that matter?"],
      ["SALON", "Traffic was awful, sorry I'm late."],
      ["SALON", "My ankle is swelling so I may need to sit down."],
      ["SALON", "I'm going to a wedding on Saturday, can I get a blowout Friday?"],
      ["PHYSIO", "I had a fracture years ago, can you help with stiffness?"],
      ["PHYSIO", "My back is worse after sitting at a desk all day."],
      ["VET", "Is this houseplant poisonous to cats?"],
      ["VET", "She looks a bit bloated after dinner, nothing urgent."],
      ["VET", "My old dog died last year, this is a new puppy."],
      ["CHIRO", "I want to book a session after the car accident I had last year."],
      ["DENTAL", "Can I talk to someone about rescheduling on Friday?"],
      ["DENTAL", "I don't need to speak to a person, you're doing fine."],
    ];
    const real: [string, string, "emergency" | "handoff"][] = [
      ["DENTAL", "My face is swollen and I can't swallow properly", "emergency"],
      ["CLINIC", "I think my dad is having a stroke", "emergency"],
      ["VET", "My dog ate a bar of chocolate an hour ago", "emergency"],
      ["VET", "We had to put him down yesterday and I need to cancel", "handoff"],
      ["SALON", "My scalp is burning after the colour", "emergency"],
      ["PHYSIO", "I think I've broken my wrist", "emergency"],
      ["CHIRO", "I was in a car accident this morning", "emergency"],
      ["DENTAL", "I want to make a complaint about my last visit", "handoff"],
      ["DENTAL", "Can I speak to a real person please?", "handoff"],
    ];
    for (const [v, text] of benign) expect(preCheck(text, getVerticalPack(v as never)), `${v}: ${text}`).toBeNull();
    for (const [v, text, kind] of real) expect(preCheck(text, getVerticalPack(v as never))?.kind, `${v}: ${text}`).toBe(kind);
  });

  it("attaches slot buttons even when another tool runs after check_availability", async () => {
    const model = new ScriptedModelClient([
      callTools(toolUse("check_availability", { serviceId: "svc_1", fromDate: "2026-09-09" })),
      callTools(toolUse("update_contact_memory", { addPreference: "mornings" })),
      reply("I have Wednesday 9:00, 9:30 or 10:00."),
    ]);
    const h = harness("DENTAL", model);
    const out = await h.send("book a check-up tomorrow morning");
    expect(out.replies[0].quickReplies).toHaveLength(3);
  });
});
