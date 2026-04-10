/**
 * llama.cpp Provider
 * Local LLM implementation using llama.cpp server with OpenAI-compatible API
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

const DEFAULT_BASE_URL = "http://localhost:8080";

const DEFAULT_MODELS: ModelConfig = {
  fast: "local-model",
  smart: "local-model",
};

const CAPABILITIES: ProviderCapabilities = {
  toolCalling: false, // llama.cpp server may support it but varies by configuration
  vision: false, // Depends on model and server configuration
  audio: false,
  video: false,
  streaming: true,
  thinking: false,
  maxContextTokens: 128000, // Varies by model
  maxOutputTokens: 4096, // Varies by model
};

/**
 * OpenAI-compatible message format
 */
interface LlamaCppMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * OpenAI-compatible chat request format
 */
interface LlamaCppChatRequest {
  model: string;
  messages: LlamaCppMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

/**
 * OpenAI-compatible chat response format
 */
interface LlamaCppChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI-compatible streaming chunk format
 */
interface LlamaCppStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

/**
 * Convert unified message to llama.cpp format
 */
function toLlamaCppMessage(message: UnifiedMessage): LlamaCppMessage {
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
 * Convert llama.cpp response to unified format
 */
function fromLlamaCppResponse(response: LlamaCppChatResponse): UnifiedResponse {
  const choice = response.choices[0];
  const content: UnifiedContent[] = [];

  if (choice?.message?.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  let stopReason: StopReason = "end_turn";
  if (choice?.finish_reason === "length") {
    stopReason = "max_tokens";
  } else if (choice?.finish_reason === "stop") {
    stopReason = "end_turn";
  }

  return {
    id: response.id || `llamacpp-${Date.now()}`,
    content,
    stopReason,
    usage: {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
    },
    raw: response,
  };
}

export class LlamaCppProvider implements AgentProvider {
  readonly name = "llamacpp" as const;
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
      // Check if llama.cpp server is responding
      const response = await fetch(`${this.baseUrl}/health`);
      if (response.ok) return true;

      // Some versions use /v1/models endpoint
      const modelsResponse = await fetch(`${this.baseUrl}/v1/models`);
      return modelsResponse.ok;
    } catch (error) {
      console.error("[LlamaCppProvider] Validation failed:", error);
      return false;
    }
  }

  async chat(
    messages: UnifiedMessage[],
    options: ChatOptions,
  ): Promise<UnifiedResponse> {
    const llamaCppMessages: LlamaCppMessage[] = [];

    // Add system prompt if provided
    if (options.systemPrompt) {
      llamaCppMessages.push({
        role: "system",
        content: options.systemPrompt,
      });
    }

    // Add conversation messages
    for (const msg of messages) {
      // Skip system messages if we already have a systemPrompt
      if (msg.role === "system" && options.systemPrompt) {
        continue;
      }
      llamaCppMessages.push(toLlamaCppMessage(msg));
    }

    const request: LlamaCppChatRequest = {
      model: this.getModel(options.tier),
      messages: llamaCppMessages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      stream: false,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`llama.cpp API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as LlamaCppChatResponse;
    return fromLlamaCppResponse(data);
  }

  async *streamChat(
    messages: UnifiedMessage[],
    options: ChatOptions,
  ): AsyncIterable<UnifiedStreamChunk> {
    const llamaCppMessages: LlamaCppMessage[] = [];

    // Add system prompt if provided
    if (options.systemPrompt) {
      llamaCppMessages.push({
        role: "system",
        content: options.systemPrompt,
      });
    }

    // Add conversation messages
    for (const msg of messages) {
      if (msg.role === "system" && options.systemPrompt) {
        continue;
      }
      llamaCppMessages.push(toLlamaCppMessage(msg));
    }

    const request: LlamaCppChatRequest = {
      model: this.getModel(options.tier),
      messages: llamaCppMessages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      stream: true,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`llama.cpp API error: ${response.status} - ${error}`);
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
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine === "data: [DONE]") continue;

          // SSE format: lines start with "data: "
          const dataPrefix = "data: ";
          if (!trimmedLine.startsWith(dataPrefix)) continue;

          const jsonStr = trimmedLine.slice(dataPrefix.length);
          try {
            const chunk = JSON.parse(jsonStr) as LlamaCppStreamChunk;
            const delta = chunk.choices[0]?.delta;

            if (delta?.content) {
              yield {
                type: "content_block_delta",
                delta: { type: "text_delta", text: delta.content },
              };
            }

            if (chunk.choices[0]?.finish_reason) {
              const fr = chunk.choices[0].finish_reason;
              let stopReason: StopReason = "end_turn";
              if (fr === "length") stopReason = "max_tokens";

              yield {
                type: "message_delta",
                stopReason,
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

export function createLlamaCppProvider(config: ProviderConfig): AgentProvider {
  return new LlamaCppProvider(config);
}
