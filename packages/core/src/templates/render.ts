import type { MessageTemplateDef } from "../verticals/types.js";

/** Replace {{key}} placeholders. Unknown keys render as empty strings. */
export function renderTemplate(def: MessageTemplateDef, params: Record<string, string>): string {
  return def.text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => params[key] ?? "");
}

/** Body parameters in the order the WhatsApp template expects. */
export function orderedParams(def: MessageTemplateDef, params: Record<string, string>): string[] {
  return def.paramKeys.map((k) => params[k] ?? "");
}
