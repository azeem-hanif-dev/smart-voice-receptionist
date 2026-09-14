import { cookies } from "next/headers";
import { API_URL } from "./api";
import type { Me } from "./types";

export const SESSION_COOKIE = "ar_session";

/**
 * Server-side `/auth/me`, used only to decide redirects.
 * Any failure (no cookie, 401, API down during a build) is treated as logged out.
 */
export async function getMeServer(): Promise<Me | null> {
  const jar = await cookies();
  const session = jar.get(SESSION_COOKIE);
  if (!session?.value) return null;

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { cookie: `${SESSION_COOKIE}=${session.value}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Me;
  } catch {
    return null;
  }
}
