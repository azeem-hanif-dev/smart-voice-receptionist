/**
 * Runs on `pnpm install`. Creates the root .env from .env.example if missing, and points each app/package
 * .env at the root file (symlinks) so there is exactly one place to edit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootEnv = path.join(root, ".env");
if (!fs.existsSync(rootEnv)) {
  fs.copyFileSync(path.join(root, ".env.example"), rootEnv);
  console.log("[link-env] created .env from .env.example");
}
for (const dir of ["apps/api", "apps/web", "packages/db"]) {
  const target = path.join(root, dir, ".env");
  try {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) continue;
    // A real file: leave it alone, the owner put it there on purpose.
    console.log(`[link-env] ${dir}/.env exists as a regular file; leaving it`);
    continue;
  } catch {
    /* missing: create the link */
  }
  fs.symlinkSync(path.relative(path.dirname(target), rootEnv), target);
  console.log(`[link-env] linked ${dir}/.env -> ../../.env`);
}
