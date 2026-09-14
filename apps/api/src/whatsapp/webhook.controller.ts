import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, Logger, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { Prisma } from "@ar/db";
import { OrgGuard, OwnerOnly } from "../auth/guards.js";
import { parseBody } from "../common/http.js";
import { PrismaService } from "../common/prisma.service.js";
import { InboundService } from "../inbound/inbound.service.js";
import { QueueService } from "../queues/queue.service.js";
import { WhatsAppAdapter } from "./whatsapp.adapter.js";

@Controller()
export class WhatsAppWebhookController {
  private readonly log = new Logger(WhatsAppWebhookController.name);
  constructor(
    @Inject(WhatsAppAdapter) private readonly adapter: WhatsAppAdapter,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InboundService) private readonly inbound: InboundService,
    @Inject(QueueService) private readonly queues: QueueService,
  ) {}

  /** Meta webhook verification handshake. */
  @Get("webhooks/whatsapp")
  verify(@Query() query: Record<string, string>, @Res() res: Response) {
    const r = this.adapter.verifyWebhook({ headers: {}, rawBody: "", query });
    if (!r.ok) throw new ForbiddenException(r.error);
    res.status(200).send(r.challenge ?? "");
  }

  /** Inbound events. Verifies the signature, stores each event once, enqueues, and returns 200 fast. */
  @Post("webhooks/whatsapp")
  async receive(@Req() req: Request & { rawBody?: Buffer }, @Body() payload: unknown, @Res() res: Response) {
    const raw = req.rawBody?.toString("utf8") ?? JSON.stringify(payload ?? {});
    const v = this.adapter.verifyWebhook({ headers: req.headers as Record<string, string>, rawBody: raw, query: {} });
    if (!v.ok) {
      this.log.warn(`rejected webhook: ${v.error}`);
      throw new ForbiddenException(v.error);
    }
    const phoneIds = WhatsAppAdapter.phoneNumberIds(payload);
    const candidates = await this.prisma.client.organization.findMany({ where: { whatsappConfig: { not: Prisma.DbNull } }, select: { id: true, whatsappConfig: true } });
    const orgs = candidates.filter((o) => phoneIds.includes(String((o.whatsappConfig as { phoneNumberId?: string } | null)?.phoneNumberId ?? "")));
    let enqueued = 0;
    for (const org of orgs) {
      for (const ev of this.adapter.normalize(payload, org.id)) {
        if (ev.statusUpdate) {
          await this.prisma.client.message.updateMany({ where: { providerMessageId: ev.statusUpdate.providerMessageId }, data: { deliveryStatus: ev.statusUpdate.status } });
          continue;
        }
        if (!ev.message) continue;
        const fresh = await this.inbound.recordEvent("WHATSAPP", ev.eventId, ev.message);
        if (!fresh) continue;
        await this.queues.inbound.add("whatsapp", { orgId: org.id, eventId: ev.eventId }, { jobId: ev.eventId });
        enqueued++;
      }
    }
    if (orgs.length === 0 && phoneIds.length) this.log.warn(`webhook for unknown phone_number_id(s) ${phoneIds.join(",")}`);
    res.status(200).json({ ok: true, enqueued });
  }
}

const TestSchema = z.object({ to: z.string().min(5), text: z.string().max(1000).default("Hello from your AI receptionist. This is a test message.") });

@Controller("orgs/:orgId/whatsapp")
@UseGuards(OrgGuard, OwnerOnly)
export class WhatsAppAdminController {
  constructor(@Inject(WhatsAppAdapter) private readonly adapter: WhatsAppAdapter) {}

  @Post("test-message")
  async test(@Param("orgId") orgId: string, @Body() body: unknown) {
    const { to, text } = parseBody(TestSchema, body);
    try {
      const r = await this.adapter.send({ orgId, conversationId: "test", phoneE164: to.startsWith("+") ? to : `+${to}` }, { text });
      return { ok: true, providerMessageId: r.providerMessageId };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
