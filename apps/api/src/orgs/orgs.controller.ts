import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { listVerticalPacks } from "@ar/core";
import { VERTICALS } from "@ar/shared";
import { z } from "zod";
import { parseBody } from "../common/http.js";
import { CurrentUser, OrgGuard, OwnerOnly, SessionGuard } from "../auth/guards.js";
import { OrgsService, UpdateOrgSchema } from "./orgs.service.js";

const CreateOrgSchema = z.object({ name: z.string().min(1).max(120), vertical: z.enum(VERTICALS), timezone: z.string().min(1), currency: z.string().length(3).optional() });

@Controller()
export class OrgsController {
  constructor(@Inject(OrgsService) private readonly orgs: OrgsService) {}

  @Get("verticals")
  verticals() {
    return listVerticalPacks().map((p) => ({
      id: p.id,
      displayName: p.displayName,
      tagline: p.tagline,
      vocabulary: p.vocabulary,
      defaultServices: p.defaultServices,
      defaultHours: p.defaultHours,
      faqSeeds: p.faqSeeds,
      qualificationQuestions: p.qualificationQuestions,
      sampleCustomerMessages: p.sampleCustomerMessages,
    }));
  }

  @Post("orgs")
  @UseGuards(SessionGuard)
  async create(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    const input = parseBody(CreateOrgSchema, body);
    const org = await this.orgs.create(user.id, input);
    return this.orgs.serialize(org);
  }

  @Get("orgs/:orgId")
  @UseGuards(OrgGuard)
  async get(@Param("orgId") orgId: string) {
    return this.orgs.serialize(await this.orgs.get(orgId));
  }

  @Patch("orgs/:orgId")
  @UseGuards(OrgGuard, OwnerOnly)
  async update(@Param("orgId") orgId: string, @Body() body: unknown) {
    const patch = parseBody(UpdateOrgSchema, body);
    return this.orgs.serialize(await this.orgs.update(orgId, patch));
  }

  @Get("orgs/:orgId/vertical-pack")
  @UseGuards(OrgGuard)
  async pack(@Param("orgId") orgId: string) {
    const org = await this.orgs.get(orgId);
    const p = this.orgs.pack(org);
    return { ...p, escalationTriggers: p.escalationTriggers };
  }
}
