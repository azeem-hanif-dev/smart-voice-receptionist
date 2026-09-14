import type Anthropic from "@anthropic-ai/sdk";
import type { StoredMessage } from "./types.js";

export const HISTORY_CAP = 40;

/**
 * Convert stored rows into Messages API history: capped, starting at a customer message, with every
 * tool_use matched to its tool_result (orphans on either side are dropped so the API never rejects the turn).
 */
export function buildHistory(rows: StoredMessage[], cap = HISTORY_CAP): Anthropic.MessageParam[] {
  let slice = rows.slice(-cap);
  let firstIdx = slice.findIndex((r) => r.role === "USER" || r.role === "SYSTEM");
  if (firstIdx < 0) {
    // No customer message in the window (long tool-heavy turns): widen once, then give up.
    slice = rows.slice(-cap * 3);
    firstIdx = slice.findIndex((r) => r.role === "USER" || r.role === "SYSTEM");
  }
  slice = firstIdx >= 0 ? slice.slice(firstIdx) : [];

  const out: Anthropic.MessageParam[] = [];
  for (let i = 0; i < slice.length; i++) {
    const row = slice[i];
    if (!row.content || row.content.length === 0) continue;
    if (row.role === "USER") {
      out.push({ role: "user", content: row.content });
    } else if (row.role === "ASSISTANT") {
      const next = slice[i + 1];
      const resultIds = new Set(
        next && next.role === "TOOL" ? next.content.filter((b): b is Anthropic.ToolResultBlockParam => b.type === "tool_result").map((b) => b.tool_use_id) : [],
      );
      // Drop tool_use blocks whose result never arrived.
      const content = row.content.filter((b) => b.type !== "tool_use" || resultIds.has(b.id));
      if (content.length === 0) continue;
      out.push({ role: "assistant", content });
    } else if (row.role === "TOOL") {
      const prev = out[out.length - 1];
      const useIds = new Set(
        prev && prev.role === "assistant" && Array.isArray(prev.content) ? prev.content.filter((b): b is Anthropic.ToolUseBlockParam => b.type === "tool_use").map((b) => b.id) : [],
      );
      const content = row.content.filter((b) => b.type === "tool_result" && useIds.has(b.tool_use_id));
      if (content.length === 0) continue; // orphan results (or a duplicate TOOL row)
      out.push({ role: "user", content });
    } else if (row.role === "STAFF") {
      out.push({ role: "assistant", content: [{ type: "text", text: `[Staff member replied] ${row.text ?? textOf(row.content)}` }] });
    } else if (row.role === "SYSTEM") {
      out.push({ role: "user", content: [{ type: "text", text: `[System note] ${row.text ?? textOf(row.content)}` }] });
    }
  }
  while (out.length && out[0].role !== "user") out.shift();
  const last = out[out.length - 1];
  if (last && last.role === "assistant" && Array.isArray(last.content) && last.content.some((b) => b.type === "tool_use")) out.pop();
  return out;
}

export function textOf(blocks: Anthropic.ContentBlockParam[] | Anthropic.ContentBlock[]): string {
  return blocks
    .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
