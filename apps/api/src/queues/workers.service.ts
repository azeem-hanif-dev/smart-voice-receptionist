import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import type { InboundMessage, ScheduledKind } from "@ar/shared";
import { PrismaService } from "../common/prisma.service.js";
import { RedisService } from "../common/redis.service.js";
import { env } from "../config.js";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { InboundService, lockKey } from "../inbound/inbound.service.js";
import { OutboundService } from "../inbound/outbound.service.js";
import { INBOUND_QUEUE, QueueService, SCHEDULED_QUEUE, queuePrefix, type InboundJob, type ScheduledJob } from "./queue.service.js";
import { RemindersService } from "./reminders.service.js";

/** BullMQ workers for the inbound (WhatsApp) queue and the scheduled-messages queue. */
@Injectable()
export class WorkersService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(WorkersService.name);
  private workers: Worker[] = [];
  private connection?: IORedis;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(InboundService) private readonly inbound: InboundService,
    @Inject(OutboundService) private readonly outbound: OutboundService,
    @Inject(RemindersService) private readonly reminders: RemindersService,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
    @Inject(QueueService) private readonly queues: QueueService,
  ) {}

  onModuleInit() {
    if (process.env.AR_DISABLE_WORKERS === "1") return;
    this.connection = new IORedis(env().REDIS_URL, { maxRetriesPerRequest: null });
    this.workers.push(
      new Worker<InboundJob>(INBOUND_QUEUE, (job) => this.processInbound(job), { connection: this.connection, prefix: queuePrefix(), concurrency: 5 }),
      new Worker<ScheduledJob>(SCHEDULED_QUEUE, (job) => this.processScheduled(job), { connection: this.connection, prefix: queuePrefix(), concurrency: 5 }),
    );
    for (const w of this.workers) w.on("failed", (job, err) => this.log.error(`job ${job?.name} ${job?.id} failed: ${err.message}`));
    void this.reconcileScheduled();
    this.reconcileTimer = setInterval(() => void this.reconcileScheduled(), 10 * 60_000);
    this.reconcileTimer.unref();
  }

  private reconcileTimer?: NodeJS.Timeout;

  /**
   * The ScheduledMessage table is the source of truth. Re-enqueue any SCHEDULED row whose job is missing from
   * Redis (seeded data, a flushed Redis, or a failed add), so reminders are never silently lost.
   */
  async reconcileScheduled(): Promise<number> {
    const rows = await this.prisma.client.scheduledMessage.findMany({ where: { status: "SCHEDULED" }, select: { id: true, jobId: true, runAt: true, kind: true } });
    let added = 0;
    for (const row of rows) {
      const job = await this.queues.scheduled.getJob(row.jobId);
      if (job) continue;
      await this.queues.scheduled.add(row.kind, { scheduledMessageId: row.id }, { jobId: row.jobId, delay: Math.max(0, row.runAt.getTime() - Date.now()) });
      added++;
    }
    if (added) this.log.log(`reconciled ${added} scheduled message(s) into the queue`);
    return added;
  }

  async onModuleDestroy() {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    await Promise.all(this.workers.map((w) => w.close()));
    await this.connection?.quit().catch(() => undefined);
  }

  private processInbound(job: Job<InboundJob>) {
    return this.processInboundEvent(job.data.eventId);
  }

  /** Process a stored WhatsApp webhook event. Marked processed only after success so a failed job is retried. */
  async processInboundEvent(eventId: string) {
    const ev = await this.prisma.client.webhookEvent.findUnique({ where: { provider_eventId: { provider: "WHATSAPP", eventId } } });
    if (!ev) return null;
    if (ev.processedAt) return null; // already handled (job retried after success)
    const msg = ev.payload as unknown as InboundMessage;
    try {
      const result = await this.inbound.handle(msg, { alreadyRecorded: true });
      await this.prisma.client.webhookEvent.update({ where: { id: ev.id }, data: { processedAt: new Date(), error: null } });
      return result;
    } catch (e) {
      await this.prisma.client.webhookEvent.update({ where: { id: ev.id }, data: { error: String((e as Error).message).slice(0, 500) } }).catch(() => undefined);
      throw e;
    }
  }

  private async processScheduled(job: Job<ScheduledJob>) {
    await this.deliverScheduled(job.data.scheduledMessageId, { force: false });
  }

  /** Send a scheduled message now (used by the worker and by the demo "send reminder" button). */
  async deliverScheduled(scheduledMessageId: string, opts: { force: boolean }): Promise<{ sent: boolean; reason?: string }> {
    const check = await this.reminders.shouldSend({ id: scheduledMessageId });
    const m = check.message ?? (await this.reminders.load(scheduledMessageId));
    if (!m) return { sent: false, reason: "row missing" };
    if (!check.send && !opts.force) {
      if (m.status === "SCHEDULED") await this.prisma.client.scheduledMessage.update({ where: { id: m.id }, data: { status: "CANCELLED", error: check.reason } });
      return { sent: false, reason: check.reason };
    }
    if (opts.force && m.booking?.status === "CANCELLED") return { sent: false, reason: "booking cancelled" };
    const kind = m.kind as ScheduledKind;
    const params = m.templateParams as Record<string, string>;
    const { text, def } = this.reminders.renderText(m.org, kind, params);
    // Deliver into the contact's most recent open conversation, creating one if needed (business-initiated).
    let conv = await this.prisma.client.conversation.findFirst({ where: { orgId: m.orgId, contactId: m.contactId, status: { not: "CLOSED" } }, orderBy: { createdAt: "desc" } });
    if (!conv) {
      const wa = m.org.whatsappConfig as { phoneNumberId?: string } | null;
      conv = await this.prisma.client.conversation.create({ data: { orgId: m.orgId, contactId: m.contactId, channel: wa?.phoneNumberId ? "WHATSAPP" : "SIMULATOR" } });
    }
    const release = await this.redis.lockWithRetry(lockKey(m.contactId, conv.channel), 60_000, 30_000);
    try {
      const row = await this.outbound.send(conv.id, { text, quickReplies: def.quickReplies, template: { name: def.name, params } }, { role: "SYSTEM", templateName: def.name, kind });
      if (row.deliveryStatus === "failed") {
        // The channel refused it (e.g. WhatsApp template not approved yet). Record the truth; do not retry blindly.
        await this.prisma.client.scheduledMessage.update({ where: { id: m.id }, data: { status: "FAILED", error: "Delivery failed on the channel; see the message in the inbox and the API log" } });
        return { sent: false, reason: "delivery failed" };
      }
      await this.prisma.client.scheduledMessage.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date() } });
      if (kind !== "CONFIRMATION") await this.analytics.record(m.orgId, "REMINDER_SENT", { kind }, conv.id, m.bookingId ?? undefined);
      return { sent: true };
    } catch (e) {
      await this.prisma.client.scheduledMessage.update({ where: { id: m.id }, data: { status: "FAILED", error: (e as Error).message } });
      throw e;
    } finally {
      await release();
    }
  }
}
