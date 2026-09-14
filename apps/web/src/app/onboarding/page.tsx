"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bone,
  Hand,
  Check,
  LoaderCircle,
  MessageCircle,
  PawPrint,
  Scissors,
  Smile,
  Sparkles,
  Stethoscope,
  Store,
} from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/session";
import { browserTimezone, normalizeWeeklyHours, timezoneOptions } from "@/lib/time";
import type { Org, VerticalPackSummary, WeeklyHour } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { WeeklyHoursEditor, weeklyHoursAreValid } from "@/components/settings/business-hours-editor";
import { FaqsEditor } from "@/components/settings/faqs-editor";
import { ProvidersEditor } from "@/components/settings/providers-editor";
import { ServicesEditor } from "@/components/settings/services-editor";

const STEPS = ["Vertical", "Business", "Services & hours", "Providers", "WhatsApp"] as const;

const VERTICAL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  DENTAL: Smile,
  CLINIC: Stethoscope,
  SALON: Scissors,
  PHYSIO: Activity,
  VET: PawPrint,
  NAILSPA: Hand,
  CHIRO: Bone,
};

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { me, loading: meLoading, unauthenticated } = useMe();

  const [step, setStep] = React.useState(0);
  const [packs, setPacks] = React.useState<VerticalPackSummary[] | null>(null);
  const [packsError, setPacksError] = React.useState<string | null>(null);
  const [selectedVertical, setSelectedVertical] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [timezone, setTimezone] = React.useState<string>(browserTimezone());
  const [org, setOrg] = React.useState<Org | null>(null);
  const [hours, setHours] = React.useState<WeeklyHour[]>([]);
  const [providerCount, setProviderCount] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  const [waChoice, setWaChoice] = React.useState<"connect" | null>(null);
  const [waPhoneNumberId, setWaPhoneNumberId] = React.useState("");
  const [waAccessToken, setWaAccessToken] = React.useState("");
  const [waDisplayPhone, setWaDisplayPhone] = React.useState("");

  React.useEffect(() => {
    if (unauthenticated) router.replace("/login");
  }, [unauthenticated, router]);

  React.useEffect(() => {
    let cancelled = false;
    api
      .get<VerticalPackSummary[]>("/verticals")
      .then((rows) => {
        if (!cancelled) setPacks(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPacks([]);
          setPacksError(errorMessage(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPack = packs?.find((pack) => pack.id === selectedVertical) ?? null;

  async function createOrg() {
    if (!selectedVertical || !name.trim()) return;
    setBusy(true);
    try {
      const created = await api.post<Org>("/orgs", {
        name: name.trim(),
        vertical: selectedVertical,
        timezone,
      });
      setOrg(created);
      const businessHours = normalizeWeeklyHours(created.businessHours);
      setHours(
        businessHours.length
          ? businessHours
          : normalizeWeeklyHours(selectedPack?.defaultHours ?? []),
      );
      setStep(2);
    } catch (err) {
      toast({ title: "Could not create the business", description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function saveHoursAndContinue() {
    if (!org) return;
    if (!weeklyHoursAreValid(hours)) {
      toast({ title: "Check the opening hours", description: "Each open day must end after it starts.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await api.patch<Org>(`/orgs/${org.id}`, { businessHours: hours });
      setStep(3);
    } catch (err) {
      toast({ title: "Could not save the hours", description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function finish(withWhatsApp: boolean) {
    if (!org) return;
    setBusy(true);
    try {
      if (withWhatsApp) {
        if (!waPhoneNumberId.trim() || !waAccessToken.trim()) {
          toast({ title: "Phone number ID and access token are required", variant: "destructive" });
          setBusy(false);
          return;
        }
        await api.patch<Org>(`/orgs/${org.id}`, {
          whatsappConfig: {
            phoneNumberId: waPhoneNumberId.trim(),
            accessToken: waAccessToken.trim(),
            displayPhone: waDisplayPhone.trim() || undefined,
          },
        });
      }
      await api.patch<Org>(`/orgs/${org.id}`, { onboarded: true });
      router.replace(`/o/${org.id}/demo`);
      router.refresh();
    } catch (err) {
      toast({ title: "Could not finish setup", description: errorMessage(err), variant: "destructive" });
      setBusy(false);
    }
  }

  if (meLoading && !me) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-4 h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-background py-10">
      <div className="mx-auto max-w-3xl px-4">
        {/* Header ---------------------------------------------------------- */}
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Setup</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-[28px]">Set up your receptionist</h1>
          <p className="mx-auto mt-1.5 max-w-lg text-sm text-muted-foreground">
            Five short steps. You can change everything later in Settings.
          </p>
        </div>

        {/* Progress -------------------------------------------------------- */}
        <div className="mt-7">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <ol className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            {STEPS.map((label, index) => {
              const done = index < step;
              const current = index === step;
              return (
                <li key={label} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                      done
                        ? "bg-primary text-primary-foreground"
                        : current
                          ? "bg-primary/12 text-primary ring-2 ring-primary/30"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : index + 1}
                  </span>
                  <span
                    className={cn(
                      "text-[12px]",
                      current ? "font-bold tracking-tight text-foreground" : "font-medium text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mt-6">
          {step === 0 ? (
            <StepVertical
              packs={packs}
              error={packsError}
              selected={selectedVertical}
              onSelect={(vertical) => {
                setSelectedVertical(vertical);
                setStep(1);
              }}
            />
          ) : null}

          {step === 1 ? (
            <StepCard
              title="About the business"
              description={
                selectedPack ? `${selectedPack.displayName} · ${selectedPack.tagline}` : "Name it and pick a timezone."
              }
              footer={
                <>
                  <Button variant="ghost" onClick={() => setStep(0)} disabled={busy}>
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button onClick={() => void createOrg()} disabled={busy || !name.trim()}>
                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                    Create business
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </>
              }
            >
              <div className="space-y-2">
                <Label htmlFor="org-name">Business name</Label>
                <Input
                  id="org-name"
                  autoFocus
                  value={name}
                  placeholder="Bright Smile Dental"
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-timezone">Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger id="org-timezone" className="h-10 rounded-lg bg-card">
                    <SelectValue placeholder="Pick a timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {timezoneOptions(timezone).map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">All appointment times are shown in this timezone.</p>
              </div>
            </StepCard>
          ) : null}

          {step === 2 && org ? (
            <div className="space-y-4">
              <StepCard
                title="Services"
                description={`Prefilled from the ${org.vertical.toLowerCase()} pack. Edit what does not fit.`}
              >
                <ServicesEditor orgId={org.id} showProviders={false} />
              </StepCard>

              <StepCard title="Opening hours" description="New providers start with these hours.">
                <WeeklyHoursEditor value={hours} onChange={setHours} idPrefix="onboarding-hours" />
              </StepCard>

              <StepCard
                title="FAQs"
                description="The assistant answers from these before anything else."
                footer={
                  <Button onClick={() => void saveHoursAndContinue()} disabled={busy}>
                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                }
              >
                <FaqsEditor orgId={org.id} />
              </StepCard>
            </div>
          ) : null}

          {step === 3 && org ? (
            <StepCard
              title="Who takes the appointments?"
              description="Add at least one person. They get the opening hours and every service by default."
              footer={
                <>
                  <Button variant="ghost" onClick={() => setStep(2)} disabled={busy}>
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <div className="flex items-center gap-3">
                    {providerCount === 0 ? (
                      <span className="text-xs text-muted-foreground">Add a provider to continue.</span>
                    ) : null}
                    <Button onClick={() => setStep(4)} disabled={providerCount === 0}>
                      Next
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              }
            >
              <ProvidersEditor
                orgId={org.id}
                defaultWorkingHours={hours}
                onChanged={(providers) => setProviderCount(providers.length)}
              />
            </StepCard>
          ) : null}

          {step === 4 && org ? (
            <div className="space-y-4">
              <StepCard
                title="Last step — how do you want to answer customers?"
                description="You can connect WhatsApp now, or start with the built-in simulator and connect later."
                footer={
                  <Button variant="ghost" onClick={() => setStep(3)} disabled={busy}>
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setWaChoice(waChoice === "connect" ? null : "connect")}
                    aria-pressed={waChoice === "connect"}
                    className={cn(
                      "rounded-2xl border p-5 text-left transition-all duration-150",
                      waChoice === "connect"
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border/70 bg-card hover:border-primary/40 hover:shadow-card-hover",
                    )}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <MessageCircle className="h-5 w-5" />
                    </span>
                    <span className="mt-3 block text-sm font-bold tracking-tight">Connect WhatsApp</span>
                    <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">
                      Answer on your real WhatsApp Business number. Needs credentials from the Meta app.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void finish(false)}
                    disabled={busy}
                    className="rounded-2xl border border-primary bg-primary p-5 text-left text-primary-foreground shadow-sm shadow-primary/25 transition-all duration-150 hover:shadow-md hover:shadow-primary/30 disabled:pointer-events-none disabled:opacity-60"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <span className="mt-3 flex items-center gap-2 text-sm font-bold tracking-tight">
                      Skip, use the simulator
                      {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                    </span>
                    <span className="mt-1 block text-[13px] leading-snug text-primary-foreground/80">
                      Books real appointments end to end without any Meta credentials. Recommended to start.
                    </span>
                  </button>
                </div>

                {waChoice === "connect" ? (
                  <div className="animate-fade-in-up space-y-4 rounded-xl border border-border/70 bg-muted/25 p-4">
                    <div className="space-y-2">
                      <Label htmlFor="wa-phone-number-id">Phone number ID</Label>
                      <Input
                        id="wa-phone-number-id"
                        value={waPhoneNumberId}
                        onChange={(event) => setWaPhoneNumberId(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="wa-access-token">Access token</Label>
                      <Input
                        id="wa-access-token"
                        type="password"
                        value={waAccessToken}
                        onChange={(event) => setWaAccessToken(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="wa-display-phone">Display phone number</Label>
                      <Input
                        id="wa-display-phone"
                        placeholder="+1 555 010 0000"
                        value={waDisplayPhone}
                        onChange={(event) => setWaDisplayPhone(event.target.value)}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={() => void finish(true)} disabled={busy}>
                        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                        Connect and finish
                      </Button>
                    </div>
                  </div>
                ) : null}
              </StepCard>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** One step of the tour: a card with a title, a description and its own footer. */
function StepCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="animate-fade-in-up overflow-hidden">
      <div className="border-b border-border/70 px-5 py-4">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      <div className="space-y-4 p-5">{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/70 bg-muted/25 px-5 py-3.5 [&>*:first-child]:mr-auto">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}

function StepVertical({
  packs,
  error,
  selected,
  onSelect,
}: {
  packs: VerticalPackSummary[] | null;
  error: string | null;
  selected: string | null;
  onSelect: (vertical: string) => void;
}) {
  if (packs === null) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (packs.length === 0) {
    return (
      <StepCard title="No business types available" description={error ?? "The API returned an empty list."}>
        <p className="text-sm text-muted-foreground">Start the API and reload this page.</p>
      </StepCard>
    );
  }

  return (
    <div className="animate-fade-in-up grid gap-3 sm:grid-cols-2">
      {packs.map((pack) => {
        const Icon = VERTICAL_ICONS[pack.id] ?? Store;
        const isSelected = selected === pack.id;
        const examples = (pack.defaultServices ?? [])
          .slice(0, 2)
          .map((service) => service.name)
          .join(" · ");
        return (
          <button
            key={pack.id}
            type="button"
            onClick={() => onSelect(pack.id)}
            className={cn(
              "rounded-2xl border bg-card p-5 text-left transition-all duration-150",
              isSelected
                ? "border-primary ring-2 ring-primary/25 shadow-card-hover"
                : "border-border/70 shadow-card hover:border-primary/40 hover:shadow-card-hover",
            )}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <span className="mt-3.5 block text-sm font-bold tracking-tight">{pack.displayName}</span>
            <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">{pack.tagline}</span>
            {examples ? (
              <span className="mt-3 block text-[12px] text-muted-foreground/80">e.g. {examples}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
