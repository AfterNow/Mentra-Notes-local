/**
 * Embedding Service
 *
 * Thin wrapper around OpenAI's embeddings API for generating vector embeddings
 * from text content. Used for semantic search over notes and conversations.
 *
 * Uses text-embedding-3-small (1536 dimensions) — cheap, fast, good quality.
 */

import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";

// Lazy-initialized OpenAI client to avoid errors when API key is not set
let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for embeddings. Set it in your environment or disable embedding features.",
      );
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

/**
 * Check if embedding service is available (OpenAI API key is configured)
 */
export function isEmbeddingAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Generate a single embedding vector from text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a single API call
 */
export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const response = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}

/**
 * Strip HTML tags and decode entities from rich text content.
 * Returns plain text suitable for embedding.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Prepare note text for embedding: title + stripped content
 * Returns null if text is too short to produce meaningful embeddings.
 */
export function prepareNoteText(
  title: string,
  content: string,
): string | null {
  const stripped = stripHtml(content);
  const combined = `${title} ${stripped}`.trim();
  if (combined.length < 5) return null;
  return combined;
}

/**
 * Prepare conversation text for embedding: title + aiSummary
 * Returns null if aiSummary is empty or text is too short.
 */
export function prepareConversationText(
  title: string,
  aiSummary: string,
): string | null {
  if (!aiSummary) return null;
  const combined = `${title} ${aiSummary}`.trim();
  if (combined.length < 5) return null;
  return combined;
}

/**
 * Generate and save embedding for a note (fire-and-forget).
 * Imports Note model lazily to avoid circular dependencies.
 * Silently skips if OPENAI_API_KEY is not configured.
 */
export async function embedNote(
  noteId: string,
  title: string,
  content: string,
): Promise<void> {
  if (!isEmbeddingAvailable()) return;

  const text = prepareNoteText(title, content);
  if (!text) return;

  try {
    const embedding = await generateEmbedding(text);
    const { Note } = await import("../models/note.model");
    await Note.updateOne({ _id: noteId }, { $set: { embedding } });
  } catch (error) {
    console.error(`[EmbeddingService] Failed to embed note ${noteId}:`, error);
  }
}

/**
 * Generate and save embedding for a conversation (fire-and-forget).
 * Only embeds conversations that have an aiSummary.
 * Silently skips if OPENAI_API_KEY is not configured.
 */
export async function embedConversation(
  conversationId: string,
  title: string,
  aiSummary: string,
): Promise<void> {
  if (!isEmbeddingAvailable()) return;

  const text = prepareConversationText(title, aiSummary);
  if (!text) return;

  try {
    const embedding = await generateEmbedding(text);
    const { Conversation } = await import("../models/conversation.model");
    await Conversation.updateOne(
      { _id: conversationId },
      { $set: { embedding } },
    );
  } catch (error) {
    console.error(
      `[EmbeddingService] Failed to embed conversation ${conversationId}:`,
      error,
    );
  }
}
