import { Controller, Get, Inject, NotImplementedException, Param, Query, UseGuards } from "@nestjs/common";
import { OrgGuard } from "../auth/guards.js";
import { PrismaService } from "../common/prisma.service.js";
import { env, hasAnthropicKey } from "../config.js";
import { QueueService } from "../queues/queue.service.js";

@Controller()
export class IntegrationsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueueService) private readonly queues: QueueService,
  ) {}

  @Get("health")
  async health() {
    await this.prisma.client.$queryRaw`SELECT 1`;
    return { ok: true, modelMode: hasAnthropicKey() ? "anthropic" : "demo", model: hasAnthropicKey() ? env().ANTHROPIC_MODEL : "rule-based-demo", queues: await this.queues.counts() };
  }

  @Get("orgs/:orgId/integrations/google/status")
  @UseGuards(OrgGuard)
  async googleStatus(@Param("orgId") orgId: string) {
    const org = await this.prisma.client.organization.findUniqueOrThrow({ where: { id: orgId } });
    const cfg = (org.calendarConfig ?? {}) as { provider?: string; connectedAt?: string };
    return { configured: Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET), connected: cfg.provider === "google" && Boolean(cfg.connectedAt), docs: "docs/GOOGLE_CALENDAR_SETUP.md" };
  }

  /** OAuth entry point. Stubbed until Google credentials are configured; see docs/GOOGLE_CALENDAR_SETUP.md. */
  @Get("integrations/google/connect")
  connect(@Query("orgId") orgId?: string) {
    if (!env().GOOGLE_CLIENT_ID) {
      throw new NotImplementedException("Google Calendar sync is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see docs/GOOGLE_CALENDAR_SETUP.md).");
    }
    throw new NotImplementedException(`Google OAuth flow for org ${orgId ?? "?"} is stubbed in this build; the CalendarAdapter interface in @ar/core is the seam to implement.`);
  }
}
