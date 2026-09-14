"use client";

import * as React from "react";
import { ArrowLeft, PanelRight, Send } from "lucide-react";
import type { ConversationDetail, Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChannelIcon, ContactAvatar, StatusPill } from "./conversation-list";
import { contactLabel, prettyPhone, zonedDayLabel, zonedTime } from "./lib";

/** Faint dot pattern over the warm thread surface. Inlined so nothing is fetched. */
const THREAD_PATTERN =
  "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cg fill='%23a1907a' fill-opacity='0.16'%3E%3Ccircle cx='4' cy='4' r='1.1'/%3E%3Ccircle cx='18' cy='18' r='1.1'/%3E%3C/g%3E%3C/svg%3E\")";

interface ThreadProps {
  detail: ConversationDetail;
  timezone: string | null;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onToggleContext: () => void;
  onTakeover: () => void;
  onHandback: () => void;
  onClose: () => void;
  onSend: (text: string) => Promise<void>;
}

export function MessageThread({
  detail,
  timezone,
  busy,
  error,
  onBack,
  onToggleContext,
  onTakeover,
  onHandback,
  onClose,
  onSend,
}: ThreadProps) {
  const { conversation, messages } = detail;
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const lastMessageId = messages.length ? messages[messages.length - 1].id : null;

  // Jump to the newest message when the conversation opens and whenever one arrives.
  React.useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [conversation.id, lastMessageId, messages.length]);

  const closed = conversation.status === "CLOSED";

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || sending || closed) return;
    setSending(true);
    try {
      await onSend(trimmed);
      setText("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border/70 bg-card/90 px-4 py-3 backdrop-blur-sm">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onBack} aria-label="Back to list">
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <ContactAvatar
          id={conversation.contact.id}
          name={conversation.contact.name}
          phone={conversation.contact.phoneE164}
          className="hidden sm:flex"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold tracking-tight">
              {contactLabel(conversation.contact)}
            </span>
            <StatusPill status={conversation.status} />
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <ChannelIcon channel={conversation.channel} />
            <span className="tabular-nums">{prettyPhone(conversation.contact.phoneE164)}</span>
            {conversation.handoffReason ? (
              <span className="truncate text-amber-700">· {conversation.handoffReason}</span>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {conversation.status === "AI" ? (
            <Button size="sm" onClick={onTakeover} disabled={busy}>
              Take over
            </Button>
          ) : null}
          {conversation.status === "HUMAN" ? (
            <Button size="sm" variant="soft" onClick={onHandback} disabled={busy}>
              Hand back to AI
            </Button>
          ) : null}
          {!closed ? (
            <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
              Close
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="xl:hidden"
            onClick={onToggleContext}
            aria-label="Booking context"
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
        style={{ backgroundColor: "#f5f1ea", backgroundImage: THREAD_PATTERN }}
      >
        {messages.length === 0 ? (
          <p className="text-center text-sm text-slate-500">No messages in this conversation yet.</p>
        ) : null}
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {messages.map((message, index) => {
            const previous = index > 0 ? messages[index - 1] : null;
            const dayLabel = zonedDayLabel(message.createdAt, timezone);
            const showDay = !previous || zonedDayLabel(previous.createdAt, timezone) !== dayLabel;
            return (
              <React.Fragment key={message.id}>
                {showDay && dayLabel ? (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm ring-1 ring-inset ring-black/[0.04] backdrop-blur-sm">
                      {dayLabel}
                    </span>
                  </div>
                ) : null}
                <MessageBubble message={message} timezone={timezone} />
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border/70 bg-card p-4">
        {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
        {closed ? (
          <p className="rounded-xl bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground">
            This conversation is closed. The customer&apos;s next message reopens it.
          </p>
        ) : (
          <div className="space-y-2">
            {conversation.status === "AI" ? (
              <p className="text-[11px] font-medium text-amber-700">
                Sending a reply takes this conversation over from the AI.
              </p>
            ) : null}
            <div className="flex items-end gap-2 rounded-2xl border border-border/70 bg-card p-2 shadow-card transition-shadow focus-within:border-primary/40 focus-within:shadow-card-hover">
              <Textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                rows={2}
                placeholder="Write a reply… (Enter to send, Shift+Enter for a new line)"
                className="min-h-[44px] resize-none rounded-xl border-transparent bg-transparent shadow-none hover:border-transparent focus-visible:border-transparent focus-visible:ring-0"
                disabled={sending}
              />
              <Button
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full"
                onClick={() => void submit()}
                disabled={sending || !text.trim()}
                aria-label="Send"
                title={sending ? "Sending…" : "Send"}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message, timezone }: { message: Message; timezone: string | null }) {
  const time = zonedTime(message.createdAt, timezone);

  if (message.role === "SYSTEM") {
    return (
      <div className="my-1 flex flex-col items-center gap-1">
        <div className="max-w-[85%] rounded-2xl bg-white/70 px-4 py-2.5 text-center text-xs text-slate-600 shadow-sm ring-1 ring-inset ring-black/[0.04] backdrop-blur-sm">
          {message.templateName ? (
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Template · {message.templateName}
            </div>
          ) : null}
          <p className="whitespace-pre-wrap">{message.text}</p>
          <QuickReplyChips buttons={message.buttons} align="center" />
          <div className="mt-1 text-[10px] tabular-nums text-slate-400">{time}</div>
        </div>
      </div>
    );
  }

  const inbound = message.role === "USER";
  const staff = message.role === "STAFF";

  return (
    <div className={cn("flex", inbound ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-[14px] px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-inset",
          inbound && "rounded-bl-[4px] bg-white text-slate-900 ring-black/[0.04]",
          !inbound && staff && "rounded-br-[4px] bg-sky-50 text-sky-950 ring-sky-600/10",
          !inbound && !staff && "rounded-br-[4px] bg-emerald-50 text-teal-900 ring-emerald-600/10",
        )}
      >
        {staff ? (
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">Staff</div>
        ) : null}
        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.text}</p>
        <QuickReplyChips buttons={message.buttons} align={inbound ? "left" : "right"} />
        <div
          className={cn(
            "mt-1 text-[10px] tabular-nums opacity-60",
            inbound ? "text-left text-slate-500" : "text-right",
          )}
        >
          {time}
        </div>
      </div>
    </div>
  );
}

function QuickReplyChips({
  buttons,
  align,
}: {
  buttons: Message["buttons"];
  align: "left" | "right" | "center";
}) {
  if (!buttons?.length) return null;
  return (
    <div
      className={cn(
        "mt-2 flex flex-wrap gap-1.5",
        align === "right" && "justify-end",
        align === "center" && "justify-center",
      )}
    >
      {buttons.map((button) => (
        <span
          key={button.id}
          className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-black/[0.06]"
        >
          {button.title}
        </span>
      ))}
    </div>
  );
}
