import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";
import { AuthService, SESSION_COOKIE, type SessionUser } from "./auth.service.js";

export interface AuthedRequest extends Request {
  user?: SessionUser;
  sessionId?: string;
  membershipRole?: "OWNER" | "STAFF";
}

export function sessionIdFrom(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** Requires a valid session. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const sessionId = sessionIdFrom(req);
    const user = await this.auth.userForSession(sessionId);
    if (!user) throw new UnauthorizedException("Not signed in");
    req.user = user;
    req.sessionId = sessionId;
    return true;
  }
}

/** Requires a valid session AND membership of the `:orgId` route param. */
@Injectable()
export class OrgGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const sessionId = sessionIdFrom(req);
    const user = await this.auth.userForSession(sessionId);
    if (!user) throw new UnauthorizedException("Not signed in");
    const orgId = String(req.params.orgId ?? "");
    const m = await this.auth.membership(user.id, orgId);
    if (!m) throw new ForbiddenException("Not a member of this organization");
    req.user = user;
    req.sessionId = sessionId;
    req.membershipRole = m.role;
    return true;
  }
}

/** Use after OrgGuard on routes that only owners may call. */
@Injectable()
export class OwnerOnly implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (req.membershipRole !== "OWNER") throw new ForbiddenException("Only owners can do this");
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.user!;
});

export const MembershipRole = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().membershipRole;
});
