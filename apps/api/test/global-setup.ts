import "dotenv/config";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Recreate the test database once per run (same script the db package uses). */
export default function setup() {
  const dbPkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../packages/db");
  execSync("pnpm exec tsx scripts/prepare-test-db.ts", { cwd: dbPkg, stdio: "inherit", env: { ...process.env } });
}
