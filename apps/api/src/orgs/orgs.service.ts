import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { getVerticalPack, type VerticalPack } from "@ar/core";
import {
  BookingRulesSchema,
  BrandVoiceSchema,
  CalendarConfigSchema,
  DEFAULT_BOOKING_RULES,
  EscalationContactSchema,
  WhatsAppConfigSchema,
  type Vertical,
} from "@ar/shared";
import { Prisma, type Organization } from "@ar/db";
import { z } from "zod";
import { PrismaService } from "../common/prisma.service.js";

export const BusinessHoursSchema = z
  .array(z.object({ weekday: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) }).refine((h) => h.endMinute > h.startMinute, "endMinute must be after startMinute"))
  .max(21);

export const UpdateOrgSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  timezone: z.string().min(1).optional(),
  brandVoice: BrandVoiceSchema.partial().optional(),
  bookingRules: BookingRulesSchema.partial().optional(),
  escalationContacts: z.array(EscalationContactSchema).optional(),
  businessHours: BusinessHoursSchema.optional(),
  whatsappConfig: WhatsAppConfigSchema.extend({ accessToken: z.string().optional() }).nullable().optional(),
  calendarConfig: CalendarConfigSchema.partial().optional(),
  onboarded: z.literal(true).optional(),
});

/** Sensible default currency for prefilled prices; owners can change it per service. */
export function currencyForTimezone(tz: string): string {
  if (tz.startsWith("Europe/London") || tz.startsWith("Europe/Belfast")) return "GBP";
  if (tz.startsWith("Asia/Karachi")) return "PKR";
  if (tz.startsWith("Europe/")) return "EUR";
  if (tz.startsWith("Australia/")) return "AUD";
  if (tz.startsWith("America/Toronto") || tz.startsWith("America/Vancouver")) return "CAD";
  if (tz.startsWith("Asia/Dubai")) return "AED";
  if (tz.startsWith("Asia/Kolkata")) return "INR";
  return "USD";
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "org";
}

@Injectable()
export class OrgsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private get db() {
    return this.prisma.client;
  }

  pack(org: { vertical: Vertical | string }): VerticalPack {
    return getVerticalPack(org.vertical as Vertical);
  }

  async get(orgId: string): Promise<Organization> {
    const org = await this.db.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException("Organization not found");
    return org;
  }

  /** Create an organization prefilled from its vertical pack. */
  async create(ownerUserId: string, input: { name: string; vertical: Vertical; timezone: string; currency?: string }): Promise<Organization> {
    const pack = getVerticalPack(input.vertical);
    const currency = input.currency ?? currencyForTimezone(input.timezone);
    const base = slugify(input.name);
    let slug = base;
    for (let i = 2; await this.db.organization.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    const businessHours = pack.defaultHours.map(([weekday, startMinute, endMinute]) => ({ weekday, startMinute, endMinute }));
    return this.db.organization.create({
      data: {
        name: input.name.trim(),
        slug,
        vertical: input.vertical,
        timezone: input.timezone,
        brandVoice: BrandVoiceSchema.parse({ tone: "friendly", assistantName: "Mia", description: `${input.name.trim()} is a ${pack.displayName.toLowerCase()}.` }) as Prisma.InputJsonValue,
        bookingRules: DEFAULT_BOOKING_RULES as unknown as Prisma.InputJsonValue,
        businessHours,
        escalationContacts: [],
        memberships: { create: { userId: ownerUserId, role: "OWNER" } },
        locations: { create: { name: "Main location" } },
        services: {
          create: pack.defaultServices.map((s, i) => ({
            name: s.name,
            description: s.description,
            durationMinutes: s.durationMinutes,
            bufferAfterMinutes: s.bufferAfterMinutes ?? 0,
            priceCents: s.priceCents,
            currency,
            sortOrder: i,
          })),
        },
        faqs: { create: pack.faqSeeds.map((f, i) => ({ question: f.question, answer: f.answer, keywords: f.keywords, sortOrder: i })) },
      },
    });
  }

  async update(orgId: string, patch: z.infer<typeof UpdateOrgSchema>): Promise<Organization> {
    const org = await this.get(orgId);
    const data: Prisma.OrganizationUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name.trim();
    if (patch.timezone !== undefined) data.timezone = patch.timezone;
    if (patch.brandVoice) data.brandVoice = BrandVoiceSchema.parse({ ...(org.brandVoice as object), ...patch.brandVoice }) as Prisma.InputJsonValue;
    if (patch.bookingRules) data.bookingRules = BookingRulesSchema.parse({ ...(org.bookingRules as object), ...patch.bookingRules }) as Prisma.InputJsonValue;
    if (patch.escalationContacts) data.escalationContacts = patch.escalationContacts as Prisma.InputJsonValue;
    if (patch.businessHours) data.businessHours = patch.businessHours as Prisma.InputJsonValue;
    if (patch.whatsappConfig !== undefined) {
      if (patch.whatsappConfig === null) data.whatsappConfig = Prisma.DbNull;
      else {
        const prev = (org.whatsappConfig ?? {}) as { accessToken?: string };
        const incoming = patch.whatsappConfig.accessToken;
        const token = !incoming || incoming === "•••" ? prev.accessToken ?? "" : incoming;
        if (!token) throw new ConflictException("An access token is required to connect WhatsApp");
        data.whatsappConfig = { ...patch.whatsappConfig, accessToken: token } as Prisma.InputJsonValue;
      }
    }
    if (patch.calendarConfig) data.calendarConfig = CalendarConfigSchema.parse({ ...((org.calendarConfig as object) ?? {}), ...patch.calendarConfig }) as Prisma.InputJsonValue;
    if (patch.onboarded) data.onboardedAt = org.onboardedAt ?? new Date();
    return this.db.organization.update({ where: { id: orgId }, data });
  }

  async serialize(org: Organization) {
    const [providers, services, faqs, contacts, conversations, bookings] = await Promise.all([
      this.db.provider.count({ where: { orgId: org.id } }),
      this.db.service.count({ where: { orgId: org.id } }),
      this.db.faq.count({ where: { orgId: org.id } }),
      this.db.contact.count({ where: { orgId: org.id } }),
      this.db.conversation.count({ where: { orgId: org.id } }),
      this.db.booking.count({ where: { orgId: org.id } }),
    ]);
    const wa = org.whatsappConfig as { accessToken?: string; phoneNumberId?: string } | null;
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      vertical: org.vertical,
      timezone: org.timezone,
      plan: org.plan,
      brandVoice: BrandVoiceSchema.parse(org.brandVoice ?? {}),
      bookingRules: BookingRulesSchema.parse(org.bookingRules ?? {}),
      businessHours: org.businessHours,
      whatsappConfig: wa ? { ...wa, accessToken: wa.accessToken ? "•••" : "" } : null,
      whatsappConnected: Boolean(wa?.phoneNumberId && wa?.accessToken),
      escalationContacts: org.escalationContacts,
      calendarConfig: org.calendarConfig ?? { provider: "none" },
      onboardedAt: org.onboardedAt,
      createdAt: org.createdAt,
      counts: { providers, services, faqs, contacts, conversations, bookings },
    };
  }

}
