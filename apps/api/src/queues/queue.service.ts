import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config.js";

export const INBOUND_QUEUE = "inbound";
/** Redis key prefix; tests use a separate prefix so they never share queues with a running dev server. */
export const queuePrefix = () => process.env.AR_QUEUE_PREFIX ?? "ar";
export const SCHEDULED_QUEUE = "scheduled-messages";

export interface InboundJob {
  orgId: string;
  eventId: string;
}
export interface ScheduledJob {
  scheduledMessageId: string;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  readonly connection: IORedis;
  readonly inbound: Queue<InboundJob>;
  readonly scheduled: Queue<ScheduledJob>;

  constructor(url: string = env().REDIS_URL) {
    this.connection = new IORedis(url, { maxRetriesPerRequest: null });
    this.inbound = new Queue<InboundJob>(INBOUND_QUEUE, { connection: this.connection, prefix: queuePrefix(), defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
    this.scheduled = new Queue<ScheduledJob>(SCHEDULED_QUEUE, { connection: this.connection, prefix: queuePrefix(), defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
  }

  async counts() {
    const [inbound, scheduled] = await Promise.all([this.inbound.getJobCounts("waiting", "active", "delayed", "failed"), this.scheduled.getJobCounts("waiting", "active", "delayed", "failed")]);
    return { inbound, scheduled };
  }

  async onModuleDestroy() {
    await Promise.all([this.inbound.close(), this.scheduled.close()]);
    await this.connection.quit().catch(() => undefined);
  }
}
