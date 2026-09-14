import { Inject, Injectable, Logger } from "@nestjs/common";
import { runTurn, type EngineOutput, type EngineState, type ModelClient, type StoredMessage, emptyEngineState } from "@ar/core";
import type { Prisma } from "@ar/db";
import { PrismaService } from "../common/prisma.service.js";
import { ProfileService } from "../orgs/profile.service.js";
import { BookingsService } from "../bookings/bookings.service.js";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { defaultModelClient } from "./model-client.js";
import { PrismaTools } from "./prisma-tools.js";

export const MODEL_CLIENT = "MODEL_CLIENT";

/** Runs one engine turn for a conversation and persists everything except delivery. */
@Injectable()
export class EngineService {
  private readonly log = new Logger(EngineService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProfileService) private readonly profiles: ProfileService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
    @Inject(MODEL_CLIENT) private readonly model: ModelClient,
  ) {}
  private get db() {
    return this.prisma.client;
  }

  get modelName() {
    return this.model.name;
  }

  async run(conversationId: string, inbound: { text: string; buttonId?: string }, opts: { channelSupportsButtons: boolean; now?: string }): Promise<EngineOutput> {
    const conv = await this.db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { contact: true } });
    const { profile, pack } = await this.profiles.build(conv.orgId);
    const historyRows = (await this.db.message.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: 60 })).reverse();
    const history: StoredMessage[] = historyRows
      .filter((m) => m.role !== "STAFF" || m.text)
      .map((m) => ({ role: m.role, content: m.content as unknown as StoredMessage["content"], text: m.text ?? undefined }));
    const state: EngineState = { ...emptyEngineState(), ...((conv.engineState as Partial<EngineState>) ?? {}) };
    const tools = new PrismaTools(this.db, this.bookings, this.profiles, this.analytics, { orgId: conv.orgId, contactId: conv.contactId, conversationId, profile });

    const output = await runTurn(
      {
        profile,
        pack,
        contact: {
          id: conv.contact.id,
          phoneE164: conv.contact.phoneE164,
          name: conv.contact.name,
          memory: this.profiles.memoryOf(conv.contact),
          upcomingBookings: await this.bookings.upcomingForContact(conv.orgId, conv.contactId),
        },
        conversation: { id: conv.id, state, channelSupportsButtons: opts.channelSupportsButtons, summary: conv.summary },
        history,
        inbound,
        now: opts.now,
      },
      { model: this.model, tools },
    );

    // Persist every message except the final assistant reply, which OutboundService stores when it is delivered.
    const toStore = output.newMessages.filter((m, i) => !(m.role === "ASSISTANT" && i === output.newMessages.length - 1 && output.replies.length > 0));
    for (const m of toStore) {
      await this.db.message.create({
        data: {
          conversationId,
          direction: m.role === "USER" ? "INBOUND" : "OUTBOUND",
          role: m.role,
          content: m.content as unknown as Prisma.InputJsonValue,
          text: m.text ?? null,
          buttons: (m.buttons as unknown as Prisma.InputJsonValue) ?? undefined,
        },
      });
    }
    await this.db.conversation.update({ where: { id: conversationId }, data: { engineState: output.state as unknown as Prisma.InputJsonValue } });
    for (const e of output.events) {
      if (e.type === "AI_REPLIED") continue; // recorded by the inbound pipeline with timing
      if (e.type.startsWith("BOOKING_")) continue; // recorded by BookingsService
      await this.analytics.record(conv.orgId, e.type, e.meta ?? {}, conversationId);
    }
    if (output.handoff) this.log.log(`handoff on ${conversationId}: ${output.handoff.reason}`);
    return output;
  }

  /** The last assistant message of a turn is stored by OutboundService; expose the blocks so it can. */
  static finalAssistantMessage(output: EngineOutput): StoredMessage | undefined {
    const last = output.newMessages[output.newMessages.length - 1];
    return last?.role === "ASSISTANT" ? last : undefined;
  }
}

export const modelClientProvider = { provide: MODEL_CLIENT, useFactory: () => defaultModelClient() };
