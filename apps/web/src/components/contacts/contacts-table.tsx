"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Users } from "lucide-react";
import { api, errorMessage, query } from "@/lib/api";
import type { Contact } from "@/lib/types";
import { formatRelative } from "@/lib/time";
import { cn } from "@/lib/utils";
import { avatarGradient, initials } from "@/components/inbox/lib";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** The list endpoint returns a couple of fields the shared Contact type omits. */
export interface ContactRow extends Contact {
  conversationsCount?: number;
}

/** Initials circle on a soft gradient, seeded from the contact id. */
export function ContactAvatar({
  id,
  name,
  phone,
  className,
}: {
  id: string;
  name: string | null;
  phone: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white ring-1 ring-inset ring-white/25",
        avatarGradient(id || phone),
        className,
      )}
    >
      {initials(name, phone)}
    </span>
  );
}

function Pill({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "brand" | "warning" | "outline";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-4 tracking-wide ring-1 ring-inset",
        tone === "muted" && "bg-muted text-muted-foreground ring-border/70",
        tone === "brand" && "bg-primary/10 text-primary ring-primary/15",
        tone === "warning" && "bg-amber-50 text-amber-800 ring-amber-600/20",
        tone === "outline" && "bg-card text-muted-foreground ring-border",
      )}
    >
      {children}
    </span>
  );
}

export function ContactsTable({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [applied, setApplied] = React.useState("");
  const [rows, setRows] = React.useState<ContactRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .get<ContactRow[]>(`/orgs/${orgId}/contacts${query({ q: applied })}`)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setRows([]);
        setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, applied]);

  // Debounce the search box so typing does not hammer the API.
  React.useEffect(() => {
    const handle = window.setTimeout(() => setApplied(search.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Contacts"
        description="Everyone who has messaged the business, with what the AI remembers about them."
        actions={
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 rounded-full pl-9 text-[13px]"
                value={search}
                placeholder="Search name or phone"
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search contacts"
              />
            </div>
            {search ? (
              <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                Clear
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? (
        <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-600/15">
          {error}
        </p>
      ) : null}

      <Card className="animate-fade-in-up overflow-hidden">
        <CardContent className="p-0">
          {rows === null ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-2/3 rounded-lg" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Users className="h-6 w-6" />
              </span>
              <p className="text-base font-semibold tracking-tight">
                {applied ? "No matching contacts" : "No contacts yet"}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {applied
                  ? `Nothing matches “${applied}”. Try a different name or number.`
                  : "Contacts appear as soon as someone messages you."}
              </p>
              {applied ? (
                <Button variant="soft" size="sm" className="mt-1" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              ) : null}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Contact</TableHead>
                  <TableHead className="w-24">Language</TableHead>
                  <TableHead className="w-28">Customer</TableHead>
                  <TableHead className="w-24 text-right">Bookings</TableHead>
                  <TableHead className="w-44">Last conversation</TableHead>
                  <TableHead className="w-28 pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/o/${orgId}/contacts/${row.id}`)}
                  >
                    <TableCell className="py-3 pl-5">
                      <div className="flex items-center gap-3">
                        <ContactAvatar id={row.id} name={row.name} phone={row.phoneE164} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold tracking-tight">
                            {row.name?.trim() || "Unnamed"}
                          </p>
                          <p className="truncate text-xs tabular-nums text-muted-foreground">
                            {row.phoneE164}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.language ? (
                        <Pill tone="outline">{row.language}</Pill>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Pill tone={row.memory?.isReturning ? "brand" : "muted"}>
                        {row.memory?.isReturning ? "Returning" : "New"}
                      </Pill>
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {row.bookingsCount}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.lastConversationAt ? formatRelative(row.lastConversationAt) : "—"}
                    </TableCell>
                    <TableCell className="pr-5">
                      {row.optedOut ? <Pill tone="warning">Opted out</Pill> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
