import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { PrismaService } from "../common/prisma.service.js";

export const SESSION_COOKIE = "ar_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async register(input: { email: string; password: string; name: string }): Promise<{ user: SessionUser; sessionId: string }> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.db.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("An account with this email already exists");
    const passwordHash = await argon2.hash(input.password);
    const user = await this.db.user.create({ data: { email, passwordHash, name: input.name.trim() } });
    const sessionId = await this.createSession(user.id);
    return { user: { id: user.id, email: user.email, name: user.name }, sessionId };
  }

  async login(input: { email: string; password: string }): Promise<{ user: SessionUser; sessionId: string }> {
    const user = await this.db.user.findUnique({ where: { email: input.email.toLowerCase().trim() } });
    if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    const sessionId = await this.createSession(user.id);
    return { user: { id: user.id, email: user.email, name: user.name }, sessionId };
  }

  async logout(sessionId: string | undefined) {
    if (sessionId) await this.db.session.deleteMany({ where: { id: sessionId } });
  }

  async userForSession(sessionId: string | undefined): Promise<SessionUser | null> {
    if (!sessionId) return null;
    const session = await this.db.session.findUnique({ where: { id: sessionId }, include: { user: true } });
    if (!session || session.expiresAt < new Date()) return null;
    return { id: session.user.id, email: session.user.email, name: session.user.name };
  }

  async orgsForUser(userId: string) {
    const memberships = await this.db.membership.findMany({ where: { userId }, include: { org: true }, orderBy: { createdAt: "asc" } });
    return memberships.map((m) => ({
      id: m.org.id,
      name: m.org.name,
      slug: m.org.slug,
      vertical: m.org.vertical,
      timezone: m.org.timezone,
      role: m.role,
      onboardedAt: m.org.onboardedAt,
    }));
  }

  async membership(userId: string, orgId: string) {
    return this.db.membership.findUnique({ where: { userId_orgId: { userId, orgId } } });
  }

  private async createSession(userId: string): Promise<string> {
    const id = randomBytes(32).toString("base64url");
    await this.db.session.create({ data: { id, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
    return id;
  }

  cookieOptions() {
    return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_MS };
  }
}
