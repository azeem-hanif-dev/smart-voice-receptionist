import "reflect-metadata";
import "dotenv/config";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/common/prisma.service.js";
import { QueueService } from "../src/queues/queue.service.js";
import { createPrismaClient } from "@ar/db";

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
process.env.AR_DISABLE_WORKERS = process.env.AR_DISABLE_WORKERS ?? "1";
process.env.ANTHROPIC_API_KEY = "";
process.env.AR_QUEUE_PREFIX = "ar-test";

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({ client: createPrismaClient(process.env.DATABASE_URL_TEST), onModuleDestroy: async () => undefined })
    .compile();
  const app = moduleRef.createNestApplication({ rawBody: true, logger: ["error"] });
  await app.init();
  const queues = app.get(QueueService);
  await Promise.all([queues.inbound.obliterate({ force: true }), queues.scheduled.obliterate({ force: true })]);
  return app;
}

const servers = new WeakMap<INestApplication, Promise<string>>();

export function http(app: INestApplication) {
  const server = app.getHttpServer() as import("node:http").Server;
  let ready = servers.get(app);
  if (!ready) {
    ready = new Promise<string>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        resolve(`http://127.0.0.1:${addr.port}`);
      });
    });
    servers.set(app, ready);
  }
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}, raw?: string) => {
    const base = await ready!;
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extraHeaders },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, json: json as any, text };
  };
  return {
    get: (p: string) => call("GET", p),
    post: (p: string, b?: unknown, h?: Record<string, string>, raw?: string) => call("POST", p, b, h, raw),
    patch: (p: string, b?: unknown) => call("PATCH", p, b),
    del: (p: string) => call("DELETE", p),
    close: () => new Promise<void>((r) => (server.listening ? server.close(() => r()) : r())),
  };
}
