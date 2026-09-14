import "dotenv/config";
import { createPrismaClient } from "../src/index.js";

export function testPrisma() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST not set");
  return createPrismaClient(url);
}
