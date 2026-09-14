"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { api, errorMessage } from "@/lib/api";
import type { Provider } from "@/lib/types";
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
import { useToast } from "@/components/ui/toast";
import { postJson, type BlockedTimeRow } from "./shared";

const WHOLE_BUSINESS = "__business__";

export function BlockTimeDialog({
  orgId,
  timezone,
  open,
  onOpenChange,
  providers,
  defaultDate,
  onCreated,
}: {
  orgId: string;
  timezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: Provider[];
  defaultDate: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [providerId, setProviderId] = React.useState(WHOLE_BUSINESS);
  const [date, setDate] = React.useState(defaultDate);
  const [start, setStart] = React.useState("12:00");
  const [end, setEnd] = React.useState("13:00");
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setProviderId(WHOLE_BUSINESS);
    setDate(defaultDate);
    setStart("12:00");
    setEnd("13:00");
    setReason("");
    setError(null);
  }, [open, defaultDate]);

  async function save() {
    setError(null);
    const startAt = DateTime.fromISO(`${date}T${start}`, { zone: timezone });
    const endAt = DateTime.fromISO(`${date}T${end}`, { zone: timezone });
    if (!startAt.isValid || !endAt.isValid) {
      setError("Pick a valid date and time.");
      return;
    }
    if (endAt <= startAt) {
      setError("The end time must be after the start time.");
      return;
    }
    setSaving(true);
    const res = await postJson<BlockedTimeRow>(`/orgs/${orgId}/blocked-times`, {
      providerId: providerId === WHOLE_BUSINESS ? null : providerId,
      startAt: startAt.toUTC().toISO(),
      endAt: endAt.toUTC().toISO(),
      reason: reason.trim() || undefined,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    toast({ title: "Time blocked", description: `${startAt.toFormat("ccc d LLL, HH:mm")} – ${endAt.toFormat("HH:mm")}` });
    onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block time</DialogTitle>
          <DialogDescription>
            Blocked time is removed from the slots the AI can offer. Times are in {timezone}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="block-provider">Applies to</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger id="block-provider" className="h-10 rounded-lg bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_BUSINESS}>The whole business</SelectItem>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="block-date">Date</Label>
              <Input id="block-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-start">Start</Label>
              <Input id="block-start" type="time" value={start} onChange={(event) => setStart(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-end">End</Label>
              <Input id="block-end" type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="block-reason">Reason</Label>
            <Input
              id="block-reason"
              value={reason}
              placeholder="Lunch, training, equipment service..."
              onChange={(event) => setReason(event.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="border-t border-border/70 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving..." : "Block time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Small confirm popover shown when a hatched block is clicked. */
export function BlockedTimePopover({
  orgId,
  timezone,
  block,
  onClose,
  onDeleted,
}: {
  orgId: string;
  timezone: string;
  block: BlockedTimeRow | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    if (!block) return;
    setBusy(true);
    try {
      await api.del<{ ok: true }>(`/orgs/${orgId}/blocked-times/${block.id}`);
      toast({ title: "Block removed" });
      onDeleted();
      onClose();
    } catch (err) {
      toast({ title: "Could not remove the block", description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={block !== null} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-sm">
        {block ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-border"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(45deg, rgba(100,116,139,0.3) 0, rgba(100,116,139,0.3) 2px, transparent 2px, transparent 5px)",
                  }}
                />
                Blocked time
              </div>
              <DialogTitle className="pt-1">{block.reason?.trim() || "Blocked time"}</DialogTitle>
              <DialogDescription>
                {DateTime.fromISO(block.startAt, { zone: timezone }).toFormat("cccc d LLLL, HH:mm")} –{" "}
                {DateTime.fromISO(block.endAt, { zone: timezone }).toFormat("HH:mm")}
                <br />
                {block.provider?.name ?? "Whole business"}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="border-t border-border/70 pt-4">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Close
              </Button>
              <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
                {busy ? "Removing..." : "Remove block"}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
