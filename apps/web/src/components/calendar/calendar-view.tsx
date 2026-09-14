"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { Ban, CalendarDays, Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { api, errorMessage, query } from "@/lib/api";
import type { Booking, Org, Provider, Service } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockTimeDialog, BlockedTimePopover } from "./block-time-dialog";
import { BookingDialog } from "./booking-dialog";
import { NewBookingDialog } from "./new-booking-dialog";
import {
  apiWeekday,
  bookingTitle,
  gridBounds,
  hoursForWeekday,
  label24,
  layoutOverlaps,
  minuteOfDay,
  providerColor,
  startOfWeek,
  withAlpha,
  zoned,
  type BlockedTimeRow,
  type CalendarView as ViewMode,
} from "./shared";

/** Pixel height of one 30-minute row. */
const ROW_HEIGHT = 30;
const ALL = "all";

interface Column {
  key: string;
  /** Heading, e.g. "Mon" or a provider name. */
  title: string;
  subtitle?: string;
  /** Day of the month, shown big under the weekday in week view. */
  dayNumber?: string;
  /** The calendar day this column covers, in the org timezone. */
  day: DateTime;
  /** null in week view (all providers merged into the day column). */
  providerId: string | null;
  today: boolean;
}

export function CalendarView({ orgId }: { orgId: string }) {
  const [org, setOrg] = React.useState<Org | null>(null);
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [services, setServices] = React.useState<Service[]>([]);
  const [setupError, setSetupError] = React.useState<string | null>(null);

  const [view, setView] = React.useState<ViewMode>("week");
  const [anchor, setAnchor] = React.useState<string | null>(null); // yyyy-MM-dd in the org timezone
  const [filterProviderId, setFilterProviderId] = React.useState<string>(ALL);

  const [bookings, setBookings] = React.useState<Booking[] | null>(null);
  const [blocks, setBlocks] = React.useState<BlockedTimeRow[]>([]);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [selectedBooking, setSelectedBooking] = React.useState<Booking | null>(null);
  const [selectedBlock, setSelectedBlock] = React.useState<BlockedTimeRow | null>(null);
  const [newBookingOpen, setNewBookingOpen] = React.useState(false);
  const [blockOpen, setBlockOpen] = React.useState(false);

  /** Minutes from midnight, org timezone. Null until the client ticks (no SSR mismatch). */
  const [nowMinute, setNowMinute] = React.useState<number | null>(null);

  /* Setup: org (for the timezone), providers, services ---------------------- */
  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<Org>(`/orgs/${orgId}`),
      api.get<Provider[]>(`/orgs/${orgId}/providers`),
      api.get<Service[]>(`/orgs/${orgId}/services`),
    ])
      .then(([orgRow, providerRows, serviceRows]) => {
        if (cancelled) return;
        setOrg(orgRow);
        setProviders(providerRows.filter((p) => p.active));
        setServices(serviceRows);
        setAnchor(DateTime.now().setZone(orgRow.timezone).toFormat("yyyy-MM-dd"));
        setSetupError(null);
      })
      .catch((err) => {
        if (!cancelled) setSetupError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const timezone = org?.timezone ?? "UTC";

  React.useEffect(() => {
    if (!org) return;
    const update = () => {
      const now = DateTime.now().setZone(org.timezone);
      setNowMinute(now.hour * 60 + now.minute);
    };
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, [org]);

  /* The visible range ------------------------------------------------------- */
  const range = React.useMemo(() => {
    if (!anchor || !org) return null;
    const day = DateTime.fromISO(anchor, { zone: org.timezone }).startOf("day");
    if (!day.isValid) return null;
    const from = view === "week" ? startOfWeek(day) : day;
    const to = view === "week" ? from.plus({ days: 7 }) : from.plus({ days: 1 });
    return { from, to };
  }, [anchor, org, view]);

  const rangeKey = range ? `${range.from.toISO()}|${range.to.toISO()}` : "";

  const load = React.useCallback(async () => {
    if (!range) return;
    setLoading(true);
    try {
      const params = query({
        from: range.from.toUTC().toISO() ?? undefined,
        to: range.to.toUTC().toISO() ?? undefined,
        providerId: filterProviderId === ALL ? undefined : filterProviderId,
      });
      const blockParams = query({
        from: range.from.toUTC().toISO() ?? undefined,
        to: range.to.toUTC().toISO() ?? undefined,
      });
      const [bookingRows, blockRows] = await Promise.all([
        api.get<Booking[]>(`/orgs/${orgId}/bookings${params}`),
        api.get<BlockedTimeRow[]>(`/orgs/${orgId}/blocked-times${blockParams}`),
      ]);
      setBookings(bookingRows);
      setBlocks(blockRows);
      setLoadError(null);
    } catch (err) {
      setBookings([]);
      setBlocks([]);
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, rangeKey, filterProviderId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /* Columns ----------------------------------------------------------------- */
  const shownProviders = React.useMemo(
    () => (filterProviderId === ALL ? providers : providers.filter((p) => p.id === filterProviderId)),
    [providers, filterProviderId],
  );

  const columns: Column[] = React.useMemo(() => {
    if (!range || !org) return [];
    const today = DateTime.now().setZone(org.timezone).startOf("day");
    if (view === "week") {
      return Array.from({ length: 7 }, (_, index) => {
        const day = range.from.plus({ days: index });
        return {
          key: day.toFormat("yyyy-MM-dd"),
          title: day.toFormat("ccc"),
          dayNumber: day.toFormat("d"),
          day,
          providerId: null,
          today: day.hasSame(today, "day"),
        };
      });
    }
    const day = range.from;
    if (shownProviders.length === 0) {
      return [
        {
          key: "unassigned",
          title: day.toFormat("cccc"),
          subtitle: day.toFormat("d LLL"),
          day,
          providerId: null,
          today: day.hasSame(today, "day"),
        },
      ];
    }
    return shownProviders.map((provider) => ({
      key: provider.id,
      title: provider.name,
      subtitle: provider.title ?? undefined,
      day,
      providerId: provider.id,
      today: day.hasSame(today, "day"),
    }));
  }, [range, org, view, shownProviders]);

  const bounds = React.useMemo(() => gridBounds(shownProviders), [shownProviders]);
  const totalMinutes = Math.max(60, bounds.endMinute - bounds.startMinute);
  const rows = Math.ceil(totalMinutes / 30);
  const gridHeight = rows * ROW_HEIGHT;

  const dateLabel = React.useMemo(() => {
    if (!range) return "";
    if (view === "day") return range.from.toFormat("cccc d LLLL yyyy");
    const last = range.to.minus({ days: 1 });
    const sameMonth = range.from.hasSame(last, "month");
    return sameMonth
      ? `${range.from.toFormat("d")} – ${last.toFormat("d LLLL yyyy")}`
      : `${range.from.toFormat("d LLL")} – ${last.toFormat("d LLL yyyy")}`;
  }, [range, view]);

  function shift(direction: -1 | 1) {
    if (!anchor || !org) return;
    const day = DateTime.fromISO(anchor, { zone: org.timezone });
    setAnchor(day.plus({ days: direction * (view === "week" ? 7 : 1) }).toFormat("yyyy-MM-dd"));
  }

  function goToday() {
    if (!org) return;
    setAnchor(DateTime.now().setZone(org.timezone).toFormat("yyyy-MM-dd"));
  }

  if (setupError) {
    return (
      <>
        <PageHeader eyebrow="Schedule" title="Calendar" />
        <p className="text-sm text-destructive">{setupError}</p>
      </>
    );
  }

  if (!org || !range) {
    return (
      <>
        <PageHeader eyebrow="Schedule" title="Calendar" />
        <Skeleton className="mb-3 h-16 w-full rounded-2xl" />
        <Skeleton className="h-[28rem] w-full rounded-2xl" />
      </>
    );
  }

  const hasAnything = (bookings?.length ?? 0) > 0 || blocks.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        description={`Everything the AI and your team booked, in ${org.timezone}.`}
      />

      {loadError ? <p className="mb-3 text-sm text-destructive">{loadError}</p> : null}

      <Card className="animate-fade-in-up overflow-hidden">
        {/* Toolbar ---------------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border/70 px-4 py-3.5">
          <div className="inline-flex items-center gap-1 rounded-xl bg-muted/70 p-1">
            {(["day", "week"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-sm font-semibold capitalize transition-all duration-150",
                  view === option
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option === "day" ? "Day" : "Week"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center overflow-hidden rounded-lg border border-input bg-card shadow-sm">
              <button
                type="button"
                aria-label="Previous"
                onClick={() => shift(-1)}
                className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="h-8 border-x border-input px-3 text-sm font-semibold transition-colors hover:bg-accent/60"
              >
                Today
              </button>
              <button
                type="button"
                aria-label="Next"
                onClick={() => shift(1)}
                className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <span className="text-sm font-bold tracking-tight">{dateLabel}</span>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select value={filterProviderId} onValueChange={setFilterProviderId}>
              <SelectTrigger aria-label="Filter by provider" className="h-9 w-[11.5rem] rounded-lg bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All providers</SelectItem>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setBlockOpen(true)}>
              <Ban className="h-4 w-4" />
              Block time
            </Button>
            <Button onClick={() => setNewBookingOpen(true)}>
              <Plus className="h-4 w-4" />
              New booking
            </Button>
          </div>
        </div>

        {/* Grid ------------------------------------------------------------- */}
        <CardContent className="p-0">
          {bookings === null ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[52rem]">
                {/* Column headings */}
                <div
                  className="sticky top-0 z-10 grid border-b border-border/70 bg-card"
                  style={{ gridTemplateColumns: `4.25rem repeat(${columns.length}, minmax(0, 1fr))` }}
                >
                  <div />
                  {columns.map((column) => (
                    <div
                      key={column.key}
                      className={cn(
                        "border-l border-border/60 px-2 py-2.5 text-center",
                        column.today ? "bg-primary/[0.06]" : undefined,
                      )}
                    >
                      {column.dayNumber ? (
                        <>
                          <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {column.today ? <span className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                            {column.title}
                          </div>
                          <div
                            className={cn(
                              "mt-0.5 text-lg leading-tight tracking-tight",
                              column.today ? "font-bold text-primary" : "font-semibold text-foreground",
                            )}
                          >
                            {column.dayNumber}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-center gap-1.5 text-sm font-semibold">
                            {column.providerId ? (
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ background: providerColor(column.providerId, providers) }}
                              />
                            ) : column.today ? (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            ) : null}
                            <span className="truncate">{column.title}</span>
                          </div>
                          {column.subtitle ? (
                            <div className="truncate text-[11px] text-muted-foreground">{column.subtitle}</div>
                          ) : null}
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {/* Body — the top padding keeps the first hour label off the header */}
                <div
                  className="relative grid pb-2 pt-2"
                  style={{ gridTemplateColumns: `4.25rem repeat(${columns.length}, minmax(0, 1fr))`, height: gridHeight + 16 }}
                >
                  {/* Time gutter */}
                  <div className="relative">
                    {Array.from({ length: rows }, (_, index) => {
                      const minute = bounds.startMinute + index * 30;
                      return (
                        <div
                          key={minute}
                          className="absolute left-0 right-2.5 text-right text-[11px] font-medium leading-none tabular-nums text-muted-foreground"
                          style={{ top: index * ROW_HEIGHT - 5, height: ROW_HEIGHT }}
                        >
                          {minute % 60 === 0 ? label24(minute) : ""}
                        </div>
                      );
                    })}
                  </div>

                  {columns.map((column) => (
                    <DayColumn
                      key={column.key}
                      column={column}
                      view={view}
                      providers={providers}
                      shownProviders={shownProviders}
                      bookings={bookings}
                      blocks={blocks}
                      timezone={timezone}
                      bounds={bounds}
                      rows={rows}
                      nowMinute={column.today ? nowMinute : null}
                      onSelectBooking={setSelectedBooking}
                      onSelectBlock={setSelectedBlock}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {bookings !== null && !hasAnything && !loading ? (
            <div className="border-t border-border/70 px-6 py-12 text-center">
              <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CalendarDays className="h-5 w-5" />
              </span>
              <p className="text-sm font-bold">Nothing is scheduled in this range.</p>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
                Bookings the AI takes on WhatsApp land here automatically. You can also add one yourself.
              </p>
              <Button className="mt-5" onClick={() => setNewBookingOpen(true)}>
                <Plus className="h-4 w-4" />
                New booking
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Legend ------------------------------------------------------------- */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[11px] text-muted-foreground">
        {providers.map((provider) => (
          <span key={provider.id} className="inline-flex items-center gap-1.5 font-medium">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: providerColor(provider.id, providers) }}
            />
            {provider.name}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <Check className="h-3 w-3 text-emerald-600" /> confirmed by the customer
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] border border-dashed border-foreground/50" /> no-show
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-[3px] border border-border"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(100,116,139,0.28) 0, rgba(100,116,139,0.28) 2px, transparent 2px, transparent 5px)",
            }}
          />{" "}
          blocked
        </span>
      </div>

      <BookingDialog
        orgId={orgId}
        timezone={timezone}
        booking={selectedBooking}
        providers={providers}
        services={services}
        onClose={() => setSelectedBooking(null)}
        onChanged={() => void load()}
      />
      <BlockedTimePopover
        orgId={orgId}
        timezone={timezone}
        block={selectedBlock}
        onClose={() => setSelectedBlock(null)}
        onDeleted={() => void load()}
      />
      <NewBookingDialog
        orgId={orgId}
        timezone={timezone}
        open={newBookingOpen}
        onOpenChange={setNewBookingOpen}
        providers={providers}
        services={services}
        defaultDate={range.from.toFormat("yyyy-MM-dd")}
        onCreated={() => void load()}
      />
      <BlockTimeDialog
        orgId={orgId}
        timezone={timezone}
        open={blockOpen}
        onOpenChange={setBlockOpen}
        providers={providers}
        defaultDate={range.from.toFormat("yyyy-MM-dd")}
        onCreated={() => void load()}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function DayColumn({
  column,
  view,
  providers,
  shownProviders,
  bookings,
  blocks,
  timezone,
  bounds,
  rows,
  nowMinute,
  onSelectBooking,
  onSelectBlock,
}: {
  column: Column;
  view: ViewMode;
  providers: Provider[];
  shownProviders: Provider[];
  bookings: Booking[];
  blocks: BlockedTimeRow[];
  timezone: string;
  bounds: { startMinute: number; endMinute: number };
  rows: number;
  nowMinute: number | null;
  onSelectBooking: (booking: Booking) => void;
  onSelectBlock: (block: BlockedTimeRow) => void;
}) {
  const dayStart = column.day.startOf("day");
  const dayEnd = dayStart.plus({ days: 1 });
  const total = bounds.endMinute - bounds.startMinute;

  const clip = (startIso: string, endIso: string) => {
    const start = zoned(startIso, timezone);
    const end = zoned(endIso, timezone);
    if (end <= dayStart || start >= dayEnd) return null;
    const startMinute = start < dayStart ? 0 : minuteOfDay(startIso, timezone);
    const endMinute = end > dayEnd ? 24 * 60 : minuteOfDay(endIso, timezone) || 24 * 60;
    return { startMinute, endMinute };
  };

  const providerIdsInColumn = column.providerId
    ? [column.providerId]
    : shownProviders.map((provider) => provider.id);

  const dayBookings = bookings.filter((booking) => {
    if (column.providerId && booking.provider.id !== column.providerId) return false;
    if (!column.providerId && providerIdsInColumn.length && !providerIdsInColumn.includes(booking.provider.id)) {
      return false;
    }
    return clip(booking.startAt, booking.endAt) !== null;
  });

  const positioned = layoutOverlaps(
    dayBookings.map((booking) => {
      const box = clip(booking.startAt, booking.endAt)!;
      return { item: booking, startMinute: box.startMinute, endMinute: box.endMinute };
    }),
  );

  const dayBlocks = blocks.filter((block) => {
    if (column.providerId && block.providerId && block.providerId !== column.providerId) return false;
    if (!column.providerId && block.providerId && providerIdsInColumn.length && !providerIdsInColumn.includes(block.providerId)) {
      return false;
    }
    return clip(block.startAt, block.endAt) !== null;
  });

  // Non-working shading: only meaningful when the column belongs to one provider.
  const offHours: { startMinute: number; endMinute: number }[] = [];
  if (view === "day" && column.providerId) {
    const provider = providers.find((p) => p.id === column.providerId);
    if (provider) {
      const working = hoursForWeekday(provider, apiWeekday(column.day)).sort((a, b) => a.startMinute - b.startMinute);
      let cursor = bounds.startMinute;
      for (const window of working) {
        if (window.startMinute > cursor) offHours.push({ startMinute: cursor, endMinute: Math.min(window.startMinute, bounds.endMinute) });
        cursor = Math.max(cursor, window.endMinute);
      }
      if (cursor < bounds.endMinute) offHours.push({ startMinute: cursor, endMinute: bounds.endMinute });
    }
  }

  const top = (minute: number) => ((Math.max(minute, bounds.startMinute) - bounds.startMinute) / total) * 100;
  const height = (start: number, end: number) =>
    ((Math.min(end, bounds.endMinute) - Math.max(start, bounds.startMinute)) / total) * 100;

  const showNow = nowMinute !== null && nowMinute >= bounds.startMinute && nowMinute <= bounds.endMinute;

  return (
    <div className={cn("relative border-l border-border/60", column.today ? "bg-primary/[0.03]" : undefined)}>
      {/* Half-hour rules */}
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className={cn(
            "absolute inset-x-0 border-t",
            (bounds.startMinute + index * 30) % 60 === 0 ? "border-border/70" : "border-border/35",
          )}
          style={{ top: index * ROW_HEIGHT }}
        />
      ))}

      {offHours.map((window, index) =>
        window.endMinute > window.startMinute ? (
          <div
            key={`off-${index}`}
            className="absolute inset-x-0 bg-muted/40"
            style={{ top: `${top(window.startMinute)}%`, height: `${height(window.startMinute, window.endMinute)}%` }}
            aria-hidden="true"
          />
        ) : null,
      )}

      {dayBlocks.map((block) => {
        const box = clip(block.startAt, block.endAt)!;
        if (box.endMinute <= bounds.startMinute || box.startMinute >= bounds.endMinute) return null;
        return (
          <button
            key={`${block.id}-${column.key}`}
            type="button"
            onClick={() => onSelectBlock(block)}
            title={`${block.reason ?? "Blocked"} — ${block.provider?.name ?? "whole business"}`}
            className="absolute inset-x-1 overflow-hidden rounded-md border border-border text-left text-[10px] font-medium leading-tight text-muted-foreground transition-shadow hover:shadow-sm"
            style={{
              top: `${top(box.startMinute)}%`,
              height: `${height(box.startMinute, box.endMinute)}%`,
              backgroundColor: "hsl(var(--card))",
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(100,116,139,0.16) 0, rgba(100,116,139,0.16) 4px, transparent 4px, transparent 9px)",
            }}
          >
            <span className="block truncate px-1.5 pt-1">{block.reason ?? "Blocked"}</span>
          </button>
        );
      })}

      {positioned.map((entry) => {
        const booking = entry.item;
        if (entry.endMinute <= bounds.startMinute || entry.startMinute >= bounds.endMinute) return null;
        const color = providerColor(booking.provider.id, providers);
        const cancelled = booking.status === "CANCELLED";
        const noShow = booking.status === "NO_SHOW";
        const widthPct = 100 / entry.lanes;
        return (
          <button
            key={booking.id}
            type="button"
            onClick={() => onSelectBooking(booking)}
            title={`${bookingTitle(booking)} · ${booking.service.name} · ${booking.provider.name}`}
            className={cn(
              "absolute overflow-hidden px-1.5 py-1 text-left leading-tight transition-all duration-150 hover:z-20 hover:shadow-card-hover",
              cancelled ? "opacity-70" : undefined,
              noShow ? "border border-dashed" : "border-y border-r border-transparent",
            )}
            style={{
              top: `${top(entry.startMinute)}%`,
              height: `${height(entry.startMinute, entry.endMinute)}%`,
              left: `calc(${entry.lane * widthPct}% + 2px)`,
              width: `calc(${widthPct}% - 4px)`,
              borderRadius: 8,
              borderLeftWidth: 3,
              borderLeftStyle: "solid",
              borderLeftColor: cancelled ? "hsl(var(--muted-foreground))" : color,
              ...(noShow ? { borderTopColor: color, borderRightColor: color, borderBottomColor: color } : {}),
              // A solid card ground under the tint so hatched blocks never bleed through.
              backgroundColor: "hsl(var(--card))",
              backgroundImage: cancelled
                ? "linear-gradient(hsl(var(--muted)), hsl(var(--muted)))"
                : `linear-gradient(${withAlpha(color, 0.1)}, ${withAlpha(color, 0.1)})`,
              color: "hsl(var(--foreground))",
            }}
          >
            <span
              className={cn(
                "flex items-center gap-1 text-[12px] font-bold",
                cancelled ? "text-muted-foreground line-through" : undefined,
              )}
            >
              {booking.confirmedByCustomerAt ? (
                <Check className="h-3 w-3 shrink-0 text-emerald-600" aria-label="Confirmed" />
              ) : null}
              <span className="truncate">{bookingTitle(booking)}</span>
            </span>
            <span
              className={cn(
                "block truncate text-[11px] text-muted-foreground",
                cancelled ? "line-through" : undefined,
              )}
            >
              {booking.service.name}
            </span>
          </button>
        );
      })}

      {showNow ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-10"
          style={{ top: `${top(nowMinute as number)}%` }}
          aria-hidden="true"
        >
          <div className="relative h-px bg-primary">
            <span className="absolute -left-[3px] -top-[3px] h-1.5 w-1.5 rounded-full bg-primary" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
