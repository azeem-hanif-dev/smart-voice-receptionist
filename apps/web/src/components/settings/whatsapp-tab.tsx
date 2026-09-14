"use client";

import * as React from "react";
import { BookOpen, MessageCircle, Send } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Org } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { SaveFooter, SettingsCard, useSavedFlag } from "./ui";

export function WhatsAppTab({ org, onSaved }: { org: Org; onSaved: (org: Org) => void }) {
  const { toast } = useToast();
  const config = org.whatsappConfig;
  const [phoneNumberId, setPhoneNumberId] = React.useState(config?.phoneNumberId ?? "");
  const [accessToken, setAccessToken] = React.useState("");
  const [displayPhone, setDisplayPhone] = React.useState(config?.displayPhone ?? "");
  const [testTo, setTestTo] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [saved, markSaved] = useSavedFlag();

  const connected = Boolean(org.whatsappConnected);

  async function save() {
    if (!phoneNumberId.trim()) {
      toast({ title: "A phone number ID is required", variant: "destructive" });
      return;
    }
    if (!accessToken.trim() && !org.whatsappConnected) {
      toast({ title: "An access token is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // The API masks the stored token, so never echo it back: only send a token that was typed here.
      const whatsappConfig: Record<string, string | undefined> = {
        phoneNumberId: phoneNumberId.trim(),
        displayPhone: displayPhone.trim() || undefined,
      };
      if (accessToken.trim()) whatsappConfig.accessToken = accessToken.trim();
      const updated = await api.patch<Org>(`/orgs/${org.id}`, { whatsappConfig });
      onSaved(updated);
      setAccessToken("");
      markSaved();
      toast({ title: "WhatsApp settings saved", variant: "success" });
    } catch (err) {
      toast({ title: "Could not save", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect WhatsApp? Incoming messages will stop being answered.")) return;
    setSaving(true);
    try {
      const updated = await api.patch<Org>(`/orgs/${org.id}`, { whatsappConfig: null });
      onSaved(updated);
      setPhoneNumberId("");
      setAccessToken("");
      setDisplayPhone("");
      toast({ title: "WhatsApp disconnected" });
    } catch (err) {
      toast({ title: "Could not disconnect", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!testTo.trim()) {
      toast({ title: "Enter a phone number in E.164 format", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      await api.post(`/orgs/${org.id}/whatsapp/test-message`, { to: testTo.trim() });
      toast({ title: "Test message sent", description: `Sent to ${testTo.trim()}`, variant: "success" });
    } catch (err) {
      toast({ title: "Could not send the test message", description: errorMessage(err), variant: "destructive" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Connection status ------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-card">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            connected ? "bg-emerald-50 text-emerald-600" : "bg-muted text-muted-foreground",
          )}
        >
          <MessageCircle className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold tracking-tight">
            <span
              className={cn("h-2 w-2 rounded-full", connected ? "bg-emerald-500" : "bg-slate-300")}
              aria-hidden="true"
            />
            {connected ? "Connected" : "Not connected"}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {connected
              ? `Answering on ${config?.displayPhone || "your WhatsApp Business number"}.`
              : "The built-in simulator still books real appointments without Meta credentials."}
          </p>
        </div>
        {connected ? (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => void disconnect()} disabled={saving}>
            Disconnect
          </Button>
        ) : null}
      </div>

      {/* Credentials ------------------------------------------------------- */}
      <SettingsCard
        title="WhatsApp credentials"
        description="From the Meta app for your WhatsApp Business number."
        footer={<SaveFooter saving={saving} saved={saved} onSave={() => void save()} label="Save" />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wa-settings-phone-id">Phone number ID</Label>
            <Input
              id="wa-settings-phone-id"
              value={phoneNumberId}
              onChange={(event) => setPhoneNumberId(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa-settings-display">Display phone number</Label>
            <Input
              id="wa-settings-display"
              placeholder="+1 555 010 0000"
              value={displayPhone}
              onChange={(event) => setDisplayPhone(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wa-settings-token">Access token</Label>
          <Input
            id="wa-settings-token"
            type="password"
            placeholder={connected ? "Stored — type to replace" : ""}
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
          />
        </div>

        <div className="space-y-2 rounded-xl border border-border/70 bg-muted/25 p-4">
          <Label htmlFor="wa-test-to">Send a test message</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="wa-test-to"
              className="max-w-xs"
              placeholder="+15550100000"
              value={testTo}
              onChange={(event) => setTestTo(event.target.value)}
            />
            <Button variant="outline" onClick={() => void sendTest()} disabled={testing || !connected}>
              <Send className="h-4 w-4" />
              {testing ? "Sending..." : "Test message"}
            </Button>
          </div>
          {!connected ? (
            <p className="text-xs text-muted-foreground">Save your credentials first.</p>
          ) : null}
        </div>
      </SettingsCard>

      {/* Docs callout ------------------------------------------------------ */}
      <div className="flex items-start gap-3 rounded-2xl border border-sky-200/70 bg-sky-50/70 p-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
          <BookOpen className="h-4 w-4" />
        </span>
        <div className="min-w-0 text-[13px]">
          <p className="font-bold tracking-tight text-sky-900">Setting this up for the first time?</p>
          <p className="mt-0.5 text-sky-900/80">
            The step-by-step guide — Meta app, webhook URL, verify token — lives in{" "}
            <code className="rounded bg-sky-100 px-1.5 py-0.5 font-mono text-[12px]">docs/WHATSAPP_SETUP.md</code> in
            the repository.
          </p>
        </div>
      </div>
    </div>
  );
}
