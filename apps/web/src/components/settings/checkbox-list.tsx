"use client";

import { cn } from "@/lib/utils";

export interface CheckboxOption {
  id: string;
  label: string;
  hint?: string;
}

/** Native checkboxes; @radix-ui/react-checkbox is not a dependency of this app. */
export function CheckboxList({
  options,
  selected,
  onChange,
  emptyText = "Nothing to choose yet.",
  className,
}: {
  options: CheckboxOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyText?: string;
  className?: string;
}) {
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  function toggle(id: string, checked: boolean) {
    onChange(checked ? Array.from(new Set([...selected, id])) : selected.filter((value) => value !== id));
  }

  return (
    <div className={cn("max-h-48 space-y-2 overflow-y-auto rounded-xl border border-border/70 bg-muted/20 p-3", className)}>
      {options.map((option) => (
        <label key={option.id} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
            checked={selected.includes(option.id)}
            onChange={(event) => toggle(option.id, event.target.checked)}
          />
          <span>
            <span className="font-semibold">{option.label}</span>
            {option.hint ? <span className="block text-xs text-muted-foreground">{option.hint}</span> : null}
          </span>
        </label>
      ))}
    </div>
  );
}
