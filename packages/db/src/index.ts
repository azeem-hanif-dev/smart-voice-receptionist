import { PrismaClient, Prisma } from "@prisma/client";

export * from "@prisma/client";
export { Prisma };

declare global {
  // eslint-disable-next-line no-var
  var __arPrisma: PrismaClient | undefined;
}

export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: process.env.PRISMA_LOG === "1" ? ["query", "warn", "error"] : ["warn"],
  });
}

/** Singleton for long-lived processes (API, workers). Tests create their own clients. */
export const prisma: PrismaClient = globalThis.__arPrisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.__arPrisma = prisma;

/**
 * True when an error is the Postgres exclusion-constraint violation raised by `booking_no_overlap`.
 * Prisma does not have a dedicated error code for exclusion constraints, so we match the constraint
 * name (and SQLSTATE 23P01 as a fallback) in the message.
 */
export function isSlotTakenError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const meta = (err as { meta?: { message?: string; code?: string } })?.meta;
  if (meta?.code === "23P01") return true;
  return /booking_no_overlap/.test(msg) || /booking_no_overlap/.test(meta?.message ?? "");
}
