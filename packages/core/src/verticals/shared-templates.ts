import type { MessageTemplateDef } from "./types.js";
import type { ScheduledKind } from "@ar/shared";

/** Base templates every vertical shares; packs override wording where it matters. */
export function baseTemplates(v: {
  appointment: string;
  business: string;
  rebookLine: string;
}): Record<ScheduledKind, MessageTemplateDef> {
  return {
    CONFIRMATION: {
      name: "appt_confirmation",
      paramKeys: ["customerName", "businessName", "service", "dateTime", "providerName"],
      text: `Hi {{customerName}}, your ${v.appointment} at {{businessName}} is confirmed: {{service}} on {{dateTime}} with {{providerName}}. Reply here if you need to change it.`,
    },
    REMINDER_24H: {
      name: "appt_reminder_24h",
      paramKeys: ["customerName", "businessName", "service", "dateTime", "providerName"],
      text: `Hi {{customerName}}, a reminder that your ${v.appointment} at {{businessName}} is tomorrow: {{service}} on {{dateTime}} with {{providerName}}. Can you make it?`,
      quickReplies: [
        { id: "reminder:confirm", title: "Yes, I'll be there" },
        { id: "reminder:reschedule", title: "Reschedule" },
        { id: "reminder:cancel", title: "Cancel" },
      ],
    },
    REMINDER_2H: {
      name: "appt_reminder_2h",
      paramKeys: ["customerName", "businessName", "service", "dateTime"],
      text: `Hi {{customerName}}, see you in about two hours for your {{service}} at {{businessName}} ({{dateTime}}).`,
      quickReplies: [
        { id: "reminder:confirm", title: "On my way" },
        { id: "reminder:reschedule", title: "Reschedule" },
      ],
    },
    NO_SHOW_FOLLOWUP: {
      name: "appt_no_show",
      paramKeys: ["customerName", "businessName", "service"],
      text: `Hi {{customerName}}, we missed you for your {{service}} at {{businessName}} today. Would you like to rebook?`,
      quickReplies: [
        { id: "action:book", title: "Rebook" },
        { id: "action:later", title: "Not now" },
      ],
    },
    REBOOK_NUDGE: {
      name: "rebook_nudge",
      paramKeys: ["customerName", "businessName"],
      text: `Hi {{customerName}}, ${v.rebookLine} Reply here and I can find you a time at {{businessName}}.`,
      quickReplies: [
        { id: "action:book", title: "Book now" },
        { id: "action:later", title: "Not now" },
      ],
    },
    REENGAGE: {
      name: "reengage",
      paramKeys: ["customerName", "businessName"],
      text: `Hi {{customerName}}, this is {{businessName}}. We have an update about your ${v.appointment}. Reply to continue the conversation.`,
    },
  };
}
