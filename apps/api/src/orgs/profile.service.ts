import { Inject, Injectable } from "@nestjs/common";
import { formatSlotLabel, getVerticalPack, type BookingSummary, type BusinessProfile, type VerticalPack } from "@ar/core";
import { BookingRulesSchema, BrandVoiceSchema, ContactMemorySchema, type ContactMemory, type EscalationContact, type Vertical } from "@ar/shared";
import type { Booking, Contact, Organization, Provider, Service } from "@ar/db";
import { PrismaService } from "../common/prisma.service.js";

/** Builds the engine's view of a business from the database. */
@Injectable()
export class ProfileService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private get db() {
    return this.prisma.client;
  }

  async build(orgId: string): Promise<{ org: Organization; profile: BusinessProfile; pack: VerticalPack }> {
    const org = await this.db.organization.findUniqueOrThrow({
      where: { id: orgId },
      include: {
        locations: true,
        providers: { where: { active: true }, include: { services: true, workingHours: true }, orderBy: { createdAt: "asc" } },
        services: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        faqs: { orderBy: [{ sortOrder: "asc" }] },
      },
    });
    const pack = getVerticalPack(org.vertical as Vertical);
    const profile: BusinessProfile = {
      id: org.id,
      name: org.name,
      vertical: org.vertical as Vertical,
      timezone: org.timezone,
      locations: org.locations.map((l) => ({ name: l.name, address: l.address, phone: l.phone })),
      providers: org.providers.map((p) => ({ id: p.id, name: p.name, title: p.title ?? undefined, serviceIds: p.services.map((s) => s.serviceId) })),
      services: org.services.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes, priceCents: s.priceCents, currency: s.currency, description: s.description })),
      hours: org.providers.flatMap((p) => p.workingHours.map((h) => ({ providerId: p.id, weekday: h.weekday, startMinute: h.startMinute, endMinute: h.endMinute }))),
      faqs: org.faqs.map((f) => ({ question: f.question, answer: f.answer })),
      bookingRules: BookingRulesSchema.parse(org.bookingRules ?? {}),
      brandVoice: BrandVoiceSchema.parse(org.brandVoice ?? {}),
      escalationContacts: (org.escalationContacts as EscalationContact[]) ?? [],
    };
    return { org, profile, pack };
  }

  memoryOf(contact: Contact): ContactMemory {
    const parsed = ContactMemorySchema.safeParse(contact.memory ?? {});
    return parsed.success ? parsed.data : ContactMemorySchema.parse({});
  }

  bookingSummary(b: Booking & { service: Service; provider: Provider }, timezone: string): BookingSummary {
    return {
      id: b.id,
      serviceId: b.serviceId,
      serviceName: b.service.name,
      providerId: b.providerId,
      providerName: b.provider.name,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      status: b.status,
      label: formatSlotLabel(b.startAt.toISOString(), timezone),
      notes: b.notes,
    };
  }
}
