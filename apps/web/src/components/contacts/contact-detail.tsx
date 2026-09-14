"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  MessageCircle,
  MessagesSquare,
  MonitorSmartphone,
  Pencil,
  Sparkles,
  X,
} from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Booking, Channel, ContactMemory, ConversationStatus, Org } from "@/lib/types";
import { formatRelative } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { STATUS_LABEL, zoned } from "@/components/calendar/shared";
import { ContactAvatar } from "./contacts-table";

/** GET /orgs/:orgId/contacts/:id — conversations are trimmed summaries here. */
interface ContactConversation {
  id: string;
  channel: Channel;
  status: ConversationStatus;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  handoffReason: string | null;
}

interface ContactDetailRow {
  id: string;
  phoneE164: string;
  name: string | null;
  email: string | null;
  language: string | null;
  memory: ContactMemory;
  optedOut: boolean;
  createdAt: string;
  bookings: Booking[];
  conversations: ContactConversation[];
}

const PILL_BASE =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-4 tracking-wide ring-1 ring-inset";

function bookingStatusPill(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/15";
    case "PENDING":
      return "bg-sky-50 text-sky-700 ring-sky-600/15";
    case "CANCELLED":
      return "bg-red-50 text-red-700 ring-red-600/15";
    case "NO_SHOW":
      return "bg-amber-50 text-amber-800 ring-amber-600/20";
    default:
      return "bg-muted text-muted-foreground ring-border/70";
  }
}

function conversationStatusPill(status: ConversationStatus): string {
  switch (status) {
    case "AI":
      return "bg-primary/10 text-primary ring-primary/15";
    case "HUMAN":
      return "bg-amber-50 text-amber-800 ring-amber-600/20";
    default:
      return "bg-muted text-muted-foreground ring-border/70";
  }
}

