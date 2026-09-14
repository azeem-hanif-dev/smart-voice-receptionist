"use client";

import * as React from "react";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { normalizeWeeklyHours, timezoneOptions } from "@/lib/time";
import type { Location, LocationInput, Org, WeeklyHour } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { WeeklyHoursEditor, weeklyHoursAreValid } from "./business-hours-editor";
import { EmptyState, IconButton, RowActions, SaveFooter, SettingsCard, useSavedFlag } from "./ui";

export function BusinessProfileTab({ org, onSaved }: { org: Org; onSaved: (org: Org) => void }) {
  const { toast } = useToast();
  const [name, setName] = React.useState(org.name);
  const [timezone, setTimezone] = React.useState(org.timezone);
  const [description, setDescription] = React.useState(org.brandVoice?.description ?? "");
  const [hours, setHours] = React.useState<WeeklyHour[]>(normalizeWeeklyHours(org.businessHours));
  const [saving, setSaving] = React.useState(false);
  const [saved, markSaved] = useSavedFlag();

  async function save() {
    if (!weeklyHoursAreValid(hours)) {
      toast({ title: "Check the opening hours", description: "Each open day must end after it starts.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const updated = await api.patch<Org>(`/orgs/${org.id}`, {
        name: name.trim(),
        timezone,
        businessHours: hours,
        brandVoice: { ...org.brandVoice, description },
      });
      onSaved(updated);
      markSaved();
      toast({ title: "Business profile saved", variant: "success" });
    } catch (err) {
      toast({ title: "Could not save", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Business profile"
        description="Shown to customers and used by the assistant."
        footer={<SaveFooter saving={saving} saved={saved} onSave={() => void save()} />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="settings-name">Name</Label>
            <Input id="settings-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-timezone">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="settings-timezone" className="h-10 rounded-lg bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezoneOptions(timezone).map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-description">Description</Label>
          <Textarea
            id="settings-description"
            rows={3}
            placeholder="One or two sentences about the business."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Opening hours</Label>
          <WeeklyHoursEditor value={hours} onChange={setHours} idPrefix="settings-hours" />
        </div>
      </SettingsCard>

      <LocationsCard orgId={org.id} />
    </div>
  );
}

interface LocationDraft {
  id: string | null;
  name: string;
  address: string;
  phone: string;
}

function LocationsCard({ orgId }: { orgId: string }) {
  const { toast } = useToast();
  const [locations, setLocations] = React.useState<Location[] | null>(null);
  const [draft, setDraft] = React.useState<LocationDraft | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setLocations(await api.get<Location[]>(`/orgs/${orgId}/locations`));
    } catch {
      setLocations([]);
    }
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft || !draft.name.trim()) return;
    const body: LocationInput = {
      name: draft.name.trim(),
      address: draft.address.trim() || undefined,
      phone: draft.phone.trim() || undefined,
    };
    setSaving(true);
    try {
      if (draft.id) {
        await api.patch<Location>(`/orgs/${orgId}/locations/${draft.id}`, body);
      } else {
        await api.post<Location>(`/orgs/${orgId}/locations`, body);
      }
      setDraft(null);
      await load();
    } catch (err) {
      toast({ title: "Could not save the location", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(location: Location) {
    if (!window.confirm(`Delete ${location.name}?`)) return;
    try {
      await api.del(`/orgs/${orgId}/locations/${location.id}`);
      await load();
    } catch (err) {
      toast({ title: "Could not delete the location", description: errorMessage(err), variant: "destructive" });
    }
  }

  return (
    <SettingsCard
      title="Locations"
      description="Used for directions and the assistant's answers. Bookings are not tied to a location."
      aside={
        <Button variant="outline" size="sm" onClick={() => setDraft({ id: null, name: "", address: "", phone: "" })}>
          <Plus className="h-4 w-4" />
          Add location
        </Button>
      }
    >
      {locations === null ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : locations.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No locations yet"
          description="Add a branch so the assistant can give directions and opening details."
          action={
            <Button variant="outline" onClick={() => setDraft({ id: null, name: "", address: "", phone: "" })}>
              <Plus className="h-4 w-4" />
              Add location
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70">
          {locations.map((location) => (
            <li
              key={location.id}
              className="group flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{location.name}</p>
                {location.address ? <p className="text-[13px] text-muted-foreground">{location.address}</p> : null}
                {location.phone ? <p className="text-[13px] text-muted-foreground">{location.phone}</p> : null}
              </div>
              <RowActions className="shrink-0">
                <IconButton
                  label="Edit"
                  onClick={() =>
                    setDraft({
                      id: location.id,
                      name: location.name,
                      address: location.address ?? "",
                      phone: location.phone ?? "",
                    })
                  }
                >
                  <Pencil className="h-4 w-4" />
                </IconButton>
                <IconButton label="Delete" destructive onClick={() => void remove(location)}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </RowActions>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => (open ? null : setDraft(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit location" : "New location"}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="location-name">Name</Label>
                <Input
                  id="location-name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location-address">Address</Label>
                <Input
                  id="location-address"
                  value={draft.address}
                  onChange={(event) => setDraft({ ...draft, address: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location-phone">Phone</Label>
                <Input
                  id="location-phone"
                  value={draft.phone}
                  onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="border-t border-border/70 pt-4">
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}
