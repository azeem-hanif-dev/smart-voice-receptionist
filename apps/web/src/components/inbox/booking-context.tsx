"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, CalendarX2, ExternalLink, History, Sparkles, X } from "lucide-react";
import type { Booking, ContactMemory, ConversationDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { bookingStatusClass, isUpcoming, prettyPhone, titleCase, zonedDateTime } from "./lib";

export function BookingContext({
  orgId,
  detail,
  timezone,
  onClose,
}: {
  orgId: string;
  detail: ConversationDetail;
  timezone: string | null;
  onClose?: () => void;
}) {
  const { contact, bookings } = detail;

  const upcoming = bookings
    .filter((booking) => isUpcoming(booking.startAt))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const past = bookings
    .filter((booking) => !isUpcoming(booking.startAt))
    .sort((a, b) => b.startAt.localeCompare(a.startAt));

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/30">
      <header className="flex items-center justify-between gap-2 border-b border-border/70 bg-card px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Context
          </p>
          <h2 className="text-sm font-semibold tracking-tight">Bookings &amp; memory</h2>
        </div>
        {onClose ? (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close booking context">
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <Section icon={<CalendarClock className="h-4 w-4" />} title="Upcoming" count={upcoming.length}>
          {upcoming.length === 0 ? (
            <EmptyLine icon={<CalendarX2 className="h-4 w-4" />} text="No upcoming appointments." />
          ) : (
            <div className="space-y-2">
              {upcoming.map((booking) => (
                <BookingRow key={booking.id} booking={booking} timezone={timezone} />
              ))}
            </div>
          )}
        </Section>

        {past.length > 0 ? (
          <Section icon={<History className="h-4 w-4" />} title="Past" count={past.length}>
            <div className="space-y-2">
              {past.map((booking) => (
                <BookingRow key={booking.id} booking={booking} timezone={timezone} muted />
              ))}
            </div>
          </Section>
        ) : null}

        <Section icon={<Sparkles className="h-4 w-4" />} title="Memory">
          <MemoryList
            name={contact.name}
            phone={contact.phoneE164}
            language={contact.language}
            memory={contact.memory}
          />
          <Link
            href={`/o/${orgId}/contacts/${contact.id}`}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
          >
            Open contact
            <ExternalLink className="h-3 w-3" />
          </Link>
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <h3 className="flex-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h3>
        {typeof count === "number" && count > 0 ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function EmptyLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
      <span className="text-muted-foreground/70">{icon}</span>
      {text}
    </p>
  );
}

function BookingRow({
  booking,
  timezone,
  muted,
}: {
  booking: Booking;
  timezone: string | null;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-card p-3 text-sm transition-shadow hover:shadow-card",
        muted && "bg-muted/30",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-semibold tracking-tight">{booking.service.name}</span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-4 tracking-wide",
            bookingStatusClass(booking.status),
          )}
        >
          {titleCase(booking.status)}
        </span>
      </div>
      <p className="mt-1.5 text-xs font-medium tabular-nums text-foreground/80">
        {zonedDateTime(booking.startAt, timezone)}
      </p>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full ring-2 ring-inset ring-white/40"
          style={{ backgroundColor: booking.provider.color ?? "#94a3b8" }}
          aria-hidden="true"
        />
        <span className="truncate">{booking.provider.name}</span>
      </div>
      {booking.notes ? (
        <p className="mt-2 rounded-lg bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">{booking.notes}</p>
      ) : null}
    </div>
  );
}

function MemoryList({
  name,
  phone,
  language,
  memory,
}: {
  name: string | null;
  phone: string;
  language: string | null;
  memory: ContactMemory | null | undefined;
}) {
  const rows: { label: string; value: string }[] = [];
  rows.push({ label: "Name", value: name?.trim() || memory?.name || "—" });
  rows.push({ label: "Phone", value: prettyPhone(phone) });
  const lang = language || memory?.language;
  if (lang) rows.push({ label: "Language", value: lang });
  if (memory?.preferredProviderName) {
    rows.push({ label: "Prefers", value: memory.preferredProviderName });
  }
  if (memory?.preferences?.length) {
    rows.push({ label: "Preferences", value: memory.preferences.join(", ") });
  }
  if (memory?.notes?.length) {
    rows.push({ label: "Notes", value: memory.notes.join(" · ") });
  }
  if (memory?.lastBookingSummary) {
    rows.push({ label: "Last visit", value: memory.lastBookingSummary });
  }
  const qualification = Object.entries(memory?.qualification ?? {}).filter(([, value]) => Boolean(value));
  if (memory?.isReturning && !qualification.some(([key]) => key === "returning")) rows.push({ label: "Visited before", value: "Yes" });
  for (const [key, value] of qualification) rows.push({ label: titleCase(key), value: String(value) });

  return (
    <dl className="divide-y divide-border/60">
      {rows.map((row) => (
        <div key={`${row.label}-${row.value}`} className="flex gap-3 py-1.5 first:pt-0 last:pb-0">
          <dt className="w-20 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {row.label}
          </dt>
          <dd className="min-w-0 flex-1 break-words text-xs text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
