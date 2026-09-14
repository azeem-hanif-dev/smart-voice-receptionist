/**
 * Creates the test database (if missing) and applies migrations to it.
 * Used by `pnpm --filter @ar/db test` and `pnpm --filter @ar/api test`.
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  console.error("DATABASE_URL_TEST is not set; copy .env.example to .env");
  process.exit(1);
}
const url = new URL(testUrl);
const dbName = url.pathname.replace(/^\//, "");
const adminUrl = new URL(testUrl);
adminUrl.pathname = "/postgres";

const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
try {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  console.log(`recreated database ${dbName}`);
} finally {
  await admin.$disconnect();
}

const dbPkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
execSync("pnpm exec prisma migrate deploy", {
  cwd: dbPkgDir,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl },
});
