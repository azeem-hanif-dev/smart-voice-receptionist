"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { Search } from "lucide-react";
import { api, errorMessage, query } from "@/lib/api";
import type { AvailabilityResponse, Booking, Contact, Provider, Service, Slot } from "@/lib/types";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { SlotChip } from "./booking-dialog";
import { isSlotTaken, postJson, zoned, type SlotTakenBody } from "./shared";

type ContactMode = "existing" | "new";

function slotKey(slot: { start: string; providerId: string }): string {
  return `${slot.start}-${slot.providerId}`;
}

export function NewBookingDialog({
  orgId,
  timezone,
  open,
  onOpenChange,
  providers,
  services,
  defaultDate,
  onCreated,
}: {
  orgId: string;
  timezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: Provider[];
  services: Service[];
  defaultDate: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();

  const [contactMode, setContactMode] = React.useState<ContactMode>("existing");
  const [search, setSearch] = React.useState("");
  const [results, setResults] = React.useState<Contact[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [contact, setContact] = React.useState<Contact | null>(null);
  const [newPhone, setNewPhone] = React.useState("");
  const [newName, setNewName] = React.useState("");

  const [serviceId, setServiceId] = React.useState("");
  const [providerId, setProviderId] = React.useState("any");
  const [fromDate, setFromDate] = React.useState(defaultDate);
  const [days, setDays] = React.useState("3");
  const [notes, setNotes] = React.useState("");

  const [slots, setSlots] = React.useState<Slot[] | null>(null);
  const [slotsError, setSlotsError] = React.useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = React.useState(false);
  const [alternatives, setAlternatives] = React.useState<SlotTakenBody["alternatives"] | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [chosen, setChosen] = React.useState<string | null>(null);

  const bookableServices = React.useMemo(() => services.filter((s) => s.active), [services]);

  React.useEffect(() => {
    if (!open) return;
    setContactMode("existing");
    setSearch("");
    setResults(null);
    setContact(null);
    setNewPhone("");
    setNewName("");
    setServiceId(bookableServices[0]?.id ?? "");
    setProviderId("any");
    setFromDate(defaultDate);
    setDays("3");
    setNotes("");
    setSlots(null);
    setSlotsError(null);
    setAlternatives(null);
    setChosen(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDate]);

  const service = bookableServices.find((s) => s.id === serviceId);
  const eligibleProviders = React.useMemo(() => {
    if (!service) return [];
    const allowed = new Set(service.providerIds ?? []);
    return providers.filter((p) => allowed.has(p.id));
  }, [providers, service]);

  React.useEffect(() => {
    if (providerId !== "any" && !eligibleProviders.some((p) => p.id === providerId)) setProviderId("any");
  }, [eligibleProviders, providerId]);

  async function runSearch() {
    setSearching(true);
    try {
      const rows = await api.get<Contact[]>(`/orgs/${orgId}/contacts${query({ q: search.trim() })}`);
      setResults(rows.slice(0, 25));
    } catch (err) {
      setResults([]);
      toast({ title: "Could not search contacts", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }

  async function loadSlots() {
    if (!serviceId || !fromDate) return;
    setLoadingSlots(true);
    setSlotsError(null);
    setAlternatives(null);
    const span = Math.max(1, Math.min(14, Number(days) || 1));
    const toDate = DateTime.fromISO(fromDate).plus({ days: span - 1 }).toFormat("yyyy-MM-dd");
    try {
      const res = await api.get<AvailabilityResponse>(
        `/orgs/${orgId}/availability${query({
          serviceId,
          providerId: providerId === "any" ? undefined : providerId,
          fromDate,
          toDate,
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

  const grouped = React.useMemo(() => {
    if (!slots) return [];
    const byDay = new Map<string, Slot[]>();
    for (const slot of slots) {
      const key = zoned(slot.start, timezone).toFormat("yyyy-MM-dd");
      const bucket = byDay.get(key);
      if (bucket) bucket.push(slot);
      else byDay.set(key, [slot]);
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [slots, timezone]);

  function contactPayload(): { contactId?: string; contact?: { phoneE164: string; name?: string } } | null {
    if (contactMode === "existing") {
      return contact ? { contactId: contact.id } : null;
    }
    const phone = newPhone.trim();
    if (phone.length < 5) return null;
    return { contact: { phoneE164: phone, name: newName.trim() || undefined } };
  }

  async function book(slot: { start: string; providerId: string }) {
    const who = contactPayload();
    if (!who) {
      toast({
        title: "Who is this booking for?",
        description: contactMode === "existing" ? "Pick a contact from the search results." : "A phone number is required.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    setChosen(slotKey(slot));
    const res = await postJson<Booking>(`/orgs/${orgId}/bookings`, {
      serviceId,
      providerId: slot.providerId,
      startAt: slot.start,
      notes: notes.trim() || undefined,
      ...who,
    });
    setSaving(false);

    if (res.ok) {
      toast({
        title: "Booking created",
        description: `${zoned(res.data.startAt, timezone).toFormat("ccc d LLL, HH:mm")} with ${res.data.provider.name}`,
      });
      onCreated();
      onOpenChange(false);
      return;
    }

    setChosen(null);

    if (res.status === 409 && isSlotTaken(res.payload)) {
      const alts = res.payload.alternatives ?? [];
      setAlternatives(alts);
      toast({
        title: "That slot was just taken",
        description: alts.length ? "Pick one of the alternatives below." : "Nothing else is free nearby — try another day.",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Could not create the booking", description: res.message, variant: "destructive" });
  }

  const whoLabel = contactMode === "existing" ? (contact ? contact.name ?? contact.phoneE164 : null) : newPhone.trim() || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New booking</DialogTitle>
          <DialogDescription>
            Slots come from the availability engine, so a manual booking can never double-book a provider.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* 1 — Contact ---------------------------------------------------- */}
          <Step index={1} title="Contact" done={Boolean(whoLabel)} hint={whoLabel ?? undefined}>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-medium text-muted-foreground">Customer</span>
              <div className="ml-auto inline-flex items-center gap-1 rounded-lg bg-muted/70 p-1">
                {(["existing", "new"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setContactMode(value)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition-all",
                      contactMode === value
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {value === "existing" ? "Existing" : "New"}
                  </button>
                ))}
              </div>
            </div>

            {contactMode === "existing" ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={search}
                    placeholder="Name or phone number"
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void runSearch();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={() => void runSearch()} disabled={searching}>
                    <Search className="h-4 w-4" />
                    {searching ? "Searching..." : "Search"}
                  </Button>
                </div>
                {contact ? (
                  <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm">
                    <span className="font-semibold">{contact.name ?? "Unnamed"}</span>
                    <span className="text-muted-foreground">{contact.phoneE164}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setContact(null)}
                    >
                      Change
                    </Button>
                  </div>
                ) : results === null ? null : results.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No contact matched. Switch to “New” to add one.</p>
                ) : (
                  <ul className="max-h-40 divide-y divide-border/70 overflow-y-auto rounded-xl border border-border/70">
                    {results.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50"
                          onClick={() => setContact(row)}
                        >
                          <span className="font-semibold">{row.name ?? "Unnamed"}</span>
                          <span className="text-muted-foreground">{row.phoneE164}</span>
                          {row.optedOut ? <Badge variant="warning">opted out</Badge> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-booking-phone">Phone (E.164)</Label>
                  <Input
                    id="new-booking-phone"
                    value={newPhone}
                    placeholder="+15550100001"
                    onChange={(event) => setNewPhone(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-booking-name">Name</Label>
                  <Input
                    id="new-booking-name"
                    value={newName}
                    placeholder="Jane Doe"
                    onChange={(event) => setNewName(event.target.value)}
                  />
                </div>
              </div>
            )}
          </Step>

          {/* 2 — Service & provider ---------------------------------------- */}
          <Step index={2} title="Service & provider" done={Boolean(serviceId)} hint={service?.name}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-booking-service">Service</Label>
                <Select
                  value={serviceId}
                  onValueChange={(value) => {
                    setServiceId(value);
                    setSlots(null);
                  }}
                >
                  <SelectTrigger id="new-booking-service" className="h-10 rounded-lg bg-card">
                    <SelectValue placeholder="Pick a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {bookableServices.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name} · {row.durationMinutes} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-booking-provider">Provider</Label>
                <Select
                  value={providerId}
                  onValueChange={(value) => {
                    setProviderId(value);
                    setSlots(null);
                  }}
                >
                  <SelectTrigger id="new-booking-provider" className="h-10 rounded-lg bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any provider</SelectItem>
                    {eligibleProviders.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {service && eligibleProviders.length === 0 ? (
                  <p className="text-xs text-destructive">
                    No provider offers this service yet. Assign one in Settings → Services.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-booking-notes">Notes</Label>
              <Textarea
                id="new-booking-notes"
                rows={2}
                value={notes}
                placeholder="Anything the provider should know"
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </Step>

          {/* 3 — Time ------------------------------------------------------- */}
          <Step index={3} title="Time" done={Boolean(chosen)} last>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-booking-date">From date</Label>
                <Input
                  id="new-booking-date"
                  type="date"
                  value={fromDate}
                  onChange={(event) => {
                    setFromDate(event.target.value);
                    setSlots(null);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-booking-days">Days to search</Label>
                <Input
                  id="new-booking-days"
                  type="number"
                  min={1}
                  max={14}
                  value={days}
                  onChange={(event) => {
                    setDays(event.target.value);
                    setSlots(null);
                  }}
                />
              </div>
            </div>

            <Button
              type="button"
              variant="soft"
              onClick={() => void loadSlots()}
              disabled={!serviceId || !fromDate || loadingSlots}
            >
              {loadingSlots ? "Loading slots..." : "Show available slots"}
            </Button>

            {slotsError ? <p className="text-sm text-destructive">{slotsError}</p> : null}

            {alternatives ? (
              <div className="space-y-2 rounded-xl border border-amber-300/70 bg-amber-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">Alternatives</p>
                {alternatives.length === 0 ? (
                  <p className="text-sm text-amber-900">The engine offered no alternatives. Search another day.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {alternatives.map((alt) => (
                      <SlotChip
                        key={slotKey(alt)}
                        time={alt.label ?? zoned(alt.start, timezone).toFormat("ccc d LLL, HH:mm")}
                        hint={alt.providerName ?? undefined}
                        selected={chosen === slotKey(alt)}
                        disabled={saving}
                        onClick={() => void book(alt)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {slots !== null ? (
              slots.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                  No free slots in that window. Try more days, another provider, or check the working hours.
                </p>
              ) : (
                <div className="space-y-4">
                  {grouped.map(([day, daySlots]) => (
                    <div key={day} className="space-y-2">
                      <p className="text-[13px] font-bold tracking-tight">
                        {DateTime.fromISO(day).toFormat("cccc d LLLL")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {daySlots.map((slot) => (
                          <SlotChip
                            key={slotKey(slot)}
                            time={zoned(slot.start, timezone).toFormat("HH:mm")}
                            hint={providerId === "any" ? slot.providerName ?? undefined : undefined}
                            selected={chosen === slotKey(slot)}
                            disabled={saving}
                            onClick={() => void book(slot)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </Step>
        </div>

        <DialogFooter className="border-t border-border/70 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One numbered step of the booking flow, with a rail down the left. */
function Step({
  index,
  title,
  hint,
  done,
  last,
  children,
}: {
  index: number;
  title: string;
  hint?: string;
  done?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="relative pl-9">
      <span
        className={cn(
          "absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold",
          done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {index}
      </span>
      {!last ? <span className="absolute bottom-1 left-[13.5px] top-8 w-px bg-border" aria-hidden="true" /> : null}
      <div className="flex flex-wrap items-baseline gap-2 pb-3 pt-1">
        <h3 className="text-sm font-bold tracking-tight">{title}</h3>
        {hint ? <span className="truncate text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
