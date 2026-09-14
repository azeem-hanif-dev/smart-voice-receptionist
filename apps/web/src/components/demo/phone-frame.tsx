"use client";

import * as React from "react";
import { CheckCheck, SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuickReply } from "@/lib/types";
import type { Bubble } from "./lib";

/** Subtle WhatsApp-ish wallpaper, inlined so nothing is fetched at runtime. */
const WALLPAPER =
  "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='42' height='42' viewBox='0 0 42 42'%3E%3Cg fill='none' stroke='%23d8cdbd' stroke-width='1' stroke-linecap='round' opacity='0.55'%3E%3Cpath d='M6 10c2-3 5-3 7 0'/%3E%3Cpath d='M27 30c2-3 5-3 7 0'/%3E%3Ccircle cx='33' cy='9' r='2.5'/%3E%3Ccircle cx='11' cy='31' r='2.5'/%3E%3C/g%3E%3C/svg%3E\")";

const WHATSAPP_GREEN = "#075e54";

export function PhoneFrame({
  businessName,
  bubbles,
  typing,
  disabled,
  disabledNote,
  onSend,
  onQuickReply,
}: {
  businessName: string;
  bubbles: Bubble[];
  typing: boolean;
  disabled: boolean;
  disabledNote?: string | null;
  onSend: (text: string) => void;
  onQuickReply: (button: QuickReply) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = React.useState("");

  const lastId = bubbles.length ? bubbles[bubbles.length - 1].id : null;
  React.useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lastId, bubbles.length, typing]);

  function submit() {
    const text = draft.trim();
    if (!text || disabled) return;
    setDraft("");
    onSend(text);
  }

  return (
    <div className="mx-auto w-full max-w-[400px] rounded-[2.6rem] bg-gradient-to-b from-slate-700 via-slate-900 to-slate-950 p-[3px] shadow-pop">
      <div className="rounded-[2.5rem] border-[6px] border-slate-950 bg-slate-950">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#ece5dd]">
          <StatusBar />

          {/* Header */}
          <div
            className="flex items-center gap-3 px-3.5 pb-2.5 pt-1.5 text-white"
            style={{ backgroundColor: WHATSAPP_GREEN }}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold ring-1 ring-inset ring-white/20">
              {businessName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{businessName}</p>
              <p className="flex items-center gap-1 text-[11px] leading-tight text-white/75">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" />
                online
              </p>
            </div>
          </div>

          {/* Thread */}
          <div
            ref={scrollRef}
            className="h-[26rem] overflow-y-auto px-3 py-3 sm:h-[30rem]"
            style={{ backgroundColor: "#ece5dd", backgroundImage: WALLPAPER }}
          >
            {bubbles.length === 0 && !typing ? (
              <p className="mx-auto mt-8 w-fit rounded-full bg-white/70 px-3 py-1.5 text-center text-[11px] font-medium text-slate-600 shadow-sm">
                Say hello to start the conversation.
              </p>
            ) : null}

            <div className="flex flex-col gap-1.5">
              {bubbles.map((bubble) => (
                <ChatBubble key={bubble.id} bubble={bubble} onQuickReply={onQuickReply} disabled={disabled} />
              ))}
              {typing ? (
                <div className="flex justify-start">
                  <div className="rounded-[14px] rounded-bl-[4px] bg-white px-3.5 py-2.5 text-slate-500 shadow-sm ring-1 ring-inset ring-black/[0.04]">
                    <span className="inline-flex gap-1">
                      <Dot delay="0ms" />
                      <Dot delay="150ms" />
                      <Dot delay="300ms" />
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Composer */}
          <div className="flex items-center gap-2 bg-[#f0f0f0] px-2.5 pb-3 pt-2">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
              disabled={disabled}
              placeholder={disabled ? (disabledNote ?? "Chat unavailable") : "Type a message"}
              aria-label="Message"
              className="h-10 min-w-0 flex-1 rounded-full border border-black/[0.06] bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-[#075e54]/40 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={submit}
              disabled={disabled || !draft.trim()}
              aria-label="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-all hover:brightness-110 disabled:opacity-40"
              style={{ backgroundColor: WHATSAPP_GREEN }}
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </div>

          {/* Home indicator */}
          <div className="flex justify-center bg-[#f0f0f0] pb-1.5">
            <span className="h-1 w-28 rounded-full bg-slate-900/25" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Fake iOS-style status bar with a notch, drawn in CSS/SVG. */
function StatusBar() {
  return (
    <div
      className="relative flex h-8 items-center justify-between px-5 text-[11px] font-semibold text-white"
      style={{ backgroundColor: WHATSAPP_GREEN }}
      aria-hidden="true"
    >
      <span className="tabular-nums">9:41</span>
      <span className="absolute left-1/2 top-0 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-slate-950" />
      <span className="flex items-center gap-1.5">
        {/* signal */}
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor">
          <rect x="0" y="7.5" width="2.6" height="3.5" rx="0.7" />
          <rect x="4.4" y="5.2" width="2.6" height="5.8" rx="0.7" />
          <rect x="8.8" y="2.7" width="2.6" height="8.3" rx="0.7" />
          <rect x="13.2" y="0" width="2.6" height="11" rx="0.7" opacity="0.45" />
        </svg>
        {/* wifi */}
        <svg width="14" height="11" viewBox="0 0 14 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M1 3.6a9 9 0 0 1 12 0" />
          <path d="M3.4 6.2a5.6 5.6 0 0 1 7.2 0" />
          <path d="M5.8 8.7a2.2 2.2 0 0 1 2.4 0" />
        </svg>
        {/* battery */}
        <svg width="24" height="11" viewBox="0 0 24 11" fill="none">
          <rect x="0.6" y="0.6" width="20" height="9.8" rx="2.6" stroke="currentColor" strokeOpacity="0.55" />
          <rect x="2.2" y="2.2" width="14.6" height="6.6" rx="1.6" fill="currentColor" />
          <path d="M22.2 4v3a1.9 1.9 0 0 0 0-3Z" fill="currentColor" fillOpacity="0.6" />
        </svg>
      </span>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
      style={{ animationDelay: delay }}
    />
  );
}

function ChatBubble({
  bubble,
  onQuickReply,
  disabled,
}: {
  bubble: Bubble;
  onQuickReply: (button: QuickReply) => void;
  disabled: boolean;
}) {
  const customer = bubble.side === "customer";
  return (
    <div className={cn("flex", customer ? "justify-end" : "justify-start")}>
      <div className="max-w-[85%]">
        <div
          className={cn(
            "rounded-[14px] px-3.5 py-2 text-sm shadow-sm ring-1 ring-inset",
            customer
              ? "rounded-br-[4px] bg-[#dcf8c6] text-slate-900 ring-emerald-900/[0.06]"
              : "rounded-bl-[4px] bg-white text-slate-900 ring-black/[0.04]",
          )}
        >
          {bubble.label === "Staff" ? (
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">Staff</div>
          ) : null}
          {bubble.label === "template" ? (
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              automated message
            </div>
          ) : null}
          <p className="whitespace-pre-wrap break-words leading-relaxed">{bubble.text}</p>
          <div
            className={cn(
              "mt-0.5 flex items-center gap-1 text-[10px] tabular-nums text-slate-500",
              customer ? "justify-end" : "justify-start",
            )}
          >
            {bubble.time}
            {customer ? <CheckCheck className="h-3 w-3 text-[#53bdeb]" aria-hidden="true" /> : null}
          </div>
        </div>

        {!customer && bubble.buttons?.length ? (
          <div className="mt-1.5 flex flex-col gap-1">
            {bubble.buttons.map((button) => (
              <button
                key={button.id}
                type="button"
                data-quick-reply={button.id}
                disabled={disabled}
                onClick={() => onQuickReply(button)}
                className="w-full rounded-lg border border-black/[0.06] bg-white px-3 py-2 text-center text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary/[0.06] disabled:opacity-50"
              >
                {button.title}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
