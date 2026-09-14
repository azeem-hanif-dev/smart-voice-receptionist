import Anthropic from "@anthropic-ai/sdk";
import { ModelError, RuleBasedModelClient, receptionistTools, type ModelClient, type ModelRequest, type ModelResponse } from "@ar/core";
import { env, hasAnthropicKey } from "../config.js";

/** Production client: Anthropic Messages API with tool use. Errors propagate with their SDK `status`. */
export class AnthropicModelClient implements ModelClient {
  readonly name: string;
  private readonly client: Anthropic;
  constructor(private readonly model = env().ANTHROPIC_MODEL, private readonly effort = env().ANTHROPIC_EFFORT) {
    const workspace = env().ANTHROPIC_WORKSPACE_ID;
    this.client = new Anthropic({
      apiKey: env().ANTHROPIC_API_KEY,
      maxRetries: 0,
      timeout: 60_000,
      ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}),
    });
    this.name = `anthropic:${model}`;
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    // Split the system prompt so the stable business/vertical part is cacheable across turns.
    const idx = req.system.indexOf("\n\n# Right now");
    const stable = idx > 0 ? req.system.slice(0, idx) : req.system;
    const volatile = idx > 0 ? req.system.slice(idx) : "";
    try {
      const res = await this.client.messages.create({
        model: this.model,
        max_tokens: req.maxTokens,
        system: [
          { type: "text", text: stable, cache_control: { type: "ephemeral" } },
          ...(volatile ? [{ type: "text" as const, text: volatile }] : []),
        ],
        tools: req.tools.length ? req.tools : receptionistTools(),
        messages: req.messages,
        output_config: { effort: this.effort },
      });
      if (res.stop_reason === "refusal") {
        throw new ModelError("The model declined to respond", false, "refusal");
      }
      return {
        content: res.content,
        stopReason: res.stop_reason,
        usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
      };
    } catch (err) {
      if (err instanceof ModelError) throw err;
      if (err instanceof Anthropic.APIError) {
        const status = err.status ?? 0;
        const retryable = status === 408 || status === 409 || status === 429 || status >= 500 || status === 0;
        throw new ModelError(`${err.name}: ${err.message}`, retryable, String(status));
      }
      if (err instanceof Anthropic.APIConnectionError) throw new ModelError(`connection: ${err.message}`, true, "connection");
      throw err;
    }
  }
}

let shared: ModelClient | null = null;
export function defaultModelClient(): ModelClient {
  if (!shared) shared = hasAnthropicKey() ? new AnthropicModelClient() : new RuleBasedModelClient();
  return shared;
}
