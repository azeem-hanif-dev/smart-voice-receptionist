"use client";

import * as React from "react";
import { api, errorMessage } from "@/lib/api";
import type { BookingRules, Org } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { SaveFooter, SettingsCard, useSavedFlag } from "./ui";

const DEFAULTS: BookingRules = {
  minLeadMinutes: 120,
  maxAdvanceDays: 60,
  slotGranularityMinutes: 30,
  cancellationCutoffHours: 24,
  reminderOffsetsMinutes: [1440, 120],
  allowAnyProvider: true,
  slotsToOffer: 3,
};

export function BookingRulesTab({ org, onSaved }: { org: Org; onSaved: (org: Org) => void }) {
  const { toast } = useToast();
  const rules = { ...DEFAULTS, ...(org.bookingRules ?? {}) };
  const [minLeadMinutes, setMinLeadMinutes] = React.useState(String(rules.minLeadMinutes));
  const [maxAdvanceDays, setMaxAdvanceDays] = React.useState(String(rules.maxAdvanceDays));
  const [slotGranularityMinutes, setSlotGranularityMinutes] = React.useState(String(rules.slotGranularityMinutes));
  const [cancellationCutoffHours, setCancellationCutoffHours] = React.useState(String(rules.cancellationCutoffHours));
  const [firstReminder, setFirstReminder] = React.useState(String(rules.reminderOffsetsMinutes?.[0] ?? 1440));
  const [secondReminder, setSecondReminder] = React.useState(String(rules.reminderOffsetsMinutes?.[1] ?? 120));
  const [allowAnyProvider, setAllowAnyProvider] = React.useState(rules.allowAnyProvider);
  const [slotsToOffer, setSlotsToOffer] = React.useState(String(rules.slotsToOffer));
  const [saving, setSaving] = React.useState(false);
  const [saved, markSaved] = useSavedFlag();

  async function save() {
    const offsets = [Number(firstReminder), Number(secondReminder)].filter(
      (value) => Number.isFinite(value) && value >= 5,
    );
    const body: BookingRules = {
      minLeadMinutes: Number(minLeadMinutes) || 0,
      maxAdvanceDays: Number(maxAdvanceDays) || 1,
      slotGranularityMinutes: Number(slotGranularityMinutes) || 30,
      cancellationCutoffHours: Number(cancellationCutoffHours) || 0,
      reminderOffsetsMinutes: offsets,
      allowAnyProvider,
      slotsToOffer: Number(slotsToOffer) || 3,
    };
    setSaving(true);
    try {
      const updated = await api.patch<Org>(`/orgs/${org.id}`, { bookingRules: body });
      onSaved(updated);
      markSaved();
      toast({ title: "Booking rules saved", variant: "success" });
    } catch (err) {
      toast({ title: "Could not save", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="Booking rules"
      description="How the assistant offers and confirms appointments."
      footer={<SaveFooter saving={saving} saved={saved} onSave={() => void save()} />}
    >
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="rules-lead"
            label="Minimum lead time (minutes)"
            hint="Earliest a customer may book from now."
            value={minLeadMinutes}
            onChange={setMinLeadMinutes}
            min={0}
          />
          <NumberField
            id="rules-advance"
            label="Maximum advance (days)"
            hint="Furthest ahead a customer may book."
            value={maxAdvanceDays}
            onChange={setMaxAdvanceDays}
            min={1}
            max={365}
          />
          <NumberField
            id="rules-granularity"
            label="Slot granularity (minutes)"
            hint="Slots align to this grid on the local clock."
            value={slotGranularityMinutes}
            onChange={setSlotGranularityMinutes}
            min={5}
            max={120}
            step={5}
          />
          <NumberField
            id="rules-cutoff"
            label="Cancellation cutoff (hours)"
            hint="Customers may cancel or reschedule up to this long before."
            value={cancellationCutoffHours}
            onChange={setCancellationCutoffHours}
            min={0}
          />
          <NumberField
            id="rules-reminder-1"
            label="First reminder (minutes before)"
            value={firstReminder}
            onChange={setFirstReminder}
            min={5}
          />
          <NumberField
            id="rules-reminder-2"
            label="Second reminder (minutes before)"
            value={secondReminder}
            onChange={setSecondReminder}
            min={5}
          />
          <NumberField
            id="rules-slots"
            label="Slots offered at once"
            value={slotsToOffer}
            onChange={setSlotsToOffer}
            min={2}
            max={4}
          />
        </div>

      <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/25 p-4">
        <Switch id="rules-any-provider" checked={allowAnyProvider} onCheckedChange={setAllowAnyProvider} />
        <Label htmlFor="rules-any-provider" className="text-[13px] font-medium leading-snug">
          Let the assistant pick a provider when the customer has no preference
        </Label>
      </div>
    </SettingsCard>
  );
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
