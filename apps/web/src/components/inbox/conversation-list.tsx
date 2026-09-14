"use client";

import * as React from "react";
import { AlertTriangle, MessageCircle, MessagesSquare, MonitorSmartphone, Search } from "lucide-react";
import type { Channel, ConversationSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  STATUS_FILTERS,
  avatarGradient,
  contactLabel,
  initials,
  shortRelative,
  statusLabel,
  statusPillClass,
} from "./lib";
import type { StatusFilter } from "./lib";

export function ChannelIcon({ channel, className }: { channel: Channel; className?: string }) {
  if (channel === "WHATSAPP") {
    return (
      <MessageCircle
        className={cn("h-3.5 w-3.5 text-emerald-600", className)}
        aria-label="WhatsApp"
      />
    );
  }
  return (
    <MonitorSmartphone className={cn("h-3.5 w-3.5 text-slate-500", className)} aria-label="Simulator" />
  );
}

export function StatusPill({ status, className }: { status: ConversationSummary["status"]; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-4 tracking-wide",
        statusPillClass(status),
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

/** 36px initials circle on a soft gradient, seeded from the contact id. */
export function ContactAvatar({
  id,
  name,
  phone,
  size = "md",
  className,
}: {
  id: string;
  name: string | null;
  phone: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white ring-1 ring-inset ring-white/25",
        avatarGradient(id || phone),
        size === "sm" && "h-8 w-8 text-[11px]",
        size === "md" && "h-9 w-9 text-xs",
        size === "lg" && "h-14 w-14 text-lg",
        className,
      )}
    >
      {initials(name, phone)}
    </span>
  );
}

export function ConversationList({
  conversations,
  loading,
  error,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  selectedId,
  onSelect,
}: {
  conversations: ConversationSummary[] | null;
  loading: boolean;
  error: string | null;
  filter: StatusFilter;
  onFilterChange: (value: StatusFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="space-y-3 border-b border-border/70 px-4 pb-3 pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Conversations
          </p>
          {conversations ? (
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
              {conversations.length}
            </span>
          ) : null}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search name, phone or message"
            className="h-9 rounded-full pl-9 text-[13px]"
            aria-label="Search conversations"
          />
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onFilterChange(item.value)}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-150",
                filter === item.value
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                  : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? <p className="px-4 py-3 text-sm text-destructive">{error}</p> : null}

        {conversations === null && loading ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : null}

        {conversations !== null && conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessagesSquare className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold">
              {search.trim() || filter !== "ALL" ? "Nothing matches" : "No conversations yet"}
            </p>
            <p className="max-w-[15rem] text-xs text-muted-foreground">
              {search.trim() || filter !== "ALL"
                ? "Try a different filter or clear the search."
                : "When customers message you, conversations land here. Try the Demo chat."}
            </p>
          </div>
        ) : null}

        <ul className="animate-fade-in-up">
          {(conversations ?? []).map((conversation) => {
            const selected = selectedId === conversation.id;
            const unread = conversation.unreadCount > 0;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  className={cn(
                    "relative flex w-full gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors duration-150",
                    selected ? "bg-accent/60" : "hover:bg-accent/40",
                  )}
                >
                  {selected ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary"
                    />
                  ) : null}

                  <ContactAvatar
                    id={conversation.contact.id}
                    name={conversation.contact.name}
                    phone={conversation.contact.phoneE164}
                  />

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          unread ? "font-semibold text-foreground" : "font-medium text-foreground",
                        )}
                      >
                        {contactLabel(conversation.contact)}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {shortRelative(conversation.lastMessageAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-xs",
                          unread ? "text-foreground/80" : "text-muted-foreground",
                        )}
                      >
                        {conversation.lastMessagePreview ?? "No messages yet"}
                      </span>
                      {unread ? (
                        <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold leading-none text-primary-foreground shadow-sm shadow-primary/30">
                          {conversation.unreadCount}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1.5 pt-0.5">
                      <ChannelIcon channel={conversation.channel} />
                      <StatusPill status={conversation.status} />
                    </div>

                    {conversation.handoffReason ? (
                      <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-800 ring-1 ring-inset ring-amber-600/15">
                        <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                        <span className="min-w-0 truncate">{conversation.handoffReason}</span>
                      </div>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
