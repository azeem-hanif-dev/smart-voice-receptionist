"use client";

import * as React from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import {
  BellRing,
  CalendarCheck2,
  CalendarX2,
  CheckCheck,
  Info,
  MessageSquare,
  MessagesSquare,
  Timer,
  UserRoundCog,
} from "lucide-react";
import { api, errorMessage, query } from "@/lib/api";
import type { Analytics } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SeriesChart } from "./series-chart";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

type Tone = "brand" | "success" | "info" | "warning" | "muted";

const TONE_CLASS: Record<Tone, string> = {
  brand: "bg-primary/10 text-primary",
  success: "bg-emerald-50 text-emerald-600",
  info: "bg-sky-50 text-sky-600",
  warning: "bg-amber-50 text-amber-600",
  muted: "bg-muted text-muted-foreground",
};

/** The API also returns the org timezone and two guardrail counters. */
interface AnalyticsResponse extends Analytics {
  timezone?: string;
  guardrailBlocks?: number;
  modelErrors?: number;
}

export function AnalyticsDashboard({ orgId }: { orgId: string }) {
  const [days, setDays] = React.useState<Range>(30);
  const [data, setData] = React.useState<AnalyticsResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<AnalyticsResponse>(`/orgs/${orgId}/analytics${query({ days })}`)
      .then((row) => {
        if (!cancelled) setData(row);
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(errorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, days]);

  const zone = data?.timezone;
  const rangeLabel = data
    ? `${fmtDay(data.from, zone)} – ${fmtDay(data.to, zone)}`
    : `Last ${days} days`;

  const everythingZero =
    !!data &&
    data.conversations === 0 &&
    data.bookingsByAi === 0 &&
    data.bookingsManual === 0 &&
    data.remindersSent === 0 &&
    data.customerConfirmations === 0 &&
    data.cancellations === 0 &&
    data.reschedules === 0 &&
    data.handoffs === 0;

  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Analytics"
        description={`Counted from stored rows — nothing here is estimated. ${rangeLabel}`}
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {loading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton key={index} className="h-[7.5rem] w-full rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      ) : data ? (
        <div className="animate-fade-in-up space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={MessagesSquare}
              tone="brand"
              label="Conversations handled"
              value={fmtInt(data.conversations)}
              sub={`${fmtInt(data.aiReplies)} AI replies`}
            />
            <Stat
              icon={CalendarCheck2}
              tone="success"
              label="Bookings made by the AI"
              value={fmtInt(data.bookingsByAi)}
              sub={`of which ${fmtInt(data.bookingsManual)} manual`}
              pill={data.bookingsByAi + data.bookingsManual > 0 ? `${fmtInt(data.bookingsByAi + data.bookingsManual)} total` : undefined}
              pillVariant="muted"
            />
            <Stat icon={BellRing} tone="info" label="Reminders sent" value={fmtInt(data.remindersSent)} sub="delivered on WhatsApp" />
            <Stat
              icon={CheckCheck}
              tone="success"
              label="Customer confirmations"
              value={fmtInt(data.customerConfirmations)}
              sub="replies that confirmed a booking"
            />
            <Stat
              icon={CalendarX2}
              tone="warning"
              label="Cancellations"
              value={fmtInt(data.cancellations)}
              sub={`${fmtInt(data.reschedules)} reschedules`}
            />
            <Stat
              icon={UserRoundCog}
              tone="muted"
              label="Handoff rate"
              value={data.handoffRate === null ? "—" : `${Math.round(data.handoffRate * 100)}%`}
              sub={data.handoffRate === null ? "No conversations yet" : `${fmtInt(data.handoffs)} handed to a human`}
            />
            <Stat
              icon={Timer}
              tone="brand"
              label="Median first response"
              value={formatDuration(data.medianFirstResponseMs)}
              sub={data.medianFirstResponseMs === null ? "No AI replies yet" : "customer message → AI reply"}
            />
          </div>

          <Card>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border/70 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Trend</p>
                <h2 className="text-base font-bold tracking-tight">Conversations and bookings per day</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Same scale — both are a count per day{zone ? ` in ${zone}` : ""}.
                </p>
              </div>
              <div className="ml-auto inline-flex items-center gap-1 rounded-xl bg-muted/70 p-1">
                {RANGES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDays(option)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums transition-all duration-150",
                      days === option
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option} days
                  </button>
                ))}
              </div>
            </div>
            <CardContent className="p-5">
              {everythingZero ? (
                <div className="px-6 py-12 text-center">
                  <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <MessageSquare className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-bold">Nothing has happened in this window yet.</p>
                  <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
                    Rather than draw a flat line, here is the honest version: no conversations, no bookings. Try the
                    demo chat to see the receptionist take a booking end to end — it shows up here straight away.
                  </p>
                  <Button asChild className="mt-5">
                    <Link href={`/o/${orgId}/demo`}>
                      <MessageSquare className="h-4 w-4" />
                      Open the demo chat
                    </Link>
                  </Button>
                </div>
              ) : data.series.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No daily rows for this range.</p>
              ) : (
                <SeriesChart points={data.series} />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-muted/25 shadow-none">
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  <Info className="h-4 w-4" />
                </span>
                <h2 className="text-sm font-bold tracking-tight">How these are counted</h2>
              </div>
              <dl className="grid gap-x-8 gap-y-2.5 text-[13px] sm:grid-cols-2">
                <Note term="Conversations handled">conversations that started inside the range, on any channel.</Note>
                <Note term="Bookings made by the AI">
                  bookings created in the range whose source is the agent; the secondary line is the ones your team
                  entered by hand.
                </Note>
                <Note term="Reminders sent">
                  scheduled messages actually delivered — confirmations, 24 h and 2 h reminders, follow-ups.
                </Note>
                <Note term="Customer confirmations">
                  replies from a customer confirming a booking, which stamp it as confirmed.
                </Note>
                <Note term="Cancellations">bookings cancelled in the range; a move to a new time counts as a reschedule instead.</Note>
                <Note term="Handoff rate">
                  conversations started in the range that were handed to a human at least once, over all conversations
                  in the range.
                </Note>
                <Note term="Median first response">
                  time from a customer&apos;s first message to the AI&apos;s reply to it, across every conversation in
                  the range.
                </Note>
                <Note term="Chart">
                  each day counts the conversations that started and the bookings that were created that day,
                  cancelled ones excluded.
                </Note>
                {data.guardrailBlocks !== undefined ? (
                  <Note term="Guardrails">
                    {fmtInt(data.guardrailBlocks)} replies blocked before sending, {fmtInt(data.modelErrors ?? 0)} model
                    errors.
                  </Note>
                ) : null}
              </dl>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  pill,
  pillVariant = "muted",
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  label: string;
  value: string;
  sub?: string;
  pill?: string;
  pillVariant?: "muted" | "brand" | "success" | "warning" | "info";
}) {
  return (
    <div className="stat-tile transition-shadow duration-150 hover:shadow-card-hover">
      <div className="flex items-start gap-2">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TONE_CLASS[tone])}>
          <Icon className="h-4 w-4" />
        </span>
        {pill ? (
          <Badge variant={pillVariant} className="ml-auto">
            {pill}
          </Badge>
        ) : null}
      </div>
      <p className="mt-3 text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[28px] font-bold leading-none tracking-tight tabular-nums">{value}</p>
      {sub ? <p className="mt-1.5 text-[12px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function Note({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="inline font-semibold">{term}: </dt>
      <dd className="inline text-muted-foreground">{children}</dd>
    </div>
  );
}

function fmtInt(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function fmtDay(iso: string, zone?: string): string {
  const dt = DateTime.fromISO(iso, zone ? { zone } : undefined);
  return dt.isValid ? dt.toFormat("d LLL yyyy") : iso;
}

/** "620 ms" is noise for a receptionist; seconds and minutes are what people read. */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  return `${Math.round(ms / 60_000)} min`;
}
