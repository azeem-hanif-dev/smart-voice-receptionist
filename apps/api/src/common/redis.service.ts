import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import IORedis, { type Redis } from "ioredis";
import { env } from "../config.js";

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  constructor(url: string = env().REDIS_URL) {
    // BullMQ requires maxRetriesPerRequest: null on its connections.
    this.client = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: false, enableReadyCheck: true });
  }

  /** BullMQ wants its own connection options; sharing a client between queues and workers is discouraged. */
  bullConnection(): { url: string } {
    return { url: env().REDIS_URL };
  }

  /**
   * Try to acquire a lock. Returns a release function, or null if the lock is held.
   * Used to serialise engine turns per conversation.
   */
  async lock(key: string, ttlMs: number): Promise<(() => Promise<void>) | null> {
    const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ok = await this.client.set(key, token, "PX", ttlMs, "NX");
    if (ok !== "OK") return null;
    return async () => {
      // Release only if we still own it.
      const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
      await this.client.eval(script, 1, key, token);
    };
  }

  /** Acquire with retry; throws after `maxWaitMs`. */
  async lockWithRetry(key: string, ttlMs: number, maxWaitMs: number): Promise<() => Promise<void>> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      const release = await this.lock(key, ttlMs);
      if (release) return release;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for lock ${key}`);
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 150));
    }
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }
}
