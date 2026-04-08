/**
 * Agent Provider Types
 * Unified types that abstract away differences between LLM providers
 * (Anthropic Claude, Google Gemini, OpenAI, etc.)
 */

// =============================================================================
// Message Types
// =============================================================================

/**
 * Unified role type across all providers
 * - Anthropic: user, assistant
 * - Gemini: user, model
 * - OpenAI: user, assistant, system
 */
export type UnifiedRole = "user" | "assistant" | "system";

/**
 * Text content block
 */
export interface TextContent {
  type: "text";
  text: string;
}

/**
 * Tool use request from the model
 */
export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool result to send back to the model
 */
export interface ToolResultContent {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

/**
 * Image content (for multimodal)
 */
export interface ImageContent {
  type: "image";
  source: {
    type: "base64" | "url";
    mediaType?: string;
    data?: string;
    url?: string;
  };
}

/**
 * Union of all content types
 */
export type UnifiedContent =
  | TextContent
  | ToolUseContent
  | ToolResultContent
  | ImageContent;

/**
 * Unified message format
 */
export interface UnifiedMessage {
  role: UnifiedRole;
  content: string | UnifiedContent[];
}

// =============================================================================
// Tool Types
// =============================================================================

/**
 * JSON Schema for tool parameters
 */
export interface JSONSchema {
  type: "object";
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    items?: { type: string };
  }>;
  required?: string[];
}

/**
 * Unified tool definition
 */
export interface UnifiedTool {
  name: string;
  description: string;
  parameters: JSONSchema;
}

/**
 * Parsed tool call from model response
 */
export interface UnifiedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * Stop reason for model response
 */
export type StopReason =
  | "end_turn"      // Model finished naturally
  | "tool_use"      // Model wants to use a tool
  | "max_tokens"    // Hit token limit
  | "stop_sequence" // Hit a stop sequence
  | "error";        // Something went wrong

/**
 * Unified response from a chat completion
 */
export interface UnifiedResponse {
  /** Unique response ID */
  id: string;

  /** The content blocks in the response */
  content: UnifiedContent[];

  /** Why the model stopped */
  stopReason: StopReason;

  /** Token usage stats */
  usage: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens?: number; // Gemini 3's thinking tokens
  };

  /** Raw provider-specific response (for debugging) */
  raw?: unknown;
}

// =============================================================================
// Streaming Types
// =============================================================================

/**
 * Stream event types
 */
export type StreamEventType =
  | "message_start"
  | "content_block_start"
  | "content_block_delta"
  | "content_block_stop"
  | "message_delta"
  | "message_stop"
  | "error";

/**
 * Delta for text streaming
 */
export interface TextDelta {
  type: "text_delta";
  text: string;
}

/**
 * Delta for tool input streaming
 */
export interface ToolInputDelta {
  type: "input_json_delta";
  partialJson: string;
}

/**
 * Unified stream chunk
 */
export interface UnifiedStreamChunk {
  type: StreamEventType;

  /** For content_block_start */
  contentBlock?: {
    type: "text" | "tool_use";
    id?: string;
    name?: string;
  };

  /** For content_block_delta */
  delta?: TextDelta | ToolInputDelta;

  /** For message_delta (stop reason update) */
  stopReason?: StopReason;

  /** For message_stop (final usage) */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };

  /** For errors */
  error?: {
    type: string;
    message: string;
  };
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Model tier - fast vs smart
 */
export type ModelTier = "fast" | "smart";

/**
 * Provider-specific model configuration
 */
export interface ModelConfig {
  /** Model ID for fast operations (routing, tool calls) */
  fast: string;

  /** Model ID for smart operations (synthesis, complex reasoning) */
  smart: string;
}

/**
 * Gemini-specific options
 */
export interface GeminiOptions {
  /**
   * Thinking level for Gemini 3 models
   * Controls how much internal reasoning the model does
   */
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
}

/**
 * Anthropic-specific options
 */
export interface AnthropicOptions {
  // Future: any Claude-specific options
}

/**
 * Provider-specific options union
 */
export type ProviderOptions = GeminiOptions | AnthropicOptions;

/**
 * Options for chat completion
 */
export interface ChatOptions {
  /** Which model tier to use */
  tier: ModelTier;

  /** Maximum tokens to generate */
  maxTokens: number;

  /** System prompt/instructions */
  systemPrompt?: string;

  /** Tools available to the model */
  tools?: UnifiedTool[];

  /** Temperature (0-1) */
  temperature?: number;

  /** Provider-specific options */
  providerOptions?: ProviderOptions;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Supported provider names
 */
export type ProviderName = "anthropic" | "gemini" | "openai" | "ollama" | "llamacpp";

/**
 * Provider capabilities
 */
export interface ProviderCapabilities {
  /** Supports function/tool calling */
  toolCalling: boolean;

  /** Supports image inputs */
  vision: boolean;

  /** Supports audio inputs */
  audio: boolean;

  /** Supports video inputs */
  video: boolean;

  /** Supports streaming responses */
  streaming: boolean;

  /** Supports thinking/reasoning tokens */
  thinking: boolean;

  /** Maximum context window (tokens) */
  maxContextTokens: number;

  /** Maximum output tokens */
  maxOutputTokens: number;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** API key for authentication */
  apiKey: string;

  /** Model IDs for each tier */
  models: ModelConfig;

  /** Optional base URL override */
  baseUrl?: string;

  /** Default options */
  defaultOptions?: Partial<ChatOptions>;
}

/**
 * The main Agent Provider interface
 * All provider implementations must satisfy this interface
 */
export interface AgentProvider {
  /** Provider name */
  readonly name: ProviderName;

  /** Provider capabilities */
  readonly capabilities: ProviderCapabilities;

  /** Model configuration */
  readonly models: ModelConfig;

  /**
   * Send a chat completion request
   */
  chat(
    messages: UnifiedMessage[],
    options: ChatOptions
  ): Promise<UnifiedResponse>;

  /**
   * Send a streaming chat completion request
   */
  streamChat(
    messages: UnifiedMessage[],
    options: ChatOptions
  ): AsyncIterable<UnifiedStreamChunk>;

  /**
   * Get the model ID for a given tier
   */
  getModel(tier: ModelTier): string;

  /**
   * Validate that the provider is properly configured
   */
  validate(): Promise<boolean>;
}

// =============================================================================
// Factory Types
// =============================================================================

/**
 * Provider factory function signature
 */
export type ProviderFactory = (config: ProviderConfig) => AgentProvider;

/**
 * Registry of provider factories
 */
export type ProviderRegistry = Record<ProviderName, ProviderFactory>;
