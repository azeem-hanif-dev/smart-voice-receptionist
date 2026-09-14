import type Anthropic from "@anthropic-ai/sdk";
import type { ModelClient, ModelRequest, ModelResponse } from "./types.js";

let counter = 0;
export function toolUse(name: string, input: Record<string, unknown>): Anthropic.ToolUseBlock {
  return { type: "tool_use", id: `toolu_${++counter}`, name, input } as Anthropic.ToolUseBlock;
}
export function textBlock(text: string): Anthropic.TextBlock {
  return { type: "text", text, citations: null };
}
export function reply(text: string): ModelResponse {
  return { content: [textBlock(text)], stopReason: "end_turn" };
}
export function callTools(...blocks: Anthropic.ContentBlock[]): ModelResponse {
  return { content: blocks, stopReason: "tool_use" };
}

export type ScriptStep = ModelResponse | ((req: ModelRequest) => ModelResponse | Promise<ModelResponse>) | Error;

/** Test double: returns predetermined responses in order and records every request. */
export class ScriptedModelClient implements ModelClient {
  readonly name = "scripted";
  readonly requests: ModelRequest[] = [];
  private steps: ScriptStep[];

  constructor(steps: ScriptStep[]) {
    this.steps = [...steps];
  }

  push(...steps: ScriptStep[]) {
    this.steps.push(...steps);
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    this.requests.push(structuredClone({ ...req, metadata: { conversationId: req.metadata.conversationId, context: undefined as never } }));
    const step = this.steps.shift();
    if (!step) throw new Error("ScriptedModelClient: no more scripted responses");
    if (step instanceof Error) throw step;
    if (typeof step === "function") return step(req);
    return step;
  }

  get remaining() {
    return this.steps.length;
  }
}

/** Last tool_result blocks the model received, parsed. Handy in assertions. */
export function lastToolResults(req: ModelRequest): { name?: string; value: unknown; isError: boolean }[] {
  const last = req.messages[req.messages.length - 1];
  if (!last || last.role !== "user" || typeof last.content === "string") return [];
  const prevAssistant = req.messages[req.messages.length - 2];
  const uses = new Map<string, string>();
  if (prevAssistant && Array.isArray(prevAssistant.content)) {
    for (const b of prevAssistant.content) if (b.type === "tool_use") uses.set(b.id, b.name);
  }
  return last.content
    .filter((b): b is Anthropic.ToolResultBlockParam => b.type === "tool_result")
    .map((b) => ({
      name: uses.get(b.tool_use_id),
      value: typeof b.content === "string" ? safeJson(b.content) : b.content,
      isError: Boolean(b.is_error),
    }));
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
