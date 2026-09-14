"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { BrandVoice, Org } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { SaveFooter, SettingsCard, useSavedFlag } from "./ui";

const TONES: { value: BrandVoice["tone"]; label: string; description: string }[] = [
  { value: "friendly", label: "Friendly", description: "Warm and casual, first names, light emoji." },
  { value: "professional", label: "Professional", description: "Polished and neutral, no slang." },
  { value: "warm", label: "Warm", description: "Reassuring and personal, good for clinics." },
  { value: "concise", label: "Concise", description: "Short answers, straight to the times." },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "ar", label: "Arabic" },
  { value: "ur", label: "Urdu" },
];

export function BrandVoiceTab({ org, onSaved }: { org: Org; onSaved: (org: Org) => void }) {
  const { toast } = useToast();
  const voice = org.brandVoice;
  const [tone, setTone] = React.useState<BrandVoice["tone"]>(voice?.tone ?? "friendly");
  const [assistantName, setAssistantName] = React.useState(voice?.assistantName ?? "Receptionist");
  const [greeting, setGreeting] = React.useState(voice?.greeting ?? "");
  const [signoff, setSignoff] = React.useState(voice?.signoff ?? "");
  const [defaultLanguage, setDefaultLanguage] = React.useState(voice?.defaultLanguage ?? "en");
  const [extraInstructions, setExtraInstructions] = React.useState(voice?.extraInstructions ?? "");
  const [saving, setSaving] = React.useState(false);
  const [saved, markSaved] = useSavedFlag();

  async function save() {
    setSaving(true);
    try {
      const updated = await api.patch<Org>(`/orgs/${org.id}`, {
        brandVoice: {
          ...voice,
          tone,
          assistantName,
          greeting,
          signoff,
          defaultLanguage,
          extraInstructions,
        },
      });
      onSaved(updated);
      markSaved();
      toast({ title: "Brand voice saved", variant: "success" });
    } catch (err) {
      toast({ title: "Could not save", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard
      title="Brand voice"
      description="How the assistant sounds to your customers."
      footer={<SaveFooter saving={saving} saved={saved} onSave={() => void save()} />}
    >
      <div className="space-y-2.5">
        <Label>Tone</Label>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {TONES.map((option) => {
            const selected = tone === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setTone(option.value)}
                className={cn(
                  "relative rounded-xl border p-3.5 text-left transition-all duration-150",
                  selected
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border/70 bg-card hover:border-primary/40 hover:shadow-card",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cn("text-sm font-bold tracking-tight", selected && "text-primary")}>
                    {option.label}
                  </span>
                  {selected ? (
                    <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-[12px] leading-snug text-muted-foreground">{option.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="voice-assistant-name">Assistant name</Label>
          <Input
            id="voice-assistant-name"
            value={assistantName}
            onChange={(event) => setAssistantName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="voice-language">Default language</Label>
          <Select value={defaultLanguage} onValueChange={setDefaultLanguage}>
            <SelectTrigger id="voice-language" className="h-10 rounded-lg bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((language) => (
                <SelectItem key={language.value} value={language.value}>
                  {language.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="voice-greeting">Greeting</Label>
        <Input
          id="voice-greeting"
          placeholder="Hi! Thanks for messaging Bright Smile Dental."
          value={greeting}
          onChange={(event) => setGreeting(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="voice-signoff">Sign-off</Label>
        <Input
          id="voice-signoff"
          placeholder="See you soon!"
          value={signoff}
          onChange={(event) => setSignoff(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="voice-extra">Extra instructions</Label>
        <Textarea
          id="voice-extra"
          rows={4}
          placeholder="Never mention competitors. Always confirm the customer's name."
          value={extraInstructions}
          onChange={(event) => setExtraInstructions(event.target.value)}
        />
      </div>
    </SettingsCard>
  );
}
