"use client";

import * as React from "react";
import { HelpCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import type { Faq, FaqInput } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { EmptyState, IconButton, RowActions } from "./ui";

interface Draft {
  id: string | null;
  question: string;
  answer: string;
  keywords: string;
}

function emptyDraft(): Draft {
  return { id: null, question: "", answer: "", keywords: "" };
}

export function FaqsEditor({ orgId, onChanged }: { orgId: string; onChanged?: () => void }) {
  const { toast } = useToast();
  const [faqs, setFaqs] = React.useState<Faq[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setFaqs(await api.get<Faq[]>(`/orgs/${orgId}/faqs`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
      setFaqs([]);
    }
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft) return;
    if (!draft.question.trim() || !draft.answer.trim()) {
      toast({ title: "Question and answer are required", variant: "destructive" });
      return;
    }
    const body: FaqInput = {
      question: draft.question.trim(),
      answer: draft.answer.trim(),
      keywords: draft.keywords
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    };
    setSaving(true);
    try {
      if (draft.id) {
        await api.patch<Faq>(`/orgs/${orgId}/faqs/${draft.id}`, body);
      } else {
        await api.post<Faq>(`/orgs/${orgId}/faqs`, body);
      }
      setDraft(null);
      await load();
      onChanged?.();
    } catch (err) {
      toast({ title: "Could not save the FAQ", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(faq: Faq) {
    if (!window.confirm("Delete this FAQ?")) return;
    try {
      await api.del(`/orgs/${orgId}/faqs/${faq.id}`);
      await load();
      onChanged?.();
    } catch (err) {
      toast({ title: "Could not delete the FAQ", description: errorMessage(err), variant: "destructive" });
    }
  }

  if (faqs === null) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {faqs.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="No FAQs yet"
          description="Add the questions customers ask most — the assistant answers from these first."
          action={
            <Button onClick={() => setDraft(emptyDraft())}>
              <Plus className="h-4 w-4" />
              Add FAQ
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70">
          {faqs.map((faq) => (
            <li
              key={faq.id}
              className="group flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">{faq.question}</p>
                <p className="mt-1 text-[13px] text-muted-foreground">{faq.answer}</p>
                {faq.keywords?.length ? (
                  <p className="mt-1.5 flex flex-wrap gap-1">
                    {faq.keywords.map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                      >
                        {keyword}
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
              <RowActions className="shrink-0">
                <IconButton
                  label="Edit"
                  onClick={() =>
                    setDraft({
                      id: faq.id,
                      question: faq.question,
                      answer: faq.answer,
                      keywords: (faq.keywords ?? []).join(", "),
                    })
                  }
                >
                  <Pencil className="h-4 w-4" />
                </IconButton>
                <IconButton label="Delete" destructive onClick={() => void remove(faq)}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </RowActions>
            </li>
          ))}
        </ul>
      )}

      {faqs.length > 0 ? (
        <Button variant="outline" onClick={() => setDraft(emptyDraft())}>
          <Plus className="h-4 w-4" />
          Add FAQ
        </Button>
      ) : null}

      <Dialog open={draft !== null} onOpenChange={(open) => (open ? null : setDraft(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit FAQ" : "New FAQ"}</DialogTitle>
            <DialogDescription>The assistant answers from these before anything else.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="faq-question">Question</Label>
                <Input
                  id="faq-question"
                  value={draft.question}
                  onChange={(event) => setDraft({ ...draft, question: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="faq-answer">Answer</Label>
                <Textarea
                  id="faq-answer"
                  rows={4}
                  value={draft.answer}
                  onChange={(event) => setDraft({ ...draft, answer: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="faq-keywords">Keywords (comma separated)</Label>
                <Input
                  id="faq-keywords"
                  value={draft.keywords}
                  onChange={(event) => setDraft({ ...draft, keywords: event.target.value })}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="border-t border-border/70 pt-4">
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
