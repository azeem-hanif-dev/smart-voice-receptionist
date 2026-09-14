"use client";

import * as React from "react";
import { CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/* -------------------------------------------------------------------------- */
/* Card with a title, a one-line description and an optional footer row        */
/* -------------------------------------------------------------------------- */

export function SettingsCard({
  title,
  description,
  aside,
  footer,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  /** Rendered on the right of the header row — a status pill, usually. */
  aside?: React.ReactNode;
  /** Sticks to the bottom of the card: the Save button and its confirmation. */
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex flex-wrap items-start gap-3 border-b border-border/70 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold tracking-tight">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <div className={cn("space-y-5 p-5", bodyClassName)}>{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border/70 bg-muted/25 px-5 py-3.5">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Save button + inline "Saved" confirmation                                   */
/* -------------------------------------------------------------------------- */

/** Flips true for a couple of seconds after a successful save. */
export function useSavedFlag(): [boolean, () => void] {
  const [saved, setSaved] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const mark = React.useCallback(() => {
    setSaved(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 2600);
  }, []);

  return [saved, mark];
}

export function SaveFooter({
  saving,
  saved,
  onSave,
  label = "Save changes",
  children,
}: {
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  label?: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      <Button onClick={onSave} disabled={saving}>
        {saving ? "Saving..." : label}
      </Button>
      {children}
      <span
        aria-live="polite"
        className={cn(
          "inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600 transition-opacity duration-200",
          saved ? "opacity-100" : "opacity-0",
        )}
      >
        <CircleCheck className="h-4 w-4" />
        Saved
      </span>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                 */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-dashed border-border px-6 py-10 text-center", className)}>
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-sm font-bold">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Row actions that fade in on hover                                           */
/* -------------------------------------------------------------------------- */

/** Put `group` on the row that owns these. */
export function RowActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "h-8 w-8",
        destructive ? "hover:bg-destructive/10 hover:text-destructive" : "hover:text-foreground",
      )}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/* Small labelled section inside a card                                        */
/* -------------------------------------------------------------------------- */

export function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
