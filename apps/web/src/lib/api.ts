import type { AuthResult, Me } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface ApiIssue {
  path?: (string | number)[];
  message: string;
  code?: string;
}

/** Thrown for every non-2xx response, and for a network failure (status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly issues: ApiIssue[];
  /** The full error body (e.g. `{ reason: "SLOT_TAKEN", alternatives }` on 409). */
  readonly payload: unknown;

  constructor(status: number, message: string, issues: ApiIssue[] = [], payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.issues = issues;
    this.payload = payload;
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isOffline() {
    return this.status === 0;
  }
}

function messageFrom(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
    if (Array.isArray(message) && message.length) return message.join(", ");
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return fallback;
}

function issuesFrom(payload: unknown): ApiIssue[] {
  if (payload && typeof payload === "object") {
    const issues = (payload as { issues?: unknown }).issues;
    if (Array.isArray(issues)) return issues as ApiIssue[];
  }
  return [];
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      credentials: "include",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, `Cannot reach the API at ${API_URL}. Is it running?`);
  }

  const text = await res.text();
  let payload: unknown = undefined;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, messageFrom(payload, res.statusText || "Request failed"), issuesFrom(payload), payload);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  del: <T>(path: string) => request<T>("DELETE", path),
};

/** Builds `?a=1&b=2` from defined values only. */
export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/* Auth helpers ------------------------------------------------------------ */

export const auth = {
  register: (input: { email: string; password: string; name: string }) =>
    api.post<AuthResult>("/auth/register", input),
  login: (input: { email: string; password: string }) => api.post<AuthResult>("/auth/login", input),
  logout: () => api.post<{ ok: true }>("/auth/logout"),
  me: () => api.get<Me>("/auth/me"),
};

/** Where a freshly authenticated user should land. */
export function landingPath(orgs: { id: string; onboardedAt: string | null }[]): string {
  if (orgs.length === 0) return "/onboarding";
  const org = orgs.find((o) => o.onboardedAt) ?? orgs[0];
  return `/o/${org.id}/inbox`;
}

/** Human-readable text for anything thrown by `api.*`. */
export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof ApiError) {
    if (error.issues.length) return error.issues.map((issue) => issue.message).join(", ");
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
