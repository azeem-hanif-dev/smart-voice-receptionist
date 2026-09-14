"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, auth } from "./api";
import type { Me } from "./types";

export interface UseMeResult {
  me: Me | null;
  loading: boolean;
  /** Set when /auth/me failed for a reason other than "not logged in". */
  error: string | null;
  unauthenticated: boolean;
  reload: () => void;
}

/** Client-side `/auth/me`. Treats 401 as "logged out" rather than an error. */
export function useMe(): UseMeResult {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    auth
      .me()
      .then((result) => {
        if (cancelled) return;
        setMe(result);
        setUnauthenticated(false);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMe(null);
        if (err instanceof ApiError && err.isUnauthorized) {
          setUnauthenticated(true);
          setError(null);
        } else {
          setUnauthenticated(false);
          setError(err instanceof Error ? err.message : "Could not load your account");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { me, loading, error, unauthenticated, reload };
}
