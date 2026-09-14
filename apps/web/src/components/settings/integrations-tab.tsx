"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { GoogleIntegrationStatus, Org } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard } from "./ui";

export function IntegrationsTab({ org }: { org: Org }) {
  const [status, setStatus] = React.useState<GoogleIntegrationStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    api
      .get<GoogleIntegrationStatus>(`/orgs/${org.id}/integrations/google/status`)
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus({ configured: false, connected: false });
          setError(errorMessage(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [org.id]);

  return (
    <SettingsCard title="Integrations" description="Two-way calendar sync is not part of this build.">
      {status === null ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/70 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-100 to-blue-100 text-blue-600">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold tracking-tight">
              Google Calendar
              {status.connected ? (
                <Badge variant="success">Connected</Badge>
              ) : status.configured ? (
                <Badge variant="info">Configured</Badge>
              ) : (
                <Badge variant="muted">Not configured</Badge>
              )}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {status.connected
                ? "Connected."
                : status.configured
                  ? "Credentials are configured on the server, but this org is not connected."
                  : "Not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the API to enable it."}
            </p>
            {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
          </div>
          <Button variant="outline" disabled title="Google Calendar connection is not available in this build">
            Connect
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Bookings stay in this system; the availability engine is the source of truth for double-booking.
      </p>
    </SettingsCard>
  );
}
