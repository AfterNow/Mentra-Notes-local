/**
 * Eval: Semantic Search Pipeline
 *
 * Tests the full semantic search pipeline end-to-end:
 * 1. Embedding generation (OpenAI text-embedding-3-small)
 * 2. MongoDB Atlas Vector Search ($vectorSearch)
 * 3. Result ranking and score filtering
 * 4. AI answer generation (optional)
 *
 * Prerequisites:
 *   - Seed test data: bun src/test/seed-search-data.ts
 *   - MongoDB Atlas vector indexes must exist (notes_vector_index, conversations_vector_index)
 *
 * Run all:          bun test:eval:search
 * Run relevance:    EVAL_TYPE=relevance bun test:eval:search
 * Run ranking:      EVAL_TYPE=ranking bun test:eval:search
 * Run answer:       EVAL_TYPE=answer bun test:eval:search
 *
 * Clean up after:   bun src/test/seed-search-data.ts --clean
 */

import { describe, test, afterAll, beforeAll } from "bun:test";
import mongoose from "mongoose";
import { semanticSearch } from "@/backend/core/semantic-search/search.service";
import { generateEmbedding, stripHtml, prepareNoteText, prepareConversationText } from "@/backend/services/embedding.service";
import { generateAnswer } from "@/backend/core/semantic-search/answer.service";

import searchCases from "./fixtures/semantic-search.json";

// =============================================================================
// Types
// =============================================================================

interface EvalCase {
  query: string;
  category: string;
  expectedTitles: string[];
  expectedTypes: ("note" | "conversation")[];
  note?: string;
}

interface EvalResult {
  query: string;
  category: string;
  pass: boolean;
  expectedTitle: string;
  foundAtRank: number | null; // null = not found
  topResults: string[];
  score: number | null;
  ms: number;
  evalType: string;
}

// =============================================================================
// Configuration
// =============================================================================

const TEST_USER_ID =
  process.env.TEST_USERID || "aryan.mentra.dev.public@gmail.com";

const allResults: EvalResult[] = [];

const evalType = process.argv
  .find((a) => ["relevance", "ranking", "answer"].includes(a?.toLowerCase()))
  ?.toLowerCase() || process.env.EVAL_TYPE?.toLowerCase();

// =============================================================================
// DB Connection
// =============================================================================

beforeAll(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri, { dbName: "notes" });
  }
  console.log(`[eval] Connected to MongoDB, user: ${TEST_USER_ID}\n`);
});

afterAll(async () => {
  // Print report before disconnecting
  printReport();
  await mongoose.disconnect();
});

// =============================================================================
// Eval 1: Relevance — does the expected result appear in top results?
// =============================================================================

if (!evalType || evalType === "relevance") {
  describe(`Semantic Search — Relevance (${searchCases.cases.length} cases)`, () => {
    for (const c of searchCases.cases as EvalCase[]) {
      test(
        `[${c.category}] "${c.query}" → should find "${c.expectedTitles[0]}"`,
        async () => {
          const start = Date.now();
          const results = await semanticSearch(TEST_USER_ID, c.query, 5);
          const ms = Date.now() - start;

          const expectedTitle = c.expectedTitles[0];
          const foundIndex = results.findIndex((r) =>
            r.title.toLowerCase().includes(expectedTitle.toLowerCase()),
          );
          const pass = foundIndex !== -1;

          allResults.push({
            query: c.query,
            category: c.category,
            pass,
            expectedTitle,
            foundAtRank: pass ? foundIndex + 1 : null,
            topResults: results.map((r) => `${r.type}:"${r.title}" (${r.score.toFixed(3)})`),
            score: pass ? results[foundIndex].score : null,
            ms,
            evalType: "relevance",
          });

          if (!pass) {
            const got = results.length > 0
              ? results.map((r) => `  ${r.type}:"${r.title}" (${r.score.toFixed(3)})`).join("\n")
              : "  (no results)";
            throw new Error(
              `Expected "${expectedTitle}" in top 5 results.\nGot:\n${got}`,
            );
          }
        },
        45000,
      );
    }
  });
}

// =============================================================================
// Eval 2: Ranking — expected result should be #1 for precise queries
// =============================================================================

