"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, ExternalLink, MessageSquare, UserX, X } from "lucide-react";
import { api, errorMessage, query } from "@/lib/api";
import type { AvailabilityResponse, Booking, Provider, ScheduledMessage, Service, Slot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { STATUS_LABEL, isSlotTaken, postJson, providerColor, statusBadgeVariant, zoned } from "./shared";

type Mode = "details" | "reschedule" | "cancel";

export function BookingDialog({
  orgId,
  timezone,
  booking,
  providers,
  services,
  onClose,
  onChanged,
}: {
  orgId: string;
  timezone: string;
  booking: Booking | null;
  providers: Provider[];
  services: Service[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = React.useState<Mode>("details");
  const [reminders, setReminders] = React.useState<ScheduledMessage[] | null>(null);
  const [remindersError, setRemindersError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Reschedule state
  const [newDate, setNewDate] = React.useState("");
  const [newProviderId, setNewProviderId] = React.useState("any");
  const [slots, setSlots] = React.useState<Slot[] | null>(null);
  const [slotsError, setSlotsError] = React.useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = React.useState(false);

  // Cancel state
  const [cancelReason, setCancelReason] = React.useState("");

  const bookingId = booking?.id ?? null;

  React.useEffect(() => {
    setMode("details");
    setCancelReason("");
    setSlots(null);
    setSlotsError(null);
    if (booking) {
      setNewDate(zoned(booking.startAt, timezone).toFormat("yyyy-MM-dd"));
      setNewProviderId(booking.provider.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, timezone]);

  React.useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    setReminders(null);
    setRemindersError(null);
    api
      .get<ScheduledMessage[]>(`/orgs/${orgId}/scheduled-messages${query({ bookingId })}`)
      .then((rows) => {
        if (!cancelled) setReminders(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setReminders([]);
          setRemindersError(errorMessage(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, bookingId]);

  const service = booking ? services.find((s) => s.id === booking.service.id) : undefined;
  const rescheduleProviders = React.useMemo(() => {
    if (!service) return providers;
    const allowed = new Set(service.providerIds ?? []);
    const filtered = providers.filter((p) => allowed.has(p.id));
    return filtered.length ? filtered : providers;
  }, [providers, service]);

  async function loadSlots() {
    if (!booking || !newDate) return;
    setLoadingSlots(true);
    setSlotsError(null);
    try {
      const res = await api.get<AvailabilityResponse>(
        `/orgs/${orgId}/availability${query({
          serviceId: booking.service.id,
          providerId: newProviderId === "any" ? undefined : newProviderId,
          fromDate: newDate,
          toDate: newDate,
        })}`,
      );
      setSlots(res.slots ?? []);
    } catch (err) {
      setSlots([]);
      setSlotsError(errorMessage(err));
    } finally {
      setLoadingSlots(false);
    }
  }

  async function applyReschedule(slot: Slot) {
    if (!booking) return;
    setBusy(true);
    try {
      await api.patch<Booking>(`/orgs/${orgId}/bookings/${booking.id}`, {
        startAt: slot.start,
        providerId: slot.providerId,
      });
      toast({ title: "Booking moved", description: slot.label ?? zoned(slot.start, timezone).toFormat("ccc d LLL, HH:mm") });
      onChanged();
      onClose();
    } catch (err) {
      toast({ title: "Could not reschedule", description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "COMPLETED" | "NO_SHOW") {
    if (!booking) return;
    setBusy(true);
    try {
      await api.patch<Booking>(`/orgs/${orgId}/bookings/${booking.id}`, { status });
      toast({ title: status === "COMPLETED" ? "Marked completed" : "Marked no-show" });
      onChanged();
      onClose();
    } catch (err) {
      toast({ title: "Could not update the booking", description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function cancelBooking() {
    if (!booking) return;
    setBusy(true);
    const res = await postJson<Booking>(`/orgs/${orgId}/bookings/${booking.id}/cancel`, {
      reason: cancelReason.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      toast({
        title: "Could not cancel",
        description: isSlotTaken(res.payload) ? (res.payload.message ?? res.message) : res.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Booking cancelled" });
    onChanged();
    onClose();
  }

  const open = booking !== null;
  const closed = booking ? booking.status === "CANCELLED" || booking.status === "COMPLETED" : false;
  const color = booking ? providerColor(booking.provider.id, providers) : "#64748b";

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {booking ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                <span className="truncate">{booking.service.name}</span>
                <span className="text-muted-foreground/60">·</span>
                <span className="truncate normal-case tracking-normal">{booking.provider.name}</span>
              </div>
              <DialogTitle className="flex flex-wrap items-center gap-2 pt-1">
                {booking.contact.name?.trim() || booking.contact.phoneE164}
                <Badge variant={statusBadgeVariant(booking.status)}>
                  {STATUS_LABEL[booking.status] ?? booking.status}
                </Badge>
                <Badge variant="muted">{booking.source === "AI" ? "Booked by AI" : "Booked manually"}</Badge>
              </DialogTitle>
              <DialogDescription>
                {zoned(booking.startAt, timezone).toFormat("cccc d LLLL yyyy, HH:mm")} –{" "}
                {zoned(booking.endAt, timezone).toFormat("HH:mm")} ({timezone})
              </DialogDescription>
            </DialogHeader>

            {mode === "details" ? (
              <div className="space-y-5 text-sm">
                <dl className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-2.5 rounded-xl border border-border/70 bg-muted/30 p-4">
                  <Detail label="Phone" value={booking.contact.phoneE164} />
                  <Detail label="Service" value={`${booking.service.name} · ${booking.service.durationMinutes} min`} />
                  <Detail label="Provider" value={booking.provider.name} />
                  {booking.confirmedByCustomerAt ? (
                    <Detail
                      label="Confirmed"
                      value={`by the customer ${zoned(booking.confirmedByCustomerAt, timezone).toFormat("d LLL, HH:mm")}`}
                    />
                  ) : null}
                  {booking.notes ? <Detail label="Notes" value={booking.notes} /> : null}
                  {booking.cancelReason ? <Detail label="Cancel reason" value={booking.cancelReason} /> : null}
                  <Detail label="Created" value={zoned(booking.createdAt, timezone).toFormat("d LLL yyyy, HH:mm")} />
                </dl>

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Reminders
                  </p>
                  {reminders === null ? (
                    <Skeleton className="h-12 w-full" />
                  ) : remindersError ? (
                    <p className="text-sm text-destructive">{remindersError}</p>
                  ) : reminders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No reminders scheduled for this booking.</p>
                  ) : (
                    <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
                      {reminders.map((reminder) => (
                        <li key={reminder.id} className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="truncate text-sm font-medium">{reminderLabel(reminder.kind)}</span>
                          <span className="flex shrink-0 items-center gap-2 text-[12px] text-muted-foreground">
                            {zoned(reminder.runAt, timezone).toFormat("d LLL, HH:mm")}
                            <Badge
                              variant={
                                reminder.status === "SENT"
                                  ? "success"
                                  : reminder.status === "FAILED"
                                    ? "destructive"
                                    : "muted"
                              }
                            >
                              {reminder.status.toLowerCase()}
                            </Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {booking.conversationId ? (
                  <Link
                    href={`/o/${orgId}/inbox?c=${booking.conversationId}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Open conversation
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  <p className="text-xs text-muted-foreground">No WhatsApp conversation is linked to this booking.</p>
                )}
              </div>
            ) : null}

            {mode === "reschedule" ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="reschedule-date">New date</Label>
                    <Input
                      id="reschedule-date"
                      type="date"
                      value={newDate}
                      onChange={(event) => {
                        setNewDate(event.target.value);
                        setSlots(null);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reschedule-provider">Provider</Label>
                    <Select
                      value={newProviderId}
                      onValueChange={(value) => {
                        setNewProviderId(value);
                        setSlots(null);
                      }}
                    >
                      <SelectTrigger id="reschedule-provider" className="h-10 rounded-lg bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any provider</SelectItem>
                        {rescheduleProviders.map((provider) => (
                          <SelectItem key={provider.id} value={provider.id}>
                            {provider.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button variant="soft" onClick={() => void loadSlots()} disabled={!newDate || loadingSlots}>
                  {loadingSlots ? "Loading slots..." : "Find slots"}
                </Button>

                {slotsError ? <p className="text-sm text-destructive">{slotsError}</p> : null}

                {slots !== null ? (
                  slots.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                      Nothing free on that day for this service. Try another date or provider.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {slots.map((slot) => (
                        <SlotChip
                          key={`${slot.start}-${slot.providerId}`}
                          time={zoned(slot.start, timezone).toFormat("HH:mm")}
                          hint={slot.providerName ?? undefined}
                          disabled={busy}
                          onClick={() => void applyReschedule(slot)}
                        />
                      ))}
                    </div>
                  )
                ) : null}
              </div>
            ) : null}

            {mode === "cancel" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  The customer is notified on WhatsApp when a booking is cancelled.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="cancel-reason">Reason (optional)</Label>
                  <Input
                    id="cancel-reason"
                    value={cancelReason}
                    placeholder="Provider is off sick"
                    onChange={(event) => setCancelReason(event.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <DialogFooter className="flex-wrap gap-2 border-t border-border/70 pt-4">
              {mode === "details" ? (
                <>
                  {!closed ? (
                    <>
                      <Button size="sm" onClick={() => setMode("reschedule")}>
                        <CalendarClock className="h-4 w-4" />
                        Reschedule
                      </Button>
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => void setStatus("COMPLETED")}>
                        <CheckCircle2 className="h-4 w-4" />
                        Mark completed
                      </Button>
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => void setStatus("NO_SHOW")}>
                        <UserX className="h-4 w-4" />
                        No-show
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setMode("cancel")}
                      >
                        <X className="h-4 w-4" />
                        Cancel booking
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      This booking is {STATUS_LABEL[booking.status]?.toLowerCase()} — no further actions.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setMode("details")} disabled={busy}>
                    Back
                  </Button>
                  {mode === "cancel" ? (
                    <Button variant="destructive" size="sm" onClick={() => void cancelBooking()} disabled={busy}>
                      {busy ? "Cancelling..." : "Confirm cancellation"}
                    </Button>
                  ) : null}
                </>
              )}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** A time slot rendered as a chip; teal when it is the one that was picked. */
export function SlotChip({
  time,
  hint,
  selected,
  disabled,
  onClick,
}: {
  time: string;
  hint?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={hint}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold tabular-nums transition-all duration-150 disabled:pointer-events-none disabled:opacity-50",
        selected
          ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/25"
          : "border-input bg-card text-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary",
      )}
    >
      {time}
      {hint ? (
        <span className={cn("text-[11px] font-medium", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {hint}
        </span>
      ) : null}
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[12px] font-medium text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-medium">{value}</dd>
    </>
  );
}

function reminderLabel(kind: string): string {
  switch (kind) {
    case "CONFIRMATION":
      return "Confirmation";
    case "REMINDER_24H":
      return "Reminder — 24 h before";
    case "REMINDER_2H":
      return "Reminder — 2 h before";
    case "NO_SHOW_FOLLOWUP":
      return "No-show follow-up";
    case "REBOOK_NUDGE":
      return "Rebook nudge";
    case "REENGAGE":
      return "Re-engagement";
    default:
      return kind;
  }
}
