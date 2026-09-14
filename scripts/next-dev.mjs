/**
 * Starts the Next.js dev server on WEB_PORT from the root .env (default 3000), after clearing stale build
 * output. Used by `pnpm --filter @ar/web dev` so ports live in one file.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "apps/web");
let port = process.env.WEB_PORT;
if (!port) {
  try {
    const m = fs.readFileSync(path.join(root, ".env"), "utf8").match(/^WEB_PORT=(\d+)/m);
    if (m) port = m[1];
  } catch {
    /* no .env yet */
  }
}
port ||= "3000";
// Only clear .next when it holds a production build (BUILD_ID); wiping a live dev server's folder breaks it.
if (fs.existsSync(path.join(webDir, ".next/BUILD_ID"))) fs.rmSync(path.join(webDir, ".next"), { recursive: true, force: true });
const child = spawn(path.join(webDir, "node_modules/.bin/next"), ["dev", "-p", port], { cwd: webDir, stdio: "inherit", env: { ...process.env, PORT: port } });
child.on("exit", (code) => process.exit(code ?? 0));
