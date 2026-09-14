import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { env, hasAnthropicKey } from "./config.js";

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, logger: ["error", "warn", "log"] });
  app.enableCors({ origin: [env().APP_URL, "http://localhost:3000", "http://localhost:3001", "http://localhost:3002"], credentials: true });
  app.enableShutdownHooks();
  return app;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!);
if (isMain) {
  const app = await createApp();
  await app.listen(env().API_PORT);
  const log = new Logger("bootstrap");
  log.log(`API listening on ${env().API_URL}`);
  log.log(hasAnthropicKey() ? `Model: ${env().ANTHROPIC_MODEL} (effort ${env().ANTHROPIC_EFFORT})` : "Model: rule-based demo (set ANTHROPIC_API_KEY to use Claude)");
}