const RANKING_CASES = [
  {
    query: "Stripe webhook duplicate event idempotency",
    expectedTitle: "Debugging the payment webhook",
    category: "exact-match",
  },
  {
    query: "EKS PodSecurityPolicy migration 1.29",
    expectedTitle: "Kubernetes cluster migration notes",
    category: "exact-match",
  },
  {
    query: "connection pooling p50 p99 latency",
    expectedTitle: "Performance optimization results",
    category: "exact-match",
  },
  {
    query: "semolina flour eggs pasta recipe",
    expectedTitle: "Recipe: Homemade pasta from scratch",
    category: "exact-match",
  },
  {
    query: "Brooks Ghost 16 running shoes half marathon",
    expectedTitle: "Running training plan discussion",
    category: "exact-match",
  },
];

if (!evalType || evalType === "ranking") {
  describe(`Semantic Search — Ranking (${RANKING_CASES.length} cases)`, () => {
    for (const c of RANKING_CASES) {
      test(
        `[${c.category}] "${c.query}" → #1 should be "${c.expectedTitle}"`,
        async () => {
          const start = Date.now();
          const results = await semanticSearch(TEST_USER_ID, c.query, 5);
          const ms = Date.now() - start;

          const pass =
            results.length > 0 &&
            results[0].title
              .toLowerCase()
              .includes(c.expectedTitle.toLowerCase());

          const foundIndex = results.findIndex((r) =>
            r.title.toLowerCase().includes(c.expectedTitle.toLowerCase()),
          );

          allResults.push({
            query: c.query,
            category: c.category,
            pass,
            expectedTitle: c.expectedTitle,
            foundAtRank: foundIndex !== -1 ? foundIndex + 1 : null,
            topResults: results.map((r) => `${r.type}:"${r.title}" (${r.score.toFixed(3)})`),
            score: foundIndex !== -1 ? results[foundIndex].score : null,
            ms,
            evalType: "ranking",
          });

          if (!pass) {
            const got = results.length > 0
              ? `"${results[0].title}" (${results[0].score.toFixed(3)})`
              : "(no results)";
            throw new Error(
              `Expected #1 to be "${c.expectedTitle}", got ${got}`,
            );
          }
        },
        30000,
      );
    }
  });
}

// =============================================================================
// Eval 3: AI Answers — generate answer from search results
// =============================================================================

const ANSWER_CASES = [
  {
    query: "What caused the API performance improvement?",
    mustContain: ["connection pool", "query"],
    category: "factual-answer",
  },
  {
    query: "What are the sprint 14 priorities?",
    mustContain: ["auth", "onboarding"],
    category: "factual-answer",
  },
  {
    query: "When is the Big Sur trip?",
    mustContain: ["march", "22"],
    category: "factual-answer",
  },
  {
    query: "How much is the new rent?",
    mustContain: ["2,500", "2500"],
    category: "factual-answer",
  },
];

if (!evalType || evalType === "answer") {
  describe(`Semantic Search — AI Answers (${ANSWER_CASES.length} cases)`, () => {
    for (const c of ANSWER_CASES) {
      test(
        `[${c.category}] "${c.query}" → answer should mention ${c.mustContain.join(" or ")}`,
        async () => {
          const start = Date.now();
          const results = await semanticSearch(TEST_USER_ID, c.query, 5);
          const answer = await generateAnswer(c.query, results);
          const ms = Date.now() - start;

          const answerLower = answer.toLowerCase();
          const pass = c.mustContain.some((term) =>
            answerLower.includes(term.toLowerCase()),
          );

          allResults.push({
            query: c.query,
            category: c.category,
            pass,
            expectedTitle: `answer contains: ${c.mustContain.join(" | ")}`,
            foundAtRank: null,
            topResults: [`Answer: "${answer.slice(0, 120)}..."`],
            score: null,
            ms,
            evalType: "answer",
          });

          if (!pass) {
            throw new Error(
              `Answer did not contain any of [${c.mustContain.join(", ")}].\nGot: "${answer}"`,
            );
          }
        },
        30000,
      );
    }
  });
}

// =============================================================================
// Eval 4: Embedding utilities (pure unit tests — no DB needed)
// =============================================================================

