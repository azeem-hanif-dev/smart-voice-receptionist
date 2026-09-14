"use client";

import * as React from "react";
import { DateTime } from "luxon";
import type { AnalyticsPoint } from "@/lib/types";

/**
 * Conversations (line + soft area) and bookings (bars) share one y-axis because
 * they are the same unit — a count per day. No second scale, ever.
 */
export const SERIES_COLORS = {
  conversations: "hsl(175 77% 30%)",
  bookings: "#10b981",
} as const;

const HEIGHT = 280;
const PAD = { top: 18, right: 14, bottom: 32, left: 38 };

export function SeriesChart({ points }: { points: AnalyticsPoint[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(720);
  const [hover, setHover] = React.useState<number | null>(null);
  const gradientId = React.useId();

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => setWidth(Math.max(320, node.clientWidth));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const plotWidth = Math.max(1, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const count = Math.max(1, points.length);
  const band = plotWidth / count;

  const rawMax = points.reduce((max, point) => Math.max(max, point.conversations, point.bookings), 0);
  const yMax = niceMax(rawMax);
  const ticks = tickValues(yMax);

  const x = (index: number) => PAD.left + index * band + band / 2;
  const y = (value: number) => PAD.top + plotHeight - (value / yMax) * plotHeight;
  const baseline = PAD.top + plotHeight;

  const barWidth = Math.max(2, Math.min(18, band * 0.5));
  const showDots = points.length <= 16;

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(point.conversations).toFixed(2)}`)
    .join(" ");
  const areaPath = points.length
    ? `${linePath} L${x(points.length - 1).toFixed(2)},${baseline.toFixed(2)} L${x(0).toFixed(2)},${baseline.toFixed(2)} Z`
    : "";

  // Roughly seven readable x labels whatever the range.
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  const active = hover !== null ? points[hover] : null;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label="Conversations and bookings per day"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_COLORS.conversations} stopOpacity={0.22} />
            <stop offset="100%" stopColor={SERIES_COLORS.conversations} stopOpacity={0.01} />
          </linearGradient>
        </defs>

        {/* Gridlines and y labels */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="hsl(var(--border))"
              strokeWidth={1}
              strokeDasharray={tick === 0 ? undefined : "3 4"}
            />
            <text
              x={PAD.left - 10}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill="hsl(var(--muted-foreground))"
            >
              {tick}
            </text>
          </g>
        ))}

        {/* Bars: bookings */}
        {points.map((point, index) => {
          if (point.bookings <= 0) return null;
          const top = y(point.bookings);
          const height = baseline - top;
          return (
            <path
              key={`bar-${point.date}`}
              d={roundedTopBar(x(index) - barWidth / 2, top, barWidth, height, 3)}
              fill={SERIES_COLORS.bookings}
              opacity={hover === null || hover === index ? 0.9 : 0.4}
            />
          );
        })}

        {/* Area + line: conversations */}
        {points.length > 1 ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
        {points.length > 1 ? (
          <path
            d={linePath}
            fill="none"
            stroke={SERIES_COLORS.conversations}
            strokeWidth={2.25}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {(showDots ? points : points.filter((_, index) => index === hover)).map((point) => {
          const index = points.indexOf(point);
          return (
            <circle
              key={`dot-${point.date}`}
              cx={x(index)}
              cy={y(point.conversations)}
              r={3.5}
              fill="hsl(var(--card))"
              stroke={SERIES_COLORS.conversations}
              strokeWidth={2}
            />
          );
        })}

        {/* Baseline */}
        <line
          x1={PAD.left}
          x2={width - PAD.right}
          y1={baseline}
          y2={baseline}
          stroke="hsl(var(--border))"
          strokeWidth={1}
        />

        {/* X labels */}
        {points.map((point, index) =>
          index % labelEvery === 0 ? (
            <text
              key={`label-${point.date}`}
              x={x(index)}
              y={HEIGHT - 11}
              textAnchor="middle"
              fontSize={11}
              fill="hsl(var(--muted-foreground))"
            >
              {DateTime.fromISO(point.date).toFormat(points.length > 40 ? "d LLL" : "ccc d")}
            </text>
          ) : null,
        )}

        {/* Crosshair */}
        {hover !== null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD.top}
            y2={baseline}
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}

        {/* Hit targets */}
        {points.map((point, index) => (
          <rect
            key={`hit-${point.date}`}
            x={PAD.left + index * band}
            y={PAD.top}
            width={band}
            height={plotHeight}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: SERIES_COLORS.conversations }} />
          Conversations
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: SERIES_COLORS.bookings }} />
          Bookings
        </span>
      </div>

      {active ? (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-border/70 bg-popover px-3 py-2 text-xs shadow-pop"
          style={{
            left: Math.min(Math.max(x(hover ?? 0) - 78, 0), Math.max(0, width - 166)),
            top: 8,
            width: 166,
          }}
        >
          <p className="font-bold tracking-tight">{DateTime.fromISO(active.date).toFormat("ccc d LLL yyyy")}</p>
          <p className="mt-1.5 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: SERIES_COLORS.conversations }} />
              Conversations
            </span>
            <span className="font-semibold tabular-nums">{active.conversations}</span>
          </p>
          <p className="mt-0.5 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: SERIES_COLORS.bookings }} />
              Bookings
            </span>
            <span className="font-semibold tabular-nums">{active.bookings}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** A bar with only its top corners rounded, anchored to the baseline. */
function roundedTopBar(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  return [
    `M${x},${y + height}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${y + height}`,
    "Z",
  ].join(" ");
}

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return Math.ceil(candidate);
  }
  return Math.ceil(value);
}

function tickValues(max: number): number[] {
  const steps = 4;
  const out: number[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const value = (max / steps) * index;
    if (Number.isInteger(value)) out.push(value);
  }
  return out.length > 1 ? out : [0, max];
}
