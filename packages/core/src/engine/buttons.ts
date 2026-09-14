import { DateTime } from "luxon";
import type { QuickReply } from "@ar/shared";
import type { OfferedSlot } from "./types.js";

const BUTTONS_RE = /\s*<<\s*buttons\s*:\s*([^>]+)>>\s*/i;

/** Extract a trailing `<<buttons: A|B|C>>` directive from model text. */
export function extractButtons(text: string): { text: string; buttons?: QuickReply[] } {
  const m = text.match(BUTTONS_RE);
  if (!m) return { text: text.trim() };
  const titles = m[1]
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3);
  const buttons = titles.map((title) => ({ id: `opt:${title.slice(0, 200)}`, title: title.slice(0, 20) }));
  return { text: text.replace(BUTTONS_RE, "").trim(), buttons: buttons.length ? buttons : undefined };
}

export function slotButtonId(slot: { providerId: string; start: string }): string {
  return `slot:${slot.providerId}:${slot.start}`;
}

export function slotButtons(slots: OfferedSlot[], tz: string): QuickReply[] {
  return slots.slice(0, 3).map((s) => ({
    id: slotButtonId(s),
    title: DateTime.fromISO(s.start, { zone: tz }).toFormat("ccc d LLL HH:mm").slice(0, 20),
  }));
}

/**
 * Turn a tapped button into the text the model sees. Button ids are stable strings so the mapping is
 * deterministic and channel-independent.
 */
export function expandButton(buttonId: string, title: string | undefined, tz: string): string {
  if (buttonId.startsWith("slot:")) {
    const [, providerId, ...rest] = buttonId.split(":");
    const start = rest.join(":");
    const label = DateTime.fromISO(start, { zone: tz }).toFormat("cccc d LLLL 'at' HH:mm");
    return `I'll take the slot on ${label}. (start=${start}, providerId=${providerId})`;
  }
  switch (buttonId) {
    case "reminder:confirm":
      return "Yes, I confirm I'll be at my upcoming appointment.";
    case "reminder:reschedule":
      return "I need to reschedule my upcoming appointment.";
    case "reminder:cancel":
      return "I need to cancel my upcoming appointment.";
    case "action:book":
      return "I'd like to book an appointment.";
    case "action:later":
      return "Not now, thanks.";
    default:
      if (buttonId.startsWith("opt:")) return buttonId.slice(4);
      return title ?? buttonId;
  }
}