describe("Embedding utilities", () => {
  test("stripHtml removes tags and decodes entities", () => {
    const input = "<p>Hello &amp; <strong>world</strong></p>";
    const result = stripHtml(input);
    if (result !== "Hello & world") {
      throw new Error(`Expected "Hello & world", got "${result}"`);
    }
  });

  test("prepareNoteText combines title and stripped content", () => {
    const result = prepareNoteText("My Title", "<p>Some content here</p>");
    if (result !== "My Title Some content here") {
      throw new Error(`Unexpected: "${result}"`);
    }
  });

  test("prepareNoteText returns null for very short content", () => {
    const result = prepareNoteText("", "hi");
    if (result !== null) {
      throw new Error(`Expected null for short content, got "${result}"`);
    }
  });

  test("prepareConversationText returns null without aiSummary", () => {
    const result = prepareConversationText("Title", "");
    if (result !== null) {
      throw new Error(`Expected null without aiSummary, got "${result}"`);
    }
  });

  test("prepareConversationText combines title and summary", () => {
    const result = prepareConversationText("Chat title", "A summary of the conversation");
    if (result !== "Chat title A summary of the conversation") {
      throw new Error(`Unexpected: "${result}"`);
    }
  });

  test("generateEmbedding returns 1536-dim vector", async () => {
    const embedding = await generateEmbedding("hello world");
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      throw new Error(`Expected 1536-dim array, got ${embedding?.length}`);
    }
    if (typeof embedding[0] !== "number") {
      throw new Error(`Expected numbers, got ${typeof embedding[0]}`);
    }
  }, 15000);
});

// =============================================================================
// Report
// =============================================================================

function printReport() {
  if (allResults.length === 0) return;

  const passed = allResults.filter((r) => r.pass).length;
  const failed = allResults.filter((r) => !r.pass);
  const times = allResults.map((r) => r.ms).sort((a, b) => a - b);
  const totalMs = times.reduce((sum, t) => sum + t, 0);
  const avgMs = Math.round(totalMs / times.length);
  const medianMs = times[Math.floor(times.length / 2)];

  console.log(`\n${"=".repeat(70)}`);
  console.log(`  SEMANTIC SEARCH EVAL REPORT`);
  console.log(`${"=".repeat(70)}`);

  // Overall
  console.log(
    `\n  Score:    ${passed}/${allResults.length} passed (${Math.round((passed / allResults.length) * 100)}%)`,
  );
  console.log(`  Total:    ${(totalMs / 1000).toFixed(1)}s`);

  // Timing
  console.log(`\n  Timing:`);
  console.log(`    avg:     ${avgMs}ms`);
  console.log(`    median:  ${medianMs}ms`);
  console.log(`    min:     ${times[0]}ms`);
  console.log(`    max:     ${times[times.length - 1]}ms`);

  // By eval type
  const evalTypes = [...new Set(allResults.map((r) => r.evalType))];
  console.log(`\n  By eval type:`);
  for (const et of evalTypes) {
    const etResults = allResults.filter((r) => r.evalType === et);
    const etPassed = etResults.filter((r) => r.pass).length;
    const marker = etPassed === etResults.length ? "✅" : "⚠️";
    console.log(
      `    ${marker} ${et.padEnd(16)} ${etPassed}/${etResults.length} (${Math.round((etPassed / etResults.length) * 100)}%)`,
    );
  }

  // By category
  const categories = [...new Set(allResults.map((r) => r.category))];
  console.log(`\n  By category:`);
  for (const cat of categories) {
    const catResults = allResults.filter((r) => r.category === cat);
    const catPassed = catResults.filter((r) => r.pass).length;
    const marker = catPassed === catResults.length ? "✅" : "⚠️";
    console.log(
      `    ${marker} ${cat.padEnd(24)} ${catPassed}/${catResults.length}`,
    );
  }

  // Ranking stats (for relevance eval type)
  const relevanceResults = allResults.filter(
    (r) => r.evalType === "relevance" && r.foundAtRank !== null,
  );
  if (relevanceResults.length > 0) {
    const ranks = relevanceResults.map((r) => r.foundAtRank!);
    const avgRank = (
      ranks.reduce((s, r) => s + r, 0) / ranks.length
    ).toFixed(2);
    const rank1 = ranks.filter((r) => r === 1).length;
    console.log(`\n  Ranking quality (relevance evals):`);
    console.log(`    avg rank:    ${avgRank}`);
    console.log(
      `    #1 hits:     ${rank1}/${relevanceResults.length} (${Math.round((rank1 / relevanceResults.length) * 100)}%)`,
    );
  }

  // Failed cases
  if (failed.length > 0) {
    console.log(`\n  Failed (${failed.length}):`);
    for (const f of failed) {
      console.log(
        `    [${f.evalType}/${f.category}] "${f.query.slice(0, 50)}${f.query.length > 50 ? "..." : ""}"`,
      );
      console.log(`      expected: "${f.expectedTitle}"`);
      console.log(`      got: ${f.topResults[0] || "(no results)"}`);
    }
  }

  console.log(`\n${"=".repeat(70)}\n`);
}
