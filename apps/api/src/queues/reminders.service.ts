import { Inject, Injectable, Logger } from "@nestjs/common";
import { DateTime } from "luxon";
import { getVerticalPack, renderTemplate, type MessageTemplateDef } from "@ar/core";
import { BookingRulesSchema, type ScheduledKind, type Vertical } from "@ar/shared";
import type { Booking, Contact, Organization, Provider, Service } from "@ar/db";
import { PrismaService } from "../common/prisma.service.js";
import { QueueService } from "./queue.service.js";

type FullBooking = Booking & { service: Service; provider: Provider; contact: Contact; org: Organization };
const INCLUDE = { service: true, provider: true, contact: true, org: true } as const;

/** BullMQ custom ids may not contain ":"; use a double underscore. */
export function reminderJobId(bookingId: string, kind: ScheduledKind): string {
  return `${bookingId}__${kind}`;
}

/**
 * Schedules confirmation, reminders, no-show follow-ups and rebooking nudges as BullMQ delayed jobs.
 * The ScheduledMessage row is the source of truth; the worker re-checks it before sending.
 */
@Injectable()
export class RemindersService {
  private readonly log = new Logger(RemindersService.name);
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueueService) private readonly queues: QueueService,
  ) {}
  private get db() {
    return this.prisma.client;
  }

  templateFor(org: Organization, kind: ScheduledKind): MessageTemplateDef {
    const pack = getVerticalPack(org.vertical as Vertical);
    return pack.reminderTemplates[kind];
  }

  params(b: FullBooking): Record<string, string> {
    const when = DateTime.fromJSDate(b.startAt, { zone: b.org.timezone }).toFormat("cccc d LLLL 'at' HH:mm");
    return {
      customerName: b.contact.name?.split(" ")[0] ?? "there",
      businessName: b.org.name,
      service: b.service.name,
      dateTime: when,
      providerName: b.provider.name,
    };
  }

  /** Plan of (kind, runAt) for a booking given the org's rules and the pack's follow-up config. */
  plan(b: FullBooking, now = new Date()): { kind: ScheduledKind; runAt: Date }[] {
    const rules = BookingRulesSchema.parse(b.org.bookingRules ?? {});
    const pack = getVerticalPack(b.org.vertical as Vertical);
    const out: { kind: ScheduledKind; runAt: Date }[] = [{ kind: "CONFIRMATION", runAt: now }];
    const offsets = [...rules.reminderOffsetsMinutes].sort((a, z) => z - a);
    const kinds: ScheduledKind[] = ["REMINDER_24H", "REMINDER_2H"];
    offsets.slice(0, 2).forEach((minutes, i) => {
      const runAt = new Date(b.startAt.getTime() - minutes * 60_000);
      if (runAt.getTime() > now.getTime() + 60_000) out.push({ kind: kinds[i], runAt });
    });
    out.push({ kind: "NO_SHOW_FOLLOWUP", runAt: new Date(b.endAt.getTime() + pack.followUp.noShowFollowUpMinutes * 60_000) });
    if (pack.followUp.rebookAfterDays > 0) out.push({ kind: "REBOOK_NUDGE", runAt: new Date(b.endAt.getTime() + pack.followUp.rebookAfterDays * 86_400_000) });
    return out;
  }

  async scheduleForBooking(bookingId: string, now = new Date()): Promise<void> {
    const b = await this.db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: INCLUDE });
    if (b.contact.optedOut) return;
    for (const { kind, runAt } of this.plan(b, now)) {
      const jobId = reminderJobId(b.id, kind);
      const template = this.templateFor(b.org, kind);
      const row = await this.db.scheduledMessage.upsert({
        where: { jobId },
        create: { orgId: b.orgId, bookingId: b.id, contactId: b.contactId, kind, templateName: template.name, templateParams: this.params(b), runAt, status: "SCHEDULED", jobId },
        update: { runAt, status: "SCHEDULED", templateParams: this.params(b), sentAt: null, error: null },
      });
      const delay = Math.max(0, runAt.getTime() - Date.now());
      // Remove any stale delayed job with this id, then add (BullMQ ignores adds for an existing jobId).
      const existing = await this.queues.scheduled.getJob(jobId);
      if (existing) await existing.remove().catch(() => undefined);
      await this.queues.scheduled.add(kind, { scheduledMessageId: row.id }, { jobId, delay });
    }
  }

  async cancelForBooking(bookingId: string): Promise<void> {
    const rows = await this.db.scheduledMessage.findMany({ where: { bookingId, status: "SCHEDULED" } });
    for (const row of rows) {
      await this.db.scheduledMessage.update({ where: { id: row.id }, data: { status: "CANCELLED" } });
      const job = await this.queues.scheduled.getJob(row.jobId);
      if (job) await job.remove().catch((e) => this.log.warn(`could not remove job ${row.jobId}: ${e}`));
    }
  }

  async rescheduleForBooking(bookingId: string): Promise<void> {
    await this.cancelForBooking(bookingId);
    await this.scheduleForBooking(bookingId);
  }

  /** After staff mark a visit COMPLETED the no-show follow-up is dropped; NO_SHOW keeps it. */
  async afterVisit(bookingId: string, status: "COMPLETED" | "NO_SHOW"): Promise<void> {
    if (status === "COMPLETED") {
      const row = await this.db.scheduledMessage.findUnique({ where: { jobId: reminderJobId(bookingId, "NO_SHOW_FOLLOWUP") } });
      if (row && row.status === "SCHEDULED") {
        await this.db.scheduledMessage.update({ where: { id: row.id }, data: { status: "CANCELLED" } });
        const job = await this.queues.scheduled.getJob(row.jobId);
        if (job) await job.remove().catch(() => undefined);
      }
    }
  }

  /** Whether a scheduled message should still go out, re-evaluated at send time. */
  async shouldSend(row: { id: string }): Promise<{ send: boolean; reason?: string; message?: Awaited<ReturnType<RemindersService["load"]>> }> {
    const m = await this.load(row.id);
    if (!m) return { send: false, reason: "row missing" };
    if (m.status !== "SCHEDULED") return { send: false, reason: `status ${m.status}` };
    if (m.contact.optedOut) return { send: false, reason: "opted out" };
    const b = m.booking;
    if (b) {
      if (b.status === "CANCELLED") return { send: false, reason: "booking cancelled" };
      if (m.kind === "NO_SHOW_FOLLOWUP" && b.status !== "NO_SHOW") return { send: false, reason: `booking is ${b.status}, not NO_SHOW` };
      if (m.kind === "REBOOK_NUDGE") {
        const future = await this.db.booking.count({ where: { contactId: m.contactId, status: { not: "CANCELLED" }, startAt: { gt: new Date() } } });
        if (future > 0) return { send: false, reason: "customer already has a future booking" };
      }
      if ((m.kind === "REMINDER_24H" || m.kind === "REMINDER_2H") && b.startAt.getTime() < Date.now()) return { send: false, reason: "appointment already started" };
    }
    return { send: true, message: m };
  }

  load(id: string) {
    return this.db.scheduledMessage.findUnique({ where: { id }, include: { contact: true, org: true, booking: { include: { service: true, provider: true } } } });
  }

  renderText(org: Organization, kind: ScheduledKind, params: Record<string, string>): { text: string; def: MessageTemplateDef } {
    const def = this.templateFor(org, kind);
    return { text: renderTemplate(def, params), def };
  }
}
