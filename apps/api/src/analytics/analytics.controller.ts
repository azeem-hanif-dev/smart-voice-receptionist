import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { OrgGuard } from "../auth/guards.js";
import { AnalyticsService } from "./analytics.service.js";

@Controller("orgs/:orgId/analytics")
@UseGuards(OrgGuard)
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}
  @Get()
  summary(@Param("orgId") orgId: string, @Query("days") days?: string) {
    const n = Math.min(365, Math.max(1, Number(days) || 30));
    return this.analytics.summary(orgId, n);
  }
}
