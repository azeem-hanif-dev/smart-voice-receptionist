"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Inbox as InboxIcon, MessageSquareDashed, Sparkles } from "lucide-react";
import { api, errorMessage, query } from "@/lib/api";
import type { ConversationDetail, ConversationSummary, Org } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { BookingContext } from "./booking-context";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import type { StatusFilter } from "./lib";

const LIST_POLL_MS = 5000;
const THREAD_POLL_MS = 4000;

export function InboxView({ orgId }: { orgId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [timezone, setTimezone] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<StatusFilter>("ALL");
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  const [conversations, setConversations] = React.useState<ConversationSummary[] | null>(null);
  const [listLoading, setListLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);

  const [selectedId, setSelectedId] = React.useState<string | null>(searchParams.get("c"));
  const [detail, setDetail] = React.useState<ConversationDetail | null>(null);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [contextOpen, setContextOpen] = React.useState(false);

  /** Conversations we have already POSTed /read for, so polling does not spam it. */
  const readRef = React.useRef<Set<string>>(new Set());

  /* Org timezone — fetched once. ---------------------------------------- */
  React.useEffect(() => {
    let cancelled = false;
    api
      .get<Org>(`/orgs/${orgId}`)
      .then((org) => {
        if (!cancelled) setTimezone(org.timezone);
      })
      .catch(() => {
        /* fall back to the browser zone */
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  /* Debounce the search box. -------------------------------------------- */
  React.useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  /* Conversation list, polled. ------------------------------------------ */
  const loadList = React.useCallback(async () => {
    try {
      const path = `/orgs/${orgId}/conversations${query({
        status: filter === "ALL" ? undefined : filter,
        q: debouncedSearch || undefined,
      })}`;
      const rows = await api.get<ConversationSummary[]>(path);
      setConversations(rows);
      setListError(null);
    } catch (err) {
      setListError(errorMessage(err, "Could not load conversations"));
    } finally {
      setListLoading(false);
    }
  }, [orgId, filter, debouncedSearch]);

  React.useEffect(() => {
    setListLoading(true);
    void loadList();
    const handle = window.setInterval(() => void loadList(), LIST_POLL_MS);
    return () => window.clearInterval(handle);
  }, [loadList]);

  /** Latest loadList, so the thread effect can refresh the list without re-subscribing. */
  const loadListRef = React.useRef(loadList);
  React.useEffect(() => {
    loadListRef.current = loadList;
  }, [loadList]);

  /* Selected conversation, polled. -------------------------------------- */
  const loadDetail = React.useCallback(
    async (id: string) => {
      try {
        const result = await api.get<ConversationDetail>(`/orgs/${orgId}/conversations/${id}`);
        setDetail((current) => (current && current.conversation.id !== id ? current : result));
        setDetailError(null);
      } catch (err) {
        setDetailError(errorMessage(err, "Could not load this conversation"));
      }
    },
    [orgId],
  );

  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetail(null);
    setDetailError(null);
    void loadDetail(selectedId);

    // Mark as read once per conversation per visit.
    if (!readRef.current.has(selectedId)) {
      readRef.current.add(selectedId);
      api
        .post(`/orgs/${orgId}/conversations/${selectedId}/read`)
        .then(() => void loadListRef.current())
        .catch(() => {
          readRef.current.delete(selectedId);
        });
    }

    const handle = window.setInterval(() => void loadDetail(selectedId), THREAD_POLL_MS);
    return () => window.clearInterval(handle);
  }, [selectedId, orgId, loadDetail]);

  /* Selection + deep link. ---------------------------------------------- */
  const select = React.useCallback(
    (id: string | null) => {
      setSelectedId(id);
      setContextOpen(false);
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      if (id) params.set("c", id);
      else params.delete("c");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  /* Actions. ------------------------------------------------------------- */
  async function runAction(path: string, failure: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.post(`/orgs/${orgId}/conversations/${selectedId}/${path}`);
      await Promise.all([loadDetail(selectedId), loadList()]);
    } catch (err) {
      toast({ title: failure, description: errorMessage(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(text: string) {
    if (!selectedId) return;
    try {
      await api.post(`/orgs/${orgId}/conversations/${selectedId}/messages`, { text });
      await Promise.all([loadDetail(selectedId), loadList()]);
    } catch (err) {
      toast({ title: "Could not send the message", description: errorMessage(err), variant: "destructive" });
      throw err;
    }
  }

  const hasSelection = Boolean(selectedId);

  return (
    <div className="grid h-[calc(100dvh-5.5rem)] min-h-[26rem] grid-cols-1 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card lg:h-[calc(100dvh-6.5rem)] lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_336px]">
      <div className={cn("min-h-0 border-r border-border/70", hasSelection && "hidden lg:block")}>
        <ConversationList
          conversations={conversations}
          loading={listLoading}
          error={listError}
          filter={filter}
          onFilterChange={(value) => {
            setFilter(value);
            setConversations(null);
            setListLoading(true);
          }}
          search={search}
          onSearchChange={setSearch}
          selectedId={selectedId}
          onSelect={(id) => select(id)}
        />
      </div>

      <div className={cn("min-h-0 min-w-0", !hasSelection && "hidden lg:block")}>
        {detail ? (
          <MessageThread
            detail={detail}
            timezone={timezone}
            busy={busy}
            error={detailError}
            onBack={() => select(null)}
            onToggleContext={() => setContextOpen((open) => !open)}
            onTakeover={() => void runAction("takeover", "Could not take over")}
            onHandback={() => void runAction("handback", "Could not hand back to the AI")}
            onClose={() => void runAction("close", "Could not close the conversation")}
            onSend={sendMessage}
          />
        ) : (
          <EmptyThread orgId={orgId} error={hasSelection ? detailError : null} loading={hasSelection} />
        )}
      </div>

      <div className="hidden min-h-0 border-l border-border/70 bg-muted/30 xl:block">
        {detail ? (
          <BookingContext orgId={orgId} detail={detail} timezone={timezone} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold">Booking context</p>
            <p className="max-w-[16rem] text-xs text-muted-foreground">
              Pick a conversation to see its appointments and what the AI remembers.
            </p>
          </div>
        )}
      </div>

      {/* Collapsible context pane below xl. */}
      {contextOpen && detail ? (
        <div className="fixed inset-0 z-40 xl:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setContextOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute right-0 top-0 flex h-full w-80 max-w-[85vw] flex-col border-l border-border/70 bg-background shadow-pop">
            <BookingContext
              orgId={orgId}
              detail={detail}
              timezone={timezone}
              onClose={() => setContextOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function EmptyThread({
  orgId,
  error,
  loading,
}: {
  orgId: string;
  error: string | null;
  loading: boolean;
}) {
  return (
    <div className="flex h-full animate-fade-in-up flex-col items-center justify-center gap-3 bg-muted/20 p-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        {error ? <InboxIcon className="h-6 w-6" /> : <MessageSquareDashed className="h-6 w-6" />}
      </span>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <>
          <p className="text-base font-semibold tracking-tight">
            {loading ? "Loading conversation…" : "No conversation selected"}
          </p>
          {!loading ? (
            <>
              <p className="max-w-sm text-sm text-muted-foreground">
                Pick a conversation on the left to read the thread, take over from the AI, or reply.
              </p>
              <Button asChild size="sm" className="mt-1">
                <Link href={`/o/${orgId}/demo`}>
                  <Sparkles className="h-4 w-4" />
                  Start a demo chat
                </Link>
              </Button>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
