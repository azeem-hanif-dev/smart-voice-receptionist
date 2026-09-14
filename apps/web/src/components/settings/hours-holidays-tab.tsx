"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { CalendarOff, PartyPopper, Plus, Trash2 } from "lucide-react";
import { api, errorMessage, query } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/time";
import type { BlockedTime, BlockedTimeInput, Holiday, Org, Provider } from "@/lib/types";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { EmptyState, IconButton, RowActions, SettingsCard } from "./ui";

const WHOLE_BUSINESS = "__all__";

export function HoursHolidaysTab({ org }: { org: Org }) {
  return (
    <div className="space-y-4">
      <HolidaysCard org={org} />
      <BlockedTimesCard org={org} />
    </div>
  );
}

function HolidaysCard({ org }: { org: Org }) {
  const { toast } = useToast();
  const [holidays, setHolidays] = React.useState<Holiday[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState("");
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setHolidays(await api.get<Holiday[]>(`/orgs/${org.id}/holidays`));
    } catch {
      setHolidays([]);
    }
  }, [org.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!date || !name.trim()) {
      toast({ title: "A date and a name are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api.post<Holiday>(`/orgs/${org.id}/holidays`, { date, name: name.trim() });
      setOpen(false);
      setDate("");
      setName("");
      await load();
    } catch (err) {
      toast({ title: "Could not add the holiday", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(holiday: Holiday) {
    try {
      await api.del(`/orgs/${org.id}/holidays/${holiday.id}`);
      await load();
    } catch (err) {
      toast({ title: "Could not delete the holiday", description: errorMessage(err), variant: "destructive" });
    }
  }

  return (
    <SettingsCard
      title="Holidays"
      description="Whole days the business is closed. No slots are offered on these dates."
      aside={
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Add holiday
        </Button>
      }
    >
      {holidays === null ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : holidays.length === 0 ? (
        <EmptyState
          icon={PartyPopper}
          title="No holidays yet"
          description="Add the dates you close so the assistant never offers a slot on them."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Add holiday
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-48">Date</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.map((holiday) => (
                <TableRow key={holiday.id} className="group">
                  <TableCell className="font-semibold">{holiday.name}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(holiday.date, org.timezone)}</TableCell>
                  <TableCell>
                    <RowActions>
                      <IconButton label="Delete" destructive onClick={() => void remove(holiday)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New holiday</DialogTitle>
            <DialogDescription>Dates are in {org.timezone}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="holiday-date">Date</Label>
              <Input id="holiday-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holiday-name">Name</Label>
              <Input id="holiday-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
          </div>
          <DialogFooter className="border-t border-border/70 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void add()} disabled={saving}>
              {saving ? "Saving..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}

function BlockedTimesCard({ org }: { org: Org }) {
  const { toast } = useToast();
  const [blocks, setBlocks] = React.useState<BlockedTime[] | null>(null);
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [open, setOpen] = React.useState(false);
  const [providerId, setProviderId] = React.useState<string>(WHOLE_BUSINESS);
  const [startAt, setStartAt] = React.useState("");
  const [endAt, setEndAt] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const from = DateTime.now().setZone(org.timezone).startOf("day").toISO();
    const to = DateTime.now().setZone(org.timezone).plus({ days: 90 }).endOf("day").toISO();
    try {
      const [blockRows, providerRows] = await Promise.all([
        api.get<BlockedTime[]>(`/orgs/${org.id}/blocked-times${query({ from, to })}`),
        api.get<Provider[]>(`/orgs/${org.id}/providers`),
      ]);
      setBlocks(blockRows);
      setProviders(providerRows);
    } catch {
      setBlocks([]);
    }
  }, [org.id, org.timezone]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function toUtc(local: string): string | null {
    const dt = DateTime.fromISO(local, { zone: org.timezone });
    return dt.isValid ? dt.toUTC().toISO() : null;
  }

  async function add() {
    const start = toUtc(startAt);
    const end = toUtc(endAt);
    if (!start || !end || new Date(end) <= new Date(start)) {
      toast({ title: "Check the times", description: "The end must be after the start.", variant: "destructive" });
      return;
    }
    const body: BlockedTimeInput = {
      providerId: providerId === WHOLE_BUSINESS ? null : providerId,
      startAt: start,
      endAt: end,
      reason: reason.trim() || undefined,
    };
    setSaving(true);
    try {
      await api.post<BlockedTime>(`/orgs/${org.id}/blocked-times`, body);
      setOpen(false);
      setStartAt("");
      setEndAt("");
      setReason("");
      setProviderId(WHOLE_BUSINESS);
      await load();
    } catch (err) {
      toast({ title: "Could not block the time", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(block: BlockedTime) {
    try {
      await api.del(`/orgs/${org.id}/blocked-times/${block.id}`);
      await load();
    } catch (err) {
      toast({ title: "Could not delete the block", description: errorMessage(err), variant: "destructive" });
    }
  }

  function providerName(id: string | null): string {
    if (!id) return "Whole business";
    return providers.find((provider) => provider.id === id)?.name ?? "Provider";
  }

  return (
    <SettingsCard
      title="Blocked time"
      description={`One-off closures for a provider or the whole business, next 90 days. Times are in ${org.timezone}.`}
      aside={
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Block time
        </Button>
      }
    >
      {blocks === null ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : blocks.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title="Nothing blocked in the next 90 days"
          description="Block lunch, training or a day off and the assistant stops offering those times."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Block time
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applies to</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {blocks.map((block) => (
                <TableRow key={block.id} className="group">
                  <TableCell className="font-semibold">{providerName(block.providerId)}</TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">
                    {formatDateTime(block.startAt, org.timezone)} → {formatDateTime(block.endAt, org.timezone)}
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{block.reason ?? "—"}</TableCell>
                  <TableCell>
                    <RowActions>
                      <IconButton label="Delete" destructive onClick={() => void remove(block)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block time</DialogTitle>
            <DialogDescription>Times are entered in {org.timezone}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="block-provider">Applies to</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger id="block-provider" className="h-10 rounded-lg bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE_BUSINESS}>Whole business</SelectItem>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="block-start">Start</Label>
                <Input
                  id="block-start"
                  type="datetime-local"
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="block-end">End</Label>
                <Input
                  id="block-end"
                  type="datetime-local"
                  value={endAt}
                  onChange={(event) => setEndAt(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-reason">Reason</Label>
              <Input id="block-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            </div>
          </div>
          <DialogFooter className="border-t border-border/70 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void add()} disabled={saving}>
              {saving ? "Saving..." : "Block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}
