"use client";

import * as React from "react";
import { ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Provider, Service, ServiceInput } from "@/lib/types";
import { formatPrice, priceToCents } from "@/lib/time";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { CheckboxList } from "./checkbox-list";
import { EmptyState, IconButton, RowActions } from "./ui";

interface Draft {
  id: string | null;
  name: string;
  description: string;
  durationMinutes: string;
  bufferBeforeMinutes: string;
  bufferAfterMinutes: string;
  price: string;
  active: boolean;
  providerIds: string[];
}

function emptyDraft(): Draft {
  return {
    id: null,
    name: "",
    description: "",
    durationMinutes: "30",
    bufferBeforeMinutes: "0",
    bufferAfterMinutes: "0",
    price: "",
    active: true,
    providerIds: [],
  };
}

function draftFrom(service: Service): Draft {
  return {
    id: service.id,
    name: service.name,
    description: service.description ?? "",
    durationMinutes: String(service.durationMinutes),
    bufferBeforeMinutes: String(service.bufferBeforeMinutes ?? 0),
    bufferAfterMinutes: String(service.bufferAfterMinutes ?? 0),
    price: service.priceCents === null || service.priceCents === undefined ? "" : (service.priceCents / 100).toFixed(2),
    active: service.active,
    providerIds: service.providerIds ?? [],
  };
}

export function ServicesEditor({
  orgId,
  showProviders = true,
  onChanged,
}: {
  orgId: string;
  showProviders?: boolean;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [services, setServices] = React.useState<Service[] | null>(null);
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [serviceRows, providerRows] = await Promise.all([
        api.get<Service[]>(`/orgs/${orgId}/services`),
        showProviders ? api.get<Provider[]>(`/orgs/${orgId}/providers`) : Promise.resolve([] as Provider[]),
      ]);
      setServices(serviceRows);
      setProviders(providerRows);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
      setServices([]);
    }
  }, [orgId, showProviders]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft) return;
    const duration = Number(draft.durationMinutes);
    if (!draft.name.trim() || !Number.isFinite(duration) || duration < 5) {
      toast({ title: "Check the service", description: "A name and a duration of at least 5 minutes are required.", variant: "destructive" });
      return;
    }
    const body: ServiceInput = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      durationMinutes: Math.round(duration),
      bufferBeforeMinutes: Number(draft.bufferBeforeMinutes) || 0,
      bufferAfterMinutes: Number(draft.bufferAfterMinutes) || 0,
      priceCents: priceToCents(draft.price),
      active: draft.active,
    };
    if (showProviders) body.providerIds = draft.providerIds;

    setSaving(true);
    try {
      if (draft.id) {
        await api.patch<Service>(`/orgs/${orgId}/services/${draft.id}`, body);
      } else {
        await api.post<Service>(`/orgs/${orgId}/services`, body);
      }
      setDraft(null);
      await load();
      onChanged?.();
    } catch (err) {
      toast({ title: "Could not save the service", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(service: Service) {
    if (!window.confirm(`Delete "${service.name}"?`)) return;
    try {
      await api.del(`/orgs/${orgId}/services/${service.id}`);
      await load();
      onChanged?.();
    } catch (err) {
      toast({ title: "Could not delete the service", description: errorMessage(err), variant: "destructive" });
    }
  }

  if (services === null) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-2/3 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {services.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No services yet"
          description="Add the first one customers can book — the assistant offers slots per service."
          action={
            <Button onClick={() => setDraft(emptyDraft())}>
              <Plus className="h-4 w-4" />
              Add service
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-24">Duration</TableHead>
                <TableHead className="w-24">Price</TableHead>
                {showProviders ? <TableHead className="w-28">Providers</TableHead> : null}
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => (
                <TableRow key={service.id} className="group">
                  <TableCell>
                    <div className="font-semibold">{service.name}</div>
                    {service.description ? (
                      <div className="text-xs text-muted-foreground">{service.description}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{service.durationMinutes} min</TableCell>
                  <TableCell className="tabular-nums">
                    {formatPrice(service.priceCents, service.currency ?? "USD") || "—"}
                  </TableCell>
                  {showProviders ? (
                    <TableCell className="tabular-nums text-muted-foreground">
                      {service.providerIds?.length ?? 0}
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <Badge variant={service.active ? "success" : "muted"}>
                      {service.active ? "Bookable" : "Hidden"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      <IconButton label="Edit" onClick={() => setDraft(draftFrom(service))}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Delete" destructive onClick={() => void remove(service)}>
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

      {services.length > 0 ? (
        <Button variant="outline" onClick={() => setDraft(emptyDraft())}>
          <Plus className="h-4 w-4" />
          Add service
        </Button>
      ) : null}

      <Dialog open={draft !== null} onOpenChange={(open) => (open ? null : setDraft(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit service" : "New service"}</DialogTitle>
            <DialogDescription>Duration includes the time the provider is booked for.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="service-name">Name</Label>
                <Input
                  id="service-name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="service-description">Description</Label>
                <Textarea
                  id="service-description"
                  rows={2}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="service-duration">Duration (minutes)</Label>
                  <Input
                    id="service-duration"
                    type="number"
                    min={5}
                    step={5}
                    value={draft.durationMinutes}
                    onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="service-price">Price</Label>
                  <Input
                    id="service-price"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={draft.price}
                    onChange={(event) => setDraft({ ...draft, price: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="service-buffer-before">Buffer before (min)</Label>
                  <Input
                    id="service-buffer-before"
                    type="number"
                    min={0}
                    step={5}
                    value={draft.bufferBeforeMinutes}
                    onChange={(event) => setDraft({ ...draft, bufferBeforeMinutes: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="service-buffer-after">Buffer after (min)</Label>
                  <Input
                    id="service-buffer-after"
                    type="number"
                    min={0}
                    step={5}
                    value={draft.bufferAfterMinutes}
                    onChange={(event) => setDraft({ ...draft, bufferAfterMinutes: event.target.value })}
                  />
                </div>
              </div>
              {showProviders ? (
                <div className="space-y-2">
                  <Label>Providers offering this service</Label>
                  <CheckboxList
                    options={providers.map((provider) => ({
                      id: provider.id,
                      label: provider.name,
                      hint: provider.title ?? undefined,
                    }))}
                    selected={draft.providerIds}
                    onChange={(providerIds) => setDraft({ ...draft, providerIds })}
                    emptyText="Add providers first, then assign them here."
                  />
                </div>
              ) : null}
              <div className="flex items-center gap-3">
                <Switch
                  id="service-active"
                  checked={draft.active}
                  onCheckedChange={(checked) => setDraft({ ...draft, active: checked })}
                />
                <Label htmlFor="service-active">Bookable</Label>
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
