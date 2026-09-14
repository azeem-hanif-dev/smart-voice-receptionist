"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  Building2,
  Clock,
  HelpCircle,
  ListChecks,
  Megaphone,
  MessageCircle,
  PhoneForwarded,
  Plug,
  SlidersHorizontal,
  UserRound,
  Users,
} from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Org } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingRulesTab } from "@/components/settings/booking-rules-tab";
import { BrandVoiceTab } from "@/components/settings/brand-voice-tab";
import { BusinessProfileTab } from "@/components/settings/business-profile-tab";
import { EscalationTab } from "@/components/settings/escalation-tab";
import { FaqsEditor } from "@/components/settings/faqs-editor";
import { HoursHolidaysTab } from "@/components/settings/hours-holidays-tab";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { ProvidersEditor } from "@/components/settings/providers-editor";
import { ServicesEditor } from "@/components/settings/services-editor";
import { SettingsCard } from "@/components/settings/ui";
import { TeamTab } from "@/components/settings/team-tab";
import { WhatsAppTab } from "@/components/settings/whatsapp-tab";
import { normalizeWeeklyHours } from "@/lib/time";

const TABS = [
  { value: "business", label: "Business profile", icon: Building2 },
  { value: "services", label: "Services", icon: ListChecks },
  { value: "providers", label: "Providers", icon: UserRound },
  { value: "hours", label: "Hours & holidays", icon: Clock },
  { value: "rules", label: "Booking rules", icon: SlidersHorizontal },
  { value: "faqs", label: "FAQs", icon: HelpCircle },
  { value: "voice", label: "Brand voice", icon: Megaphone },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "escalation", label: "Escalation", icon: PhoneForwarded },
  { value: "team", label: "Team", icon: Users },
  { value: "integrations", label: "Integrations", icon: Plug },
];

export default function SettingsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const [org, setOrg] = React.useState<Org | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setOrg(null);
    setError(null);
    api
      .get<Org>(`/orgs/${orgId}`)
      .then((result) => {
        if (!cancelled) setOrg(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Settings unavailable</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!org) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <Skeleton className="h-[26rem] w-full rounded-2xl" />
          <Skeleton className="h-[26rem] w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Configuration" title="Settings" description={`${org.name} · ${org.timezone}`} />

      <Tabs defaultValue="business" className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="mb-4 -mx-1 overflow-x-auto px-1 pb-2 lg:mx-0 lg:mb-0 lg:overflow-visible lg:px-0 lg:pb-0">
          <TabsList className="h-auto w-max gap-1 rounded-2xl bg-muted/60 p-1.5 lg:w-full lg:flex-col lg:items-stretch lg:border lg:border-border/70 lg:bg-card lg:p-2 lg:shadow-card">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="group relative justify-start gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-muted-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none lg:w-full"
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary lg:group-data-[state=active]:block"
                  />
                  <Icon className="h-4 w-4 shrink-0" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <div className="min-w-0">
          <TabsContent value="business" className="mt-0 animate-fade-in-up">
            <BusinessProfileTab org={org} onSaved={setOrg} />
          </TabsContent>

          <TabsContent value="services" className="mt-0 animate-fade-in-up">
            <SettingsCard title="Services" description="What customers can book, how long each one takes.">
              <ServicesEditor orgId={org.id} />
            </SettingsCard>
          </TabsContent>

          <TabsContent value="providers" className="mt-0 animate-fade-in-up">
            <SettingsCard title="Providers" description="The people appointments are booked with.">
              <ProvidersEditor orgId={org.id} defaultWorkingHours={normalizeWeeklyHours(org.businessHours)} />
            </SettingsCard>
          </TabsContent>

          <TabsContent value="hours" className="mt-0 animate-fade-in-up">
            <HoursHolidaysTab org={org} />
          </TabsContent>

          <TabsContent value="rules" className="mt-0 animate-fade-in-up">
            <BookingRulesTab org={org} onSaved={setOrg} />
          </TabsContent>

          <TabsContent value="faqs" className="mt-0 animate-fade-in-up">
            <SettingsCard title="FAQs" description="The assistant answers from these before anything else.">
              <FaqsEditor orgId={org.id} />
            </SettingsCard>
          </TabsContent>

          <TabsContent value="voice" className="mt-0 animate-fade-in-up">
            <BrandVoiceTab org={org} onSaved={setOrg} />
          </TabsContent>

          <TabsContent value="whatsapp" className="mt-0 animate-fade-in-up">
            <WhatsAppTab org={org} onSaved={setOrg} />
          </TabsContent>

          <TabsContent value="escalation" className="mt-0 animate-fade-in-up">
            <EscalationTab org={org} onSaved={setOrg} />
          </TabsContent>

          <TabsContent value="team" className="mt-0 animate-fade-in-up">
            <TeamTab org={org} />
          </TabsContent>

          <TabsContent value="integrations" className="mt-0 animate-fade-in-up">
            <IntegrationsTab org={org} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
