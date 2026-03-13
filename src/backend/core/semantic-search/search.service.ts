/**
 * Search Service
 *
 * Semantic search over notes and conversations using MongoDB Atlas Vector Search.
 * Generates a query embedding, runs $vectorSearch on both collections in parallel,
 * merges and ranks results by score.
 */

import { generateEmbedding } from "../../services/embedding.service";
import { Note } from "../../models/note.model";
import { Conversation } from "../../models/conversation.model";

export interface SearchResult {
  id: string;
  type: "note" | "conversation";
  title: string;
  summary: string;
  date: string;
  score: number;
  content?: string;
}

/**
 * Perform semantic search across notes and conversations for a user.
 */
export async function semanticSearch(
  userId: string,
  query: string,
  limit: number = 10,
): Promise<SearchResult[]> {
  console.log(`[SearchService] Searching for "${query}" (userId: ${userId}, limit: ${limit})`);

  const queryEmbedding = await generateEmbedding(query);
  console.log(`[SearchService] Generated query embedding (${queryEmbedding.length} dims)`);

  const [noteResults, conversationResults] = await Promise.all([
    searchNotes(userId, queryEmbedding, limit),
    searchConversations(userId, queryEmbedding, limit),
  ]);

  console.log(`[SearchService] Notes: ${noteResults.length}, Conversations: ${conversationResults.length}`);

  // Filter out low-relevance results, merge, sort by score descending, take top N
  const MIN_SCORE = 0.6;
  const merged = [...noteResults, ...conversationResults]
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  console.log(`[SearchService] After filtering (>=${MIN_SCORE}): ${merged.length} results`);

  return merged;
}

async function searchNotes(
  userId: string,
  queryVector: number[],
  limit: number,
): Promise<SearchResult[]> {
  try {
    const results = await Note.aggregate([
      {
        $vectorSearch: {
          index: "notes_vector_index",
          path: "embedding",
          queryVector,
          numCandidates: 50,
          limit,
          filter: { userId },
        },
      },
      {
        $project: {
          title: 1,
          summary: 1,
          content: 1,
          date: 1,
          createdAt: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ]);

    return results.map((r) => ({
      id: r._id.toString(),
      type: "note" as const,
      title: r.title || "",
      summary: r.summary || "",
      date: r.date || "",
      score: r.score,
      content: r.content,
    }));
  } catch (error: any) {
    console.error("[SearchService] Notes vector search failed:", error?.message || error);
    console.error("[SearchService] Full error:", JSON.stringify(error, null, 2));
    return [];
  }
}

async function searchConversations(
  userId: string,
  queryVector: number[],
  limit: number,
): Promise<SearchResult[]> {
  try {
    const results = await Conversation.aggregate([
      {
        $vectorSearch: {
          index: "conversations_vector_index",
          path: "embedding",
          queryVector,
          numCandidates: 50,
          limit,
          filter: { userId },
        },
      },
      {
        $project: {
          title: 1,
          aiSummary: 1,
          date: 1,
          startTime: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ]);

    return results.map((r) => ({
      id: r._id.toString(),
      type: "conversation" as const,
      title: r.title || "",
      summary: r.aiSummary || "",
      date: r.date || "",
      score: r.score,
    }));
  } catch (error: any) {
    console.error("[SearchService] Conversations vector search failed:", error?.message || error);
    console.error("[SearchService] Full error:", JSON.stringify(error, null, 2));
    return [];
  }
}