export function ContactDetail({ orgId, contactId }: { orgId: string; contactId: string }) {
  const { toast } = useToast();
  const [contact, setContact] = React.useState<ContactDetailRow | null>(null);
  const [timezone, setTimezone] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [editingName, setEditingName] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [org, row] = await Promise.all([
        api.get<Org>(`/orgs/${orgId}`),
        api.get<ContactDetailRow>(`/orgs/${orgId}/contacts/${contactId}`),
      ]);
      setTimezone(org.timezone);
      setContact(row);
      setNameDraft(row.name ?? "");
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [orgId, contactId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>, successTitle: string) {
    setSaving(true);
    try {
      const updated = await api.patch<ContactDetailRow>(`/orgs/${orgId}/contacts/${contactId}`, body);
      setContact((current) => (current ? { ...current, ...updated } : current));
      toast({ title: successTitle });
      return true;
    } catch (err) {
      toast({ title: "Could not save", description: errorMessage(err), variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  }

  const backLink = (
    <Link
      href={`/o/${orgId}/contacts`}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      All contacts
    </Link>
  );

  if (error) {
    return (
      <>
        {backLink}
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-600/15">
          {error}
        </p>
      </>
    );
  }

  if (!contact) {
    return (
      <>
        {backLink}
        <Skeleton className="mb-4 h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </>
    );
  }

  const zone = timezone ?? "UTC";
  const memory = contact.memory ?? ({} as ContactMemory);
  const qualification = Object.entries(memory.qualification ?? {});

  return (
    <div className="animate-fade-in-up">
      {backLink}

      {/* Header ------------------------------------------------------------- */}
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-5 p-6">
          <ContactAvatar
            id={contact.id}
            name={contact.name}
            phone={contact.phoneE164}
            className="h-16 w-16 text-xl"
          />

          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex max-w-sm items-center gap-2">
                <Input
                  value={nameDraft}
                  autoFocus
                  onChange={(event) => setNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void patch({ name: nameDraft.trim() || null }, "Name updated").then((ok) => {
                        if (ok) setEditingName(false);
                      });
                    }
                    if (event.key === "Escape") {
                      setNameDraft(contact.name ?? "");
                      setEditingName(false);
                    }
                  }}
                />
                <Button
                  size="icon"
                  aria-label="Save name"
                  disabled={saving}
                  onClick={() =>
                    void patch({ name: nameDraft.trim() || null }, "Name updated").then((ok) => {
                      if (ok) setEditingName(false);
                    })
                  }
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Cancel"
                  onClick={() => {
                    setNameDraft(contact.name ?? "");
                    setEditingName(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className="group flex items-center gap-2 text-left"
                onClick={() => setEditingName(true)}
              >
                <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">
                  {contact.name?.trim() || "Unnamed"}
                </h1>
                <Pencil className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="tabular-nums">{contact.phoneE164}</span>
              <span className="text-border">·</span>
              <span>{contact.language ? `Language: ${contact.language}` : "Language not detected"}</span>
              <span
                className={cn(
                  PILL_BASE,
                  memory.isReturning
                    ? "bg-primary/10 text-primary ring-primary/15"
                    : "bg-muted text-muted-foreground ring-border/70",
                )}
              >
                {memory.isReturning ? "Returning customer" : "New customer"}
              </span>
              {contact.optedOut ? (
                <span className={cn(PILL_BASE, "bg-amber-50 text-amber-800 ring-amber-600/20")}>
                  Opted out
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/40 px-4 py-3">
            <Switch
              id="contact-opted-out"
              checked={contact.optedOut}
              disabled={saving}
              onCheckedChange={(checked) =>
                void patch({ optedOut: checked }, checked ? "Marked as opted out" : "Opt-out removed")
              }
            />
            <Label htmlFor="contact-opted-out" className="cursor-pointer text-xs">
              Opted out of messages
            </Label>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Memory ----------------------------------------------------------- */}
        <Card className="lg:col-span-1">
          <CardHeader className="p-6 pb-4">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <CardTitle>What the AI remembers</CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Built from the conversations, used on the next message.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-6 pt-0 text-sm">
            <div>
              <Eyebrow>Preferences</Eyebrow>
              {memory.preferences?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {memory.preferences.map((item, index) => (
                    <span
                      key={`${item}-${index}`}
                      className="rounded-full bg-accent/60 px-2.5 py-1 text-xs font-medium text-accent-foreground ring-1 ring-inset ring-primary/10"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <EmptyNote>None recorded.</EmptyNote>
              )}
            </div>

            <div>
              <Eyebrow>Notes</Eyebrow>
              {memory.notes?.length ? (
                <ul className="space-y-1.5">
                  {memory.notes.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-2 text-sm leading-snug">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
                      <span className="min-w-0">{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyNote>None recorded.</EmptyNote>
              )}
            </div>

            <div>
              <Eyebrow>Qualification answers</Eyebrow>
              {qualification.length === 0 ? (
                <EmptyNote>None recorded.</EmptyNote>
              ) : (
                <dl className="divide-y divide-border/60 rounded-xl bg-muted/40 px-3">
                  {qualification.map(([key, value]) => (
                    <div key={key} className="flex gap-3 py-2">
                      <dt className="w-28 shrink-0 truncate text-xs text-muted-foreground">{key}</dt>
                      <dd className="min-w-0 flex-1 break-words text-xs font-medium">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            <div>
              <Eyebrow>Preferred provider</Eyebrow>
              {memory.preferredProviderName ? (
                <p className="text-sm font-medium">{memory.preferredProviderName}</p>
              ) : (
                <EmptyNote>No preference recorded.</EmptyNote>
              )}
            </div>

            <div>
              <Eyebrow>Last booking</Eyebrow>
              {memory.lastBookingSummary ? (
                <p className="text-sm">{memory.lastBookingSummary}</p>
              ) : (
                <EmptyNote>No booking summary yet.</EmptyNote>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {/* Bookings ------------------------------------------------------- */}
          <Card className="overflow-hidden">
            <CardHeader className="p-6 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <div>
                  <CardTitle>Bookings</CardTitle>
                  <CardDescription className="mt-0.5 text-xs">Newest first, in {zone}.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {contact.bookings.length === 0 ? (
                <EmptyPanel
                  icon={<CalendarDays className="h-5 w-5" />}
                  title="No bookings yet"
                  line="Appointments booked in a conversation appear here."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-48 pl-6">When</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead className="w-40">Provider</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead className="w-20 pr-6">Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contact.bookings.map((booking) => (
                      <TableRow key={booking.id}>
                        <TableCell className="whitespace-nowrap pl-6 text-sm font-medium tabular-nums">
                          {zoned(booking.startAt, zone).toFormat("ccc d LLL yyyy, HH:mm")}
                        </TableCell>
                        <TableCell className="text-sm">{booking.service.name}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2 text-sm">
                            <span
                              className="inline-block h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: booking.provider.color ?? "#94a3b8" }}
                              aria-hidden="true"
                            />
                            <span className="truncate">{booking.provider.name}</span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={cn(PILL_BASE, bookingStatusPill(booking.status))}>
                            {STATUS_LABEL[booking.status] ?? booking.status}
                          </span>
                        </TableCell>
                        <TableCell className="pr-6 text-xs text-muted-foreground">{booking.source}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Conversations -------------------------------------------------- */}
          <Card className="overflow-hidden">
            <CardHeader className="p-6 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MessagesSquare className="h-4 w-4" />
                </span>
                <CardTitle>Conversations</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {contact.conversations.length === 0 ? (
                <EmptyPanel
                  icon={<MessagesSquare className="h-5 w-5" />}
                  title="No conversations yet"
                  line="Threads with this contact show up here."
                />
              ) : (
                <ul className="divide-y divide-border/60">
                  {contact.conversations.map((conversation) => (
                    <li key={conversation.id}>
                      <Link
                        href={`/o/${orgId}/inbox?c=${conversation.id}`}
                        className="group flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-accent/40"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          {conversation.channel === "WHATSAPP" ? (
                            <MessageCircle className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <MonitorSmartphone className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn(PILL_BASE, conversationStatusPill(conversation.status))}>
                              {conversation.status}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {formatRelative(conversation.lastMessageAt ?? conversation.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {conversation.lastMessagePreview ?? "No messages"}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </p>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function EmptyPanel({
  icon,
  title,
  line,
}: {
  icon: React.ReactNode;
  title: string;
  line: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{line}</p>
    </div>
  );
}
