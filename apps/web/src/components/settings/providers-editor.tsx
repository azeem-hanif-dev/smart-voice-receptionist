"use client";

import * as React from "react";
import { Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Provider, ProviderInput, Service, WeeklyHour } from "@/lib/types";
import { DEFAULT_BUSINESS_HOURS, WEEKDAYS, minutesToTime } from "@/lib/time";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { CheckboxList } from "./checkbox-list";
import { WeeklyHoursEditor, weeklyHoursAreValid } from "./business-hours-editor";
import { EmptyState, IconButton, RowActions } from "./ui";

const PALETTE = ["#0ea5e9", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#f59e0b", "#6366f1", "#14b8a6"];

interface Draft {
  id: string | null;
  name: string;
  title: string;
  color: string;
  active: boolean;
  serviceIds: string[];
  workingHours: WeeklyHour[];
}

function summarizeHours(hours: WeeklyHour[]): string {
  if (!hours.length) return "No working hours";
  return hours
    .slice()
    .sort((a, b) => a.weekday - b.weekday)
    .map((hour) => `${WEEKDAYS[hour.weekday]?.short ?? hour.weekday} ${minutesToTime(hour.startMinute)}-${minutesToTime(hour.endMinute)}`)
    .join(", ");
}

export function ProvidersEditor({
  orgId,
  defaultWorkingHours,
  onChanged,
}: {
  orgId: string;
  /** Applied to new providers; onboarding passes the org's business hours. */
  defaultWorkingHours?: WeeklyHour[];
  onChanged?: (providers: Provider[]) => void;
}) {
  const { toast } = useToast();
  const [providers, setProviders] = React.useState<Provider[] | null>(null);
  const [services, setServices] = React.useState<Service[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [providerRows, serviceRows] = await Promise.all([
        api.get<Provider[]>(`/orgs/${orgId}/providers`),
        api.get<Service[]>(`/orgs/${orgId}/services`),
      ]);
      setProviders(providerRows);
      setServices(serviceRows);
      setError(null);
      return providerRows;
    } catch (err) {
      setError(errorMessage(err));
      setProviders([]);
      return [];
    }
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function newDraft(): Draft {
    const hours = defaultWorkingHours?.length ? defaultWorkingHours : DEFAULT_BUSINESS_HOURS;
    return {
      id: null,
      name: "",
      title: "",
      color: PALETTE[(providers?.length ?? 0) % PALETTE.length],
      active: true,
      serviceIds: services.map((service) => service.id),
      workingHours: hours.map((hour) => ({ ...hour })),
    };
  }

  function editDraft(provider: Provider): Draft {
    return {
      id: provider.id,
      name: provider.name,
      title: provider.title ?? "",
      color: provider.color ?? PALETTE[0],
      active: provider.active,
      serviceIds: provider.serviceIds ?? [],
      workingHours: provider.workingHours ?? [],
    };
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast({ title: "A name is required", variant: "destructive" });
      return;
    }
    if (!weeklyHoursAreValid(draft.workingHours)) {
      toast({ title: "Check the working hours", description: "Each day must end after it starts.", variant: "destructive" });
      return;
    }
    const body: ProviderInput = {
      name: draft.name.trim(),
      title: draft.title.trim() || undefined,
      color: draft.color,
      active: draft.active,
      serviceIds: draft.serviceIds,
      workingHours: draft.workingHours,
    };
    setSaving(true);
    try {
      if (draft.id) {
        await api.patch<Provider>(`/orgs/${orgId}/providers/${draft.id}`, body);
      } else {
        await api.post<Provider>(`/orgs/${orgId}/providers`, body);
      }
      setDraft(null);
      const rows = await load();
      onChanged?.(rows);
    } catch (err) {
      toast({ title: "Could not save the provider", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(provider: Provider) {
    if (!window.confirm(`Delete ${provider.name}?`)) return;
    try {
      await api.del(`/orgs/${orgId}/providers/${provider.id}`);
      const rows = await load();
      onChanged?.(rows);
    } catch (err) {
      toast({ title: "Could not delete the provider", description: errorMessage(err), variant: "destructive" });
    }
  }

  if (providers === null) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {providers.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No providers yet"
          description="Add at least one person so appointments can be booked."
          action={
            <Button onClick={() => setDraft(newDraft())}>
              <Plus className="h-4 w-4" />
              Add provider
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Working hours</TableHead>
                <TableHead className="w-24">Services</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((provider) => (
                <TableRow key={provider.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: provider.color ?? "#94a3b8" }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold">{provider.name}</p>
                        {provider.title ? (
                          <p className="text-xs text-muted-foreground">{provider.title}</p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[18rem] text-xs text-muted-foreground">
                    {summarizeHours(provider.workingHours ?? [])}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {provider.serviceIds?.length ?? 0}
                  </TableCell>
                  <TableCell>
                    <Badge variant={provider.active ? "success" : "muted"}>
                      {provider.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      <IconButton label="Edit" onClick={() => setDraft(editDraft(provider))}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Delete" destructive onClick={() => void remove(provider)}>
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

      {providers.length > 0 ? (
        <Button variant="outline" onClick={() => setDraft(newDraft())}>
          <Plus className="h-4 w-4" />
          Add provider
        </Button>
      ) : null}

      <Dialog open={draft !== null} onOpenChange={(open) => (open ? null : setDraft(null))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit provider" : "New provider"}</DialogTitle>
            <DialogDescription>Working hours drive the slots the assistant can offer.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="provider-name">Name</Label>
                  <Input
                    id="provider-name"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provider-title">Title</Label>
                  <Input
                    id="provider-title"
                    placeholder="Dentist, Stylist, Vet..."
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="provider-color">Calendar colour</Label>
                  <div className="flex items-center gap-1.5">
                    {PALETTE.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        aria-label={`Use ${swatch}`}
                        onClick={() => setDraft({ ...draft, color: swatch })}
                        className={
                          draft.color.toLowerCase() === swatch
                            ? "h-6 w-6 rounded-full ring-2 ring-primary ring-offset-2"
                            : "h-6 w-6 rounded-full transition-transform hover:scale-110"
                        }
                        style={{ backgroundColor: swatch }}
                      />
                    ))}
                    <input
                      id="provider-color"
                      type="color"
                      className="h-9 w-10 cursor-pointer rounded-lg border border-input bg-transparent p-1"
                      value={draft.color}
                      onChange={(event) => setDraft({ ...draft, color: event.target.value })}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="provider-active"
                    checked={draft.active}
                    onCheckedChange={(checked) => setDraft({ ...draft, active: checked })}
                  />
                  <Label htmlFor="provider-active">Accepting bookings</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Services</Label>
                <CheckboxList
                  options={services.map((service) => ({
                    id: service.id,
                    label: service.name,
                    hint: `${service.durationMinutes} min`,
                  }))}
                  selected={draft.serviceIds}
                  onChange={(serviceIds) => setDraft({ ...draft, serviceIds })}
                  emptyText="Add services first, then assign them here."
                />
              </div>

              <div className="space-y-2">
                <Label>Working hours</Label>
                <WeeklyHoursEditor
                  idPrefix="provider-hours"
                  value={draft.workingHours}
                  onChange={(workingHours) => setDraft({ ...draft, workingHours })}
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
    </div>
  );
}
