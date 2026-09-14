import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isSlotTakenError } from "../src/index.js";
import { testPrisma } from "./helpers.js";

const prisma = testPrisma();
let orgId: string;
let providerId: string;
let serviceId: string;
let contactId: string;

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: "test-double-booking" } });
  const org = await prisma.organization.create({
    data: { name: "Test Dental", slug: "test-double-booking", vertical: "DENTAL", timezone: "America/New_York" },
  });
  orgId = org.id;
  const provider = await prisma.provider.create({ data: { orgId, name: "Dr Test" } });
  providerId = provider.id;
  const service = await prisma.service.create({ data: { orgId, name: "Check-up", durationMinutes: 30 } });
  serviceId = service.id;
  const contact = await prisma.contact.create({ data: { orgId, phoneE164: "+15550000001", name: "Pat" } });
  contactId = contact.id;
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

function bookingData(
  startIso: string,
  endIso: string,
  status: "CONFIRMED" | "PENDING" | "CANCELLED" | "COMPLETED" | "NO_SHOW" = "CONFIRMED",
  buffers: { before?: number; after?: number } = {},
) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return {
    orgId,
    contactId,
    providerId,
    serviceId,
    status,
    source: "AI" as const,
    startAt: start,
    endAt: end,
    busyStartAt: new Date(start.getTime() - (buffers.before ?? 0) * 60_000),
    busyEndAt: new Date(end.getTime() + (buffers.after ?? 0) * 60_000),
  };
}

describe("booking_no_overlap exclusion constraint", () => {
  it("rejects an overlapping booking for the same provider and maps to SLOT_TAKEN", async () => {
    await prisma.booking.create({ data: bookingData("2030-01-06T14:00:00Z", "2030-01-06T14:30:00Z") });
    let caught: unknown;
    try {
      await prisma.booking.create({ data: bookingData("2030-01-06T14:15:00Z", "2030-01-06T14:45:00Z") });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(isSlotTakenError(caught)).toBe(true);
  });

  it("allows back-to-back bookings (half-open ranges)", async () => {
    await prisma.booking.create({ data: bookingData("2030-01-07T14:00:00Z", "2030-01-07T14:30:00Z") });
    await expect(
      prisma.booking.create({ data: bookingData("2030-01-07T14:30:00Z", "2030-01-07T15:00:00Z") }),
    ).resolves.toBeTruthy();
  });

  it("ignores cancelled bookings", async () => {
    await prisma.booking.create({ data: bookingData("2030-01-08T14:00:00Z", "2030-01-08T14:30:00Z", "CANCELLED") });
    await expect(
      prisma.booking.create({ data: bookingData("2030-01-08T14:00:00Z", "2030-01-08T14:30:00Z") }),
    ).resolves.toBeTruthy();
  });

  it("allows the same slot for a different provider", async () => {
    const other = await prisma.provider.create({ data: { orgId, name: "Dr Other" } });
    await prisma.booking.create({ data: bookingData("2030-01-09T14:00:00Z", "2030-01-09T14:30:00Z") });
    await expect(
      prisma.booking.create({
        data: { ...bookingData("2030-01-09T14:00:00Z", "2030-01-09T14:30:00Z"), providerId: other.id },
      }),
    ).resolves.toBeTruthy();
  });

  it("buffers are part of the protected range", async () => {
    // 14:00-14:30 with a 15 min after-buffer protects until 14:45
    await prisma.booking.create({ data: bookingData("2030-01-11T14:00:00Z", "2030-01-11T14:30:00Z", "CONFIRMED", { after: 15 }) });
    await expect(prisma.booking.create({ data: bookingData("2030-01-11T14:30:00Z", "2030-01-11T15:00:00Z") })).rejects.toSatisfy(isSlotTakenError);
    await expect(prisma.booking.create({ data: bookingData("2030-01-11T14:45:00Z", "2030-01-11T15:15:00Z") })).resolves.toBeTruthy();
    // a before-buffer on the new booking also collides
    await expect(
      prisma.booking.create({ data: bookingData("2030-01-11T15:30:00Z", "2030-01-11T16:00:00Z", "CONFIRMED", { before: 20 }) }),
    ).rejects.toSatisfy(isSlotTakenError);
  });

  it("COMPLETED and NO_SHOW bookings keep their slot; only CANCELLED frees it", async () => {
    await prisma.booking.create({ data: bookingData("2030-01-12T14:00:00Z", "2030-01-12T14:30:00Z", "NO_SHOW") });
    await expect(prisma.booking.create({ data: bookingData("2030-01-12T14:00:00Z", "2030-01-12T14:30:00Z") })).rejects.toSatisfy(isSlotTakenError);
    await prisma.booking.create({ data: bookingData("2030-01-12T15:00:00Z", "2030-01-12T15:30:00Z", "COMPLETED") });
    await expect(prisma.booking.create({ data: bookingData("2030-01-12T15:00:00Z", "2030-01-12T15:30:00Z") })).rejects.toSatisfy(isSlotTakenError);
  });

  it("rejects empty, inverted or non-covering ranges so the constraint cannot be bypassed", async () => {
    await expect(prisma.booking.create({ data: bookingData("2030-01-13T14:00:00Z", "2030-01-13T14:00:00Z") })).rejects.toThrow(/booking_(window|busy)_valid/);
    await expect(prisma.booking.create({ data: bookingData("2030-01-13T14:30:00Z", "2030-01-13T14:00:00Z") })).rejects.toThrow(/booking_(window|busy)_valid/);
    await expect(
      prisma.booking.create({
        data: { ...bookingData("2030-01-13T14:00:00Z", "2030-01-13T14:30:00Z"), busyStartAt: new Date("2030-01-13T14:10:00Z") },
      }),
    ).rejects.toThrow(/booking_busy_covers_window/);
    await expect(prisma.service.create({ data: { orgId, name: "Zero", durationMinutes: 0 } })).rejects.toThrow(/service_duration_positive/);
  });

  it("under 10 concurrent requests for one slot exactly one succeeds", async () => {
    const attempts = Array.from({ length: 10 }, () =>
      prisma.booking
        .create({ data: bookingData("2030-01-10T14:00:00Z", "2030-01-10T14:30:00Z") })
        .then(() => "ok" as const)
        .catch((e: unknown) => (isSlotTakenError(e) ? ("taken" as const) : ("other" as const))),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r === "taken")).toHaveLength(9);
    expect(results.filter((r) => r === "other")).toHaveLength(0);
    const count = await prisma.booking.count({ where: { providerId, startAt: new Date("2030-01-10T14:00:00Z"), status: "CONFIRMED" } });
    expect(count).toBe(1);
  });
});
