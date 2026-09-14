import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// cwd first (apps/api/.env is a symlink to the root .env), then the repository root as a fallback.
function loadDotEnv(override = false) {
  loadEnv({ override });
  loadEnv({ override, path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });
}
loadDotEnv();

/** Re-read .env (values edited after boot win) and drop the cached parse. */
export function reloadEnv() {
  loadDotEnv(true);
  cached = null;
}

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  API_PORT: z.coerce.number().default(4000),
  API_URL: z.string().default("http://localhost:4000"),
  APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SESSION_SECRET: z.string().min(8).default("dev-session-secret-change-me"),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5"),
  /** Required only when the API key is an organization-level key not scoped to a workspace. */
  ANTHROPIC_WORKSPACE_ID: z.string().optional().default(""),
  ANTHROPIC_EFFORT: z.enum(["low", "medium", "high"]).default("low"),
  WHATSAPP_APP_SECRET: z.string().optional().default(""),
  WHATSAPP_VERIFY_TOKEN: z.string().default("ai-receptionist-verify"),
  WHATSAPP_GRAPH_VERSION: z.string().default("v21.0"),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GOOGLE_REDIRECT_URI: z.string().optional().default(""),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;
export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** For tests that change process.env after boot. */
export function resetEnvCache() {
  cached = null;
}

export const isProd = () => env().NODE_ENV === "production";
export const hasAnthropicKey = () => env().ANTHROPIC_API_KEY.length > 0;

