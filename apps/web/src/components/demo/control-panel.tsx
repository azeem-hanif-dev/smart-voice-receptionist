"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  CalendarCheck,
  Cpu,
  ExternalLink,
  Lightbulb,
  RotateCcw,
  UserRound,
} from "lucide-react";
import type { Booking, ConversationStatus, Me } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isUpcoming, titleCase, zonedDateTime } from "./lib";

export type ReminderKind = "REMINDER_24H" | "REMINDER_2H";

/** Section wrapper: 32px tinted icon square + an uppercase eyebrow. */
function Section({
  icon,
  eyebrow,
  children,
  className,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border/70 bg-card p-5 shadow-card", className)}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {eyebrow}
        </h3>
      </div>
      {children}
    </section>
  );
}

export function ControlPanel({
  orgId,
  me,
  phone,
  onPhoneChange,
  displayName,
  onDisplayNameChange,
  samples,
  onSample,
  status,
  conversationId,
  bookings,
  timezone,
  busy,
  onReset,
  onSendReminder,
}: {
  orgId: string;
  me: Me | null;
  phone: string;
  onPhoneChange: (value: string) => void;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  samples: string[];
  onSample: (text: string) => void;
  status: ConversationStatus | null;
  conversationId: string | null;
  bookings: Booking[];
  timezone: string | null;
  busy: boolean;
  onReset: () => void;
  onSendReminder: (bookingId: string, kind: ReminderKind) => void;
}) {
  const inboxHref = conversationId
    ? `/o/${orgId}/inbox?c=${conversationId}`
    : `/o/${orgId}/inbox`;

  return (
    <div className="animate-fade-in-up space-y-3">
      <Section icon={<UserRound className="h-4 w-4" />} eyebrow="Customer">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="demo-phone" className="text-xs">
              Phone
            </Label>
            <Input
              id="demo-phone"
              value={phone}
              onChange={(event) => onPhoneChange(event.target.value)}
              placeholder="+1 555 010 2000"
              className="h-9 tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="demo-name" className="text-xs">
              Display name
            </Label>
            <Input
              id="demo-name"
              value={displayName}
              onChange={(event) => onDisplayNameChange(event.target.value)}
              placeholder="Demo Customer"
              className="h-9"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
          <Button variant="soft" size="sm" onClick={onReset} disabled={busy}>
            <RotateCcw className="h-4 w-4" />
            Reset conversation
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={inboxHref}>
              Open in Inbox
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Section>

      {samples.length > 0 ? (
        <Section icon={<Lightbulb className="h-4 w-4" />} eyebrow="Try saying">
          <div className="flex flex-wrap gap-2">
            {samples.map((sample) => (
              <button
                key={sample}
                type="button"
                disabled={busy}
                onClick={() => onSample(sample)}
                className="rounded-full bg-accent/60 px-3 py-1.5 text-xs font-medium text-accent-foreground ring-1 ring-inset ring-primary/10 transition-all hover:bg-primary/10 hover:shadow-sm disabled:opacity-50"
              >
                {sample}
              </button>
            ))}
          </div>
        </Section>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Section icon={<Cpu className="h-4 w-4" />} eyebrow="Model">
          {me ? (
            me.modelMode === "demo" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Demo model
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Claude {me.model}
              </span>
            )
          ) : (
            <span className="text-xs text-muted-foreground">…</span>
          )}
          {me?.modelMode === "demo" ? (
            <p className="mt-2 text-xs leading-snug text-muted-foreground">
              Deterministic demo. Set ANTHROPIC_API_KEY for Claude.
            </p>
          ) : null}
        </Section>

        <Section icon={<Activity className="h-4 w-4" />} eyebrow="Status">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
              status === "HUMAN" && "bg-amber-50 text-amber-800 ring-amber-600/20",
              status === "AI" && "bg-primary/10 text-primary ring-primary/15",
              status === "CLOSED" && "bg-muted text-muted-foreground ring-border/70",
              !status && "bg-muted text-muted-foreground ring-border/70",
            )}
          >
            {status === "HUMAN" ? "Human" : status === "AI" ? "AI" : status ? "Closed" : "No conversation"}
          </span>
          {status === "HUMAN" ? (
            <p className="mt-2 text-xs leading-snug text-amber-700">
              A team member has taken over. Reply from the{" "}
              <Link href={inboxHref} className="font-semibold underline underline-offset-2">
                Inbox
              </Link>
              .
            </p>
          ) : null}
        </Section>
      </div>

      <Section icon={<CalendarCheck className="h-4 w-4" />} eyebrow="Bookings made in this chat">
        {bookings.length === 0 ? (
          <div className="flex items-start gap-3 rounded-xl bg-muted/40 px-3.5 py-3">
            <span className="mt-0.5 text-muted-foreground/70">
              <CalendarCheck className="h-4 w-4" />
            </span>
            <p className="text-xs leading-snug text-muted-foreground">
              None yet. Book an appointment in the chat and it shows up here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {bookings.map((booking) => {
              const canRemind = booking.status === "CONFIRMED" && isUpcoming(booking.startAt);
              return (
                <li
                  key={booking.id}
                  className="rounded-xl border border-border/70 bg-card p-3.5 transition-shadow hover:shadow-card"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CalendarCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold tracking-tight">{booking.service.name}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-4 tracking-wide ring-1 ring-inset",
                            booking.status === "CONFIRMED"
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/15"
                              : booking.status === "CANCELLED"
                                ? "bg-red-50 text-red-700 ring-red-600/15"
                                : "bg-muted text-muted-foreground ring-border/70",
                          )}
                        >
                          {titleCase(booking.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-medium tabular-nums text-foreground/80">
                        {zonedDateTime(booking.startAt, timezone)}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: booking.provider.color ?? "#94a3b8" }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{booking.provider.name}</span>
                      </div>
                      {canRemind ? (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="soft"
                            disabled={busy}
                            onClick={() => onSendReminder(booking.id, "REMINDER_24H")}
                          >
                            Send 24h reminder now
                          </Button>
                          <Button
                            size="sm"
                            variant="soft"
                            disabled={busy}
                            onClick={() => onSendReminder(booking.id, "REMINDER_2H")}
                          >
                            Send 2h reminder now
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
