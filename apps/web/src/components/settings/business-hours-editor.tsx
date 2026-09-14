"use client";

import * as React from "react";
import type { WeeklyHour } from "@/lib/types";
import { WEEKDAYS, minutesToTime, timeToMinutes } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const DEFAULT_START = 9 * 60;
const DEFAULT_END = 17 * 60;

/**
 * Weekly opening-hours editor: one interval per weekday.
 * Used by onboarding (business hours) and by settings (business hours, provider working hours).
 */
export function WeeklyHoursEditor({
  value,
  onChange,
  idPrefix = "hours",
  disabled,
}: {
  value: WeeklyHour[];
  onChange: (hours: WeeklyHour[]) => void;
  idPrefix?: string;
  disabled?: boolean;
}) {
  function rowFor(weekday: number): WeeklyHour | undefined {
    return value.find((hour) => hour.weekday === weekday);
  }

  function replace(weekday: number, next: WeeklyHour | null) {
    const others = value.filter((hour) => hour.weekday !== weekday);
    const hours = next ? [...others, next] : others;
    onChange(hours.sort((a, b) => a.weekday - b.weekday));
  }

  return (
    <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70">
      {WEEKDAYS.map((day) => {
        const row = rowFor(day.value);
        const enabled = Boolean(row);
        return (
          <div
            key={day.value}
            className={cn(
              "flex flex-wrap items-center gap-3 px-4 py-2.5 transition-colors",
              enabled ? "bg-card" : "bg-muted/25",
            )}
          >
            <div className="flex w-40 items-center gap-3">
              <Switch
                id={`${idPrefix}-${day.value}`}
                checked={enabled}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  replace(
                    day.value,
                    checked
                      ? { weekday: day.value, startMinute: DEFAULT_START, endMinute: DEFAULT_END }
                      : null,
                  )
                }
              />
              <label
                htmlFor={`${idPrefix}-${day.value}`}
                className={cn("text-sm font-bold tracking-tight", enabled ? "text-foreground" : "text-muted-foreground")}
              >
                {day.label}
              </label>
            </div>
            {enabled && row ? (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  className="h-9 w-32 tabular-nums"
                  disabled={disabled}
                  value={minutesToTime(row.startMinute)}
                  onChange={(event) => {
                    const minutes = timeToMinutes(event.target.value);
                    if (minutes === null) return;
                    replace(day.value, { ...row, startMinute: minutes });
                  }}
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="time"
                  className="h-9 w-32 tabular-nums"
                  disabled={disabled}
                  value={minutesToTime(row.endMinute)}
                  onChange={(event) => {
                    const minutes = timeToMinutes(event.target.value);
                    if (minutes === null) return;
                    replace(day.value, { ...row, endMinute: minutes });
                  }}
                />
              </div>
            ) : (
              <span className="text-[13px] font-medium text-muted-foreground">Closed</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** True when every enabled day has a positive-length interval. */
export function weeklyHoursAreValid(hours: WeeklyHour[]): boolean {
  return hours.every((hour) => hour.endMinute > hour.startMinute && hour.endMinute <= 24 * 60);
}
