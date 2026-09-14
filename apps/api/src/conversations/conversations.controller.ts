import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CONVERSATION_STATUSES } from "@ar/shared";
import { CurrentUser, OrgGuard } from "../auth/guards.js";
import { parseBody, parseQuery } from "../common/http.js";
import { ConversationsService } from "./conversations.service.js";

const TextSchema = z.object({ text: z.string().min(1).max(4000) });
const ListQuerySchema = z.object({ status: z.enum(CONVERSATION_STATUSES).optional(), q: z.string().max(100).optional() });

@Controller("orgs/:orgId/conversations")
@UseGuards(OrgGuard)
export class ConversationsController {
  constructor(@Inject(ConversationsService) private readonly conversations: ConversationsService) {}

  @Get()
  list(@Param("orgId") orgId: string, @Query() query: Record<string, string | undefined>) {
    return this.conversations.list(orgId, parseQuery(ListQuerySchema, query));
  }
  @Get(":id")
  get(@Param("orgId") orgId: string, @Param("id") id: string) {
    return this.conversations.get(orgId, id);
  }
  @Post(":id/takeover")
  takeover(@Param("orgId") orgId: string, @Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.conversations.takeover(orgId, id, user.id);
  }
  @Post(":id/handback")
  handback(@Param("orgId") orgId: string, @Param("id") id: string) {
    return this.conversations.handback(orgId, id);
  }
  @Post(":id/close")
  close(@Param("orgId") orgId: string, @Param("id") id: string) {
    return this.conversations.close(orgId, id);
  }
  @Post(":id/read")
  read(@Param("orgId") orgId: string, @Param("id") id: string) {
    return this.conversations.markRead(orgId, id);
  }
  @Post(":id/messages")
  message(@Param("orgId") orgId: string, @Param("id") id: string, @CurrentUser() user: { id: string }, @Body() body: unknown) {
    const { text } = parseBody(TextSchema, body);
    return this.conversations.staffMessage(orgId, id, user.id, text);
  }
}
