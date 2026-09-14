import { DEFAULT_BOOKING_RULES, DEFAULT_BRAND_VOICE, type Vertical } from "@ar/shared";
import {
  InMemoryTools,
  emptyEngineState,
  getVerticalPack,
  runTurn,
  type BusinessProfile,
  type EngineInput,
  type EngineOutput,
  type EngineState,
  type ModelClient,
  type StoredMessage,
} from "../src/index.js";

/** Tuesday 2026-09-08 09:00 America/New_York. */
export const NOW = "2026-09-08T13:00:00.000Z";
export const TZ = "America/New_York";

export function makeProfile(vertical: Vertical, over: Partial<BusinessProfile> = {}): BusinessProfile {
  const pack = getVerticalPack(vertical);
  const services = pack.defaultServices.map((s, i) => ({
    id: `svc_${i + 1}`,
    name: s.name,
    durationMinutes: s.durationMinutes,
    priceCents: s.priceCents ?? null,
    currency: "USD",
    description: s.description ?? null,
  }));
  const providers = [
    { id: "prov_1", name: "Dr Aisha Patel", title: pack.vocabulary.provider, serviceIds: services.map((s) => s.id) },
    { id: "prov_2", name: "Dr Ben Carter", title: pack.vocabulary.provider, serviceIds: services.slice(0, 3).map((s) => s.id) },
  ];
  const hours = providers.flatMap((p) => pack.defaultHours.map(([weekday, startMinute, endMinute]) => ({ providerId: p.id, weekday, startMinute, endMinute })));
  return {
    id: "org_1",
    name: `${pack.displayName} Demo`,
    vertical,
    timezone: TZ,
    locations: [{ name: "Main", address: "12 High Street", phone: "+15550001111" }],
    providers,
    services,
    hours,
    faqs: pack.faqSeeds.map((f) => ({ question: f.question, answer: f.answer })),
    bookingRules: { ...DEFAULT_BOOKING_RULES, minLeadMinutes: 60 },
    brandVoice: { ...DEFAULT_BRAND_VOICE, assistantName: "Mia" },
    escalationContacts: [{ name: "Front desk", notifyVia: "dashboard" }],
    ...over,
  };
}

export interface Harness {
  profile: BusinessProfile;
  tools: InMemoryTools;
  history: StoredMessage[];
  state: EngineState;
  outputs: EngineOutput[];
  send(text: string, buttonId?: string): Promise<EngineOutput>;
  lastText(): string;
}

export function harness(vertical: Vertical, model: ModelClient, opts: { memory?: Record<string, unknown>; name?: string | null; now?: string } = {}): Harness {
  const profile = makeProfile(vertical);
  const pack = getVerticalPack(vertical);
  const tools = new InMemoryTools(profile, "contact_1", opts.memory as never, () => opts.now ?? NOW);
  const h: Harness = {
    profile,
    tools,
    history: [],
    state: emptyEngineState(),
    outputs: [],
    async send(text, buttonId) {
      const input: EngineInput = {
        profile,
        pack,
        contact: { id: "contact_1", phoneE164: "+15551234567", name: opts.name ?? null, memory: tools.memory, upcomingBookings: (await tools.findBookings({ includePast: false })).bookings },
        conversation: { id: "conv_1", state: h.state, channelSupportsButtons: true },
        history: h.history,
        inbound: { text, buttonId },
        now: opts.now ?? NOW,
      };
      const out = await runTurn(input, { model, tools, sleep: async () => {} });
      h.history.push(...out.newMessages);
      h.state = out.state;
      h.outputs.push(out);
      return out;
    },
    lastText() {
      const o = h.outputs[h.outputs.length - 1];
      return o.replies.map((r) => r.text).join("\n");
    },
  };
  return h;
}
