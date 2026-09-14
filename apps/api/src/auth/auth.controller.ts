import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../common/http.js";
import { env, hasAnthropicKey } from "../config.js";
import { AuthService, SESSION_COOKIE } from "./auth.service.js";
import { CurrentUser, SessionGuard, sessionIdFrom } from "./guards.js";

const RegisterSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(200), name: z.string().min(1).max(100) });
const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("register")
  async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseBody(RegisterSchema, body);
    const { user, sessionId } = await this.auth.register(input);
    res.cookie(SESSION_COOKIE, sessionId, this.auth.cookieOptions());
    return { user, orgs: [] };
  }

  @Post("login")
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseBody(LoginSchema, body);
    const { user, sessionId } = await this.auth.login(input);
    res.cookie(SESSION_COOKIE, sessionId, this.auth.cookieOptions());
    return { user, orgs: await this.auth.orgsForUser(user.id) };
  }

  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(sessionIdFrom(req));
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }

  @Get("me")
  @UseGuards(SessionGuard)
  async me(@CurrentUser() user: { id: string; email: string; name: string }) {
    return {
      user,
      orgs: await this.auth.orgsForUser(user.id),
      modelMode: hasAnthropicKey() ? "anthropic" : "demo",
      model: hasAnthropicKey() ? env().ANTHROPIC_MODEL : "rule-based-demo",
    };
  }
}
