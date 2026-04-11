/**
 * Ollama Provider
 * Local LLM implementation of the AgentProvider interface using Ollama REST API
 */

import type {
  AgentProvider,
  ProviderConfig,
  ProviderCapabilities,
  ModelConfig,
  UnifiedMessage,
  UnifiedContent,
  UnifiedResponse,
  UnifiedStreamChunk,
  ChatOptions,
  ModelTier,
  StopReason,
  TextContent,
} from "./types";

const DEFAULT_BASE_URL = "http://localhost:11434";

// Default timeout: 15 minutes (local models can be slow, especially on CPU)
// At 3-4 tokens/sec with 4096 max tokens = ~17-22 minutes worst case
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

// Allow override via environment variable
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || "", 10) || DEFAULT_TIMEOUT_MS;

const DEFAULT_MODELS: ModelConfig = {
  fast: "llama3.1",
  smart: "llama3.1:70b",
};

const CAPABILITIES: ProviderCapabilities = {
  toolCalling: false, // Ollama doesn't have native tool calling support
  vision: false, // Depends on model, most don't support it
  audio: false,
  video: false,
  streaming: true,
  thinking: false,
  maxContextTokens: 128000, // Varies by model
  maxOutputTokens: 4096, // Varies by model
};

/**
 * Ollama API message format
 */
interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Ollama chat request format
 */
interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

/**
 * Ollama chat response format (non-streaming)
 */
interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama streaming response chunk
 */
interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Convert unified message to Ollama format
 */
function toOllamaMessage(message: UnifiedMessage): OllamaMessage {
  let content: string;

  if (typeof message.content === "string") {
    content = message.content;
  } else {
    // Extract text from content blocks
    content = message.content
      .filter((c): c is TextContent => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  }

  return {
    role: message.role,
    content,
  };
}

/**
 * Convert Ollama response to unified format
 */
function fromOllamaResponse(response: OllamaChatResponse): UnifiedResponse {
  const content: UnifiedContent[] = [];

  if (response.message?.content) {
    content.push({ type: "text", text: response.message.content });
  }

  return {
    id: `ollama-${Date.now()}`,
    content,
    stopReason: "end_turn" as StopReason,
    usage: {
      inputTokens: response.prompt_eval_count || 0,
      outputTokens: response.eval_count || 0,
    },
    raw: response,
  };
}

export class OllamaProvider implements AgentProvider {
  readonly name = "ollama" as const;
  readonly capabilities = CAPABILITIES;
  readonly models: ModelConfig;

  private baseUrl: string;
  private apiKey?: string;

  constructor(config: ProviderConfig) {
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.apiKey = config.apiKey || undefined;
    this.models = config.models || DEFAULT_MODELS;
  }

  getModel(tier: ModelTier): string {
    return this.models[tier];
  }

  async validate(): Promise<boolean> {
    try {
      // Check if Ollama server is responding
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch (error) {
      console.error("[OllamaProvider] Validation failed:", error);
      return false;
    }
  }

  async chat(
    messages: UnifiedMessage[],
    options: ChatOptions,
  ): Promise<UnifiedResponse> {
    const ollamaMessages: OllamaMessage[] = [];

    // Add system prompt if provided
    if (options.systemPrompt) {
      ollamaMessages.push({
        role: "system",
        content: options.systemPrompt,
      });
    }

    // Add conversation messages
    for (const msg of messages) {
      // Skip system messages that are already handled via systemPrompt
      if (msg.role === "system" && !options.systemPrompt) {
        ollamaMessages.push(toOllamaMessage(msg));
      } else if (msg.role !== "system") {
        ollamaMessages.push(toOllamaMessage(msg));
      }
    }

    // If no messages yet and there's a system prompt, add the system messages from input
    if (messages.some((m) => m.role === "system")) {
      const systemMsgs = messages.filter((m) => m.role === "system");
      for (const msg of systemMsgs) {
        if (!options.systemPrompt) {
          // Only add if we haven't already set a system prompt from options
          const existingSystemIdx = ollamaMessages.findIndex(
            (m) => m.role === "system",
          );
          if (existingSystemIdx === -1) {
            ollamaMessages.unshift(toOllamaMessage(msg));
          }
        }
      }
    }

    const request: OllamaChatRequest = {
      model: this.getModel(options.tier),
      messages: ollamaMessages,
      stream: false,
      options: {
        temperature: options.temperature,
        num_predict: options.maxTokens,
      },
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    return fromOllamaResponse(data);
  }

  async *streamChat(
    messages: UnifiedMessage[],
    options: ChatOptions,
  ): AsyncIterable<UnifiedStreamChunk> {
    const ollamaMessages: OllamaMessage[] = [];

    // Add system prompt if provided
    if (options.systemPrompt) {
      ollamaMessages.push({
        role: "system",
        content: options.systemPrompt,
      });
    }

    // Add conversation messages (excluding system if systemPrompt is set)
    for (const msg of messages) {
      if (msg.role === "system" && options.systemPrompt) {
        continue;
      }
      ollamaMessages.push(toOllamaMessage(msg));
    }

    const request: OllamaChatRequest = {
      model: this.getModel(options.tier),
      messages: ollamaMessages,
      stream: true,
      options: {
        temperature: options.temperature,
        num_predict: options.maxTokens,
      },
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error("No response body for streaming");
    }

    yield { type: "message_start" };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const chunk = JSON.parse(line) as OllamaStreamChunk;

            if (chunk.message?.content) {
              yield {
                type: "content_block_delta",
                delta: { type: "text_delta", text: chunk.message.content },
              };
            }

            if (chunk.done) {
              yield {
                type: "message_delta",
                stopReason: "end_turn",
                usage: {
                  inputTokens: chunk.prompt_eval_count || 0,
                  outputTokens: chunk.eval_count || 0,
                },
              };
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: "message_stop" };
  }
}

export function createOllamaProvider(config: ProviderConfig): AgentProvider {
  return new OllamaProvider(config);
}
