"use client";

import * as React from "react";
import { api, errorMessage, query } from "@/lib/api";
import type {
  Booking,
  ConversationStatus,
  Me,
  Org,
  QuickReply,
  SimulatorReply,
  VerticalPackSummary,
} from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/components/ui/toast";
import { ControlPanel } from "./control-panel";
import type { ReminderKind } from "./control-panel";
import { PhoneFrame } from "./phone-frame";
import {
  DEFAULT_DISPLAY_NAME,
  DEFAULT_PHONE,
  hasConversation,
  normalizePhone,
  zonedTime,
} from "./lib";
import type { Bubble, SimulatorConversation } from "./lib";

const HUMAN_POLL_MS = 4000;

export function DemoView({ orgId }: { orgId: string }) {
  const { toast } = useToast();

  const [org, setOrg] = React.useState<Org | null>(null);
  const [me, setMe] = React.useState<Me | null>(null);
  const [samples, setSamples] = React.useState<string[]>([]);

  const [phoneInput, setPhoneInput] = React.useState(DEFAULT_PHONE);
  const [displayName, setDisplayName] = React.useState(DEFAULT_DISPLAY_NAME);
  const [activePhone, setActivePhone] = React.useState(normalizePhone(DEFAULT_PHONE));

  const [bubbles, setBubbles] = React.useState<Bubble[]>([]);
  const [pending, setPending] = React.useState<Bubble[]>([]);
  const [typing, setTyping] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<ConversationStatus | null>(null);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const timezone = org?.timezone ?? null;
  const businessName = org?.name ?? "Your business";

  /* One-off loads. -------------------------------------------------------- */
  React.useEffect(() => {
    let cancelled = false;
    api
      .get<Org>(`/orgs/${orgId}`)
      .then((result) => !cancelled && setOrg(result))
      .catch((err) => !cancelled && setError(errorMessage(err, "Could not load the business")));
    api
      .get<Me>("/auth/me")
      .then((result) => !cancelled && setMe(result))
      .catch(() => undefined);
    api
      .get<VerticalPackSummary>(`/orgs/${orgId}/vertical-pack`)
      .then((pack) => !cancelled && setSamples(pack.sampleCustomerMessages ?? []))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  /* Transcript. ----------------------------------------------------------- */
  const loadTranscript = React.useCallback(
    async (phone: string) => {
      if (!phone) return;
      const result = await api.get<SimulatorConversation>(
        `/orgs/${orgId}/simulator/conversation${query({ phoneE164: phone })}`,
      );
      if (!hasConversation(result)) {
        setBubbles([]);
        setBookings([]);
        setStatus(null);
        setConversationId(null);
        return;
      }
      setBubbles(
        result.messages
          .filter((message) => message.role !== "TOOL")
          .map((message) => {
            const time = zonedTime(message.createdAt, timezone);
            if (message.role === "USER") {
              return { id: message.id, side: "customer", text: message.text, time } satisfies Bubble;
            }
            return {
              id: message.id,
              side: "business",
              text: message.text,
              time,
              label:
                message.role === "STAFF"
                  ? ("Staff" as const)
                  : message.role === "SYSTEM"
                    ? ("template" as const)
                    : undefined,
              templateName: message.templateName ?? null,
              buttons: message.buttons,
            } satisfies Bubble;
          }),
      );
      setBookings(result.bookings ?? []);
      setStatus(result.conversation.status);
      setConversationId(result.conversation.id);
    },
    [orgId, timezone],
  );

  /* Debounce the phone box, then restore that customer's transcript. ------ */
  React.useEffect(() => {
    const handle = window.setTimeout(() => setActivePhone(normalizePhone(phoneInput)), 400);
    return () => window.clearTimeout(handle);
  }, [phoneInput]);

  React.useEffect(() => {
    if (!activePhone) return;
    setPending([]);
    setTyping(false);
    loadTranscript(activePhone).catch((err) =>
      setError(errorMessage(err, "Could not load the conversation")),
    );
  }, [activePhone, loadTranscript]);

  /* Live staff replies while a human has taken over. ---------------------- */
  React.useEffect(() => {
    if (status !== "HUMAN" || !activePhone) return;
    const handle = window.setInterval(() => {
      loadTranscript(activePhone).catch(() => undefined);
    }, HUMAN_POLL_MS);
    return () => window.clearInterval(handle);
  }, [status, activePhone, loadTranscript]);

  /* Sending. -------------------------------------------------------------- */
  const send = React.useCallback(
    async (text: string, buttonId?: string) => {
      const phone = normalizePhone(phoneInput);
      if (!phone) {
        toast({ title: "Enter a customer phone number first", variant: "destructive" });
        return;
      }
      setActivePhone(phone);
      setError(null);
      setBusy(true);
      setTyping(true);
      setPending([
        {
          id: `pending-${Date.now()}`,
          side: "customer",
          text,
          time: zonedTime(new Date().toISOString(), timezone),
        },
      ]);
      try {
        const reply = await api.post<SimulatorReply>(`/orgs/${orgId}/simulator/messages`, {
          phoneE164: phone,
          text,
          buttonId,
          displayName: displayName.trim() || undefined,
        });
        setStatus(reply.status);
        setConversationId(reply.conversationId);
        await loadTranscript(phone);
      } catch (err) {
        setError(errorMessage(err, "Could not send the message"));
      } finally {
        setPending([]);
        setTyping(false);
        setBusy(false);
      }
    },
    [orgId, phoneInput, displayName, timezone, loadTranscript, toast],
  );

  async function reset() {
    const phone = normalizePhone(phoneInput);
    if (!phone) return;
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/simulator/reset`, { phoneE164: phone });
      setBubbles([]);
      setPending([]);
      setBookings([]);
      setStatus(null);
      setConversationId(null);
      setError(null);
    } catch (err) {
      toast({ title: "Could not reset", description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function sendReminder(bookingId: string, kind: ReminderKind) {
    const phone = normalizePhone(phoneInput);
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/simulator/send-reminder`, { bookingId, kind });
      await loadTranscript(phone);
    } catch (err) {
      toast({
        title: "Could not send the reminder",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  const visibleBubbles = React.useMemo(() => [...bubbles, ...pending], [bubbles, pending]);
  // A closed conversation reopens on the customer's next message, so only block while in flight.
  const chatDisabled = busy;

  return (
    <div>
      <PageHeader
        eyebrow="Demo chat"
        title="See your receptionist in action"
        description="A live WhatsApp conversation with your receptionist. Everything here is real: bookings, reminders and handoffs all land in the Inbox."
      />

      {error ? (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-600/15">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="order-1 animate-fade-in-up">
          <PhoneFrame
            businessName={businessName}
            bubbles={visibleBubbles}
            typing={typing}
            disabled={chatDisabled}
            disabledNote="Sending…"
            onSend={(text) => void send(text)}
            onQuickReply={(button: QuickReply) => void send(button.title, button.id)}
          />
        </div>

        <div className="order-2">
          <ControlPanel
            orgId={orgId}
            me={me}
            phone={phoneInput}
            onPhoneChange={setPhoneInput}
            displayName={displayName}
            onDisplayNameChange={setDisplayName}
            samples={samples}
            onSample={(text) => void send(text)}
            status={status}
            conversationId={conversationId}
            bookings={bookings}
            timezone={timezone}
            busy={busy}
            onReset={() => void reset()}
            onSendReminder={(bookingId, kind) => void sendReminder(bookingId, kind)}
          />
        </div>
      </div>
    </div>
  );
}
