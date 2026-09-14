/**
 * Local helpers for the inbox. Kept here (rather than in src/lib) so the inbox
 * owns its own formatting rules.
 */
import { DateTime } from "luxon";
import type { ConversationStatus } from "@/lib/types";

export type StatusFilter = "ALL" | "AI" | "HUMAN" | "CLOSED";

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "HUMAN", label: "Needs a human" },
  { value: "AI", label: "AI handling" },
  { value: "CLOSED", label: "Closed" },
];

/** Tinted-pill classes for the little AI / Human / Closed badge. */
export function statusPillClass(status: ConversationStatus): string {
  switch (status) {
    case "AI":
      return "bg-primary/10 text-primary ring-1 ring-inset ring-primary/15";
    case "HUMAN":
      return "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20";
    default:
      return "bg-muted text-muted-foreground ring-1 ring-inset ring-border/70";
  }
}

export function statusLabel(status: ConversationStatus): string {
  switch (status) {
    case "AI":
      return "AI";
    case "HUMAN":
      return "Human";
    default:
      return "Closed";
  }
}

/** "3m", "2h", "5d" — compact enough for a list row. */
export function shortRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = DateTime.fromISO(iso);
  if (!dt.isValid) return "";
  const diff = DateTime.now().diff(dt, ["days", "hours", "minutes"]).toObject();
  const days = Math.floor(diff.days ?? 0);
  const hours = Math.floor(diff.hours ?? 0);
  const minutes = Math.floor(diff.minutes ?? 0);
  if (days >= 7) return dt.toFormat("d LLL");
  if (days >= 1) return `${days}d`;
  if (hours >= 1) return `${hours}h`;
  if (minutes >= 1) return `${minutes}m`;
  return "now";
}

/** Full timestamp in the org timezone, e.g. "Mon 8 Sep, 09:00". */
export function zonedDateTime(iso: string, timezone?: string | null): string {
  const dt = DateTime.fromISO(iso, timezone ? { zone: timezone } : undefined);
  return dt.isValid ? dt.toFormat("ccc d LLL, HH:mm") : iso;
}

/** Just the clock time in the org timezone. */
export function zonedTime(iso: string, timezone?: string | null): string {
  const dt = DateTime.fromISO(iso, timezone ? { zone: timezone } : undefined);
  return dt.isValid ? dt.toFormat("HH:mm") : "";
}

/** Date heading used to separate days inside a thread. */
export function zonedDayLabel(iso: string, timezone?: string | null): string {
  const dt = DateTime.fromISO(iso, timezone ? { zone: timezone } : undefined);
  if (!dt.isValid) return "";
  const today = DateTime.now().setZone(timezone ?? undefined).startOf("day");
  const day = dt.startOf("day");
  const diff = today.diff(day, "days").days;
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return dt.toFormat("cccc d LLLL yyyy");
}

export function isUpcoming(iso: string): boolean {
  const dt = DateTime.fromISO(iso);
  return dt.isValid && dt.toMillis() > Date.now();
}

export function contactLabel(contact: { name?: string | null; phoneE164: string }): string {
  return contact.name?.trim() || contact.phoneE164;
}

/** "+15550102000" -> "+1 555 010 2000" for display only. */
export function prettyPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) return phone;
  const body = digits.slice(1);
  if (body.length < 8) return phone;
  // North America: +1 555 010 2000
  if (body.length === 11 && body.startsWith("1")) return `+1 ${body.slice(1, 4)} ${body.slice(4, 7)} ${body.slice(7)}`;
  // UK mobiles/landlines: +44 7911 123456
  if (body.startsWith("44") && body.length === 12) return `+44 ${body.slice(2, 6)} ${body.slice(6)}`;
  // Pakistan mobiles: +92 300 1234567
  if (body.startsWith("92") && body.length === 12) return `+92 ${body.slice(2, 5)} ${body.slice(5)}`;
  // Generic: country code (1-3 digits) then groups of 3
  const cc = body.length > 10 ? body.slice(0, body.length - 9) : body.slice(0, 1);
  const rest = body.slice(cc.length).replace(/(\d{3})(?=\d)/g, "$1 ");
  return `+${cc} ${rest}`;
}

export function bookingStatusClass(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15";
    case "PENDING":
      return "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/15";
    case "COMPLETED":
      return "bg-muted text-muted-foreground ring-1 ring-inset ring-border/70";
    case "CANCELLED":
      return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15";
    case "NO_SHOW":
      return "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20";
    default:
      return "bg-muted text-muted-foreground ring-1 ring-inset ring-border/70";
  }
}

/* -------------------------------------------------------------------------- */
/* Avatars                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Soft two-stop gradients for contact avatars. Picked deterministically from the
 * contact id so a person keeps the same colour between renders.
 */
const AVATAR_GRADIENTS = [
  "from-teal-400 to-emerald-500",
  "from-sky-400 to-indigo-500",
  "from-violet-400 to-fuchsia-500",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",
  "from-cyan-400 to-sky-600",
];

export function avatarGradient(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

/** "Sara Khan" -> "SK". Falls back to the last two digits of the phone number. */
export function initials(name: string | null | undefined, phone: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-2) || "?";
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
