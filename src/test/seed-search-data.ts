/**
 * Seed Semantic Search Test Data
 *
 * Injects notes and conversations with embeddings into the dev MongoDB
 * for the test user. Creates diverse content across multiple topics
 * so semantic search quality can be evaluated.
 *
 * Run with: bun src/test/seed-search-data.ts
 * Clean up: bun src/test/seed-search-data.ts --clean
 */

import { MongoClient } from "mongodb";
import OpenAI from "openai";

// =============================================================================
// Configuration
// =============================================================================

const TEST_USER_ID =
  process.env.TEST_USERID || "aryan.mentra.dev.public@gmail.com";

const MONGODB_URI = process.env.MONGODB_URI!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const EMBEDDING_MODEL = "text-embedding-3-small";

// =============================================================================
// Test Data — diverse topics for semantic search evaluation
// =============================================================================

const TEST_NOTES = [
  {
    title: "Team standup - Sprint 14 kickoff",
    summary:
      "Sprint 14 planning meeting. Focus on auth migration, new onboarding flow, and API rate limiting.",
    content:
      "<p>Sprint 14 goals discussed. Three main priorities: 1) Migrate from JWT to session-based auth for compliance. 2) Build new user onboarding wizard with progress tracking. 3) Implement API rate limiting per tenant. Backend team owns auth and rate limiting. Frontend team handles onboarding. Target completion: end of March.</p>",
    date: "2026-03-10",
    isAIGenerated: true,
  },
  {
    title: "Grocery list and meal prep ideas",
    summary:
      "Weekly grocery planning. Mediterranean diet focus with batch cooking on Sunday.",
    content:
      "<p>Need to pick up: chicken thighs, quinoa, bell peppers, feta cheese, olive oil, lemons, garlic, spinach, sweet potatoes, Greek yogurt. Meal prep plan: roasted chicken with quinoa bowls for lunch, sweet potato and spinach frittata for breakfasts. Try that new shakshuka recipe from the cookbook.</p>",
    date: "2026-03-09",
    isAIGenerated: false,
  },
  {
    title: "Bug report: Login timeout on mobile",
    summary:
      "Users experiencing 30-second timeouts on mobile login. Root cause: DNS resolution delay on cellular networks.",
    content:
      "<p>Multiple reports of login failures on mobile devices. Happens on both iOS and Android. The auth endpoint takes 30+ seconds to respond on cellular connections. Root cause identified: our DNS provider has slow resolution for mobile carriers. Fix: switch to Cloudflare DNS and add connection pooling. Workaround: users can retry on WiFi. Ticket: ENG-4521.</p>",
    date: "2026-03-08",
    isAIGenerated: true,
  },
  {
    title: "Reading notes: Designing Data-Intensive Applications",
    summary:
      "Chapter 5 notes on replication. Leader-based, multi-leader, and leaderless approaches.",
    content:
      "<p>Key concepts from Chapter 5: Replication ensures data survives node failures. Three approaches: single-leader (simplest, one write node), multi-leader (good for multi-datacenter), leaderless (Dynamo-style, quorum reads/writes). Conflict resolution strategies: last-write-wins, merge functions, CRDTs. Important: replication lag causes read-after-write consistency issues. Solutions include reading from leader for recent writes or using logical timestamps.</p>",
    date: "2026-03-07",
    isAIGenerated: false,
  },
  {
    title: "Doctor appointment follow-up",
    summary:
      "Annual checkup results. Blood work normal. Need to schedule dentist.",
    content:
      "<p>Dr. Patel said everything looks good. Blood pressure 118/76, cholesterol within range. Vitamin D slightly low — start taking 2000 IU daily supplement. Follow up in 6 months for another blood panel. Also need to schedule a dental cleaning, haven't been in over a year. Check if Dr. Kim's office takes the new insurance.</p>",
    date: "2026-03-06",
    isAIGenerated: true,
  },
  {
    title: "Architecture review: Event sourcing proposal",
    summary:
      "Proposal to adopt event sourcing for the order pipeline. Pros, cons, and migration strategy.",
    content:
      "<p>Team discussed moving order processing to event sourcing. Benefits: complete audit trail, temporal queries, replay capability for debugging. Concerns: increased storage, eventual consistency complexity, team learning curve. Proposal: start with order service only as a pilot. Use EventStoreDB or build on top of Kafka. Migration plan: dual-write for 2 weeks, then cutover. Decision deferred to next architecture review on March 20th.</p>",
    date: "2026-03-05",
    isAIGenerated: true,
  },
  {
    title: "Weekend trip planning - Big Sur",
    summary:
      "Planning a weekend trip to Big Sur. Camping at Pfeiffer campground, hiking McWay Falls trail.",
    content:
      "<p>Trip dates: March 22-23. Reserved campsite #47 at Pfeiffer Big Sur State Park. Arrive Friday evening. Saturday: hike McWay Falls trail (easy, 0.6 miles), then Ewoldsen Trail (moderate, 4.3 miles). Pack list: tent, sleeping bags, camp stove, headlamps, layers for cold nights. Stop at Nepenthe restaurant for lunch with the ocean view. Gas up before leaving — no stations in Big Sur.</p>",
    date: "2026-03-04",
    isAIGenerated: false,
  },
  {
    title: "Performance optimization results",
    summary:
      "Reduced API latency by 40% with connection pooling and query optimization.",
    content:
      "<p>After profiling, identified two bottlenecks: 1) New DB connection per request (avg 45ms overhead). Fixed with connection pooling — now reuses connections. 2) N+1 query in the dashboard endpoint. Replaced with a single aggregation pipeline. Results: p50 latency dropped from 180ms to 105ms, p99 from 850ms to 320ms. Memory usage also decreased 15% due to fewer active connections. Deployed to staging, monitoring for 48 hours before prod rollout.</p>",
    date: "2026-03-03",
    isAIGenerated: true,
  },
  {
    title: "Recipe: Homemade pasta from scratch",
    summary:
      "Italian grandmother's pasta recipe. Simple dough with semolina flour.",
    content:
      "<p>Ingredients: 2 cups semolina flour, 3 large eggs, 1 tbsp olive oil, pinch of salt. Make a well in the flour, add eggs and oil. Knead for 10 minutes until smooth and elastic. Rest for 30 minutes wrapped in plastic. Roll thin with pasta machine (setting 5 for fettuccine). Cut to desired shape. Cook in salted boiling water for 2-3 minutes (fresh pasta cooks fast). Serve with simple tomato sauce or brown butter and sage.</p>",
    date: "2026-03-02",
    isAIGenerated: false,
  },
  {
    title: "1:1 with manager - Career growth discussion",
    summary:
      "Discussed promotion timeline, tech lead responsibilities, and conference budget.",
    content:
      "<p>Sarah mentioned the senior engineer promotion cycle opens in April. Need to document impact from Q1: led auth migration, mentored two junior devs, reduced incident response time by 30%. She suggested I present at the next engineering all-hands to increase visibility. Conference budget: approved for one conference this year — considering GopherCon or KubeCon. Action items: write self-review draft by March 25, pick conference by end of week.</p>",
    date: "2026-03-01",
    isAIGenerated: true,
  },
  {
    title: "Kubernetes cluster migration notes",
    summary:
      "Migrating from EKS 1.27 to 1.29. Breaking changes in PodSecurityPolicy removal.",
    content:
      "<p>EKS upgrade path: 1.27 → 1.28 → 1.29 (can't skip versions). Critical change: PodSecurityPolicy removed in 1.25+, need to migrate to Pod Security Standards. Also: deprecated API versions for CronJob (batch/v1beta1 → batch/v1). Our Helm charts need updating. Plan: upgrade staging first, run integration tests, then production with blue-green deploy. Estimated downtime: zero with rolling updates. Schedule for next maintenance window: March 15-16.</p>",
    date: "2026-02-28",
    isAIGenerated: true,
  },
  {
    title: "Book club discussion - Project Hail Mary",
    summary:
      "Monthly book club. Discussed Andy Weir's Project Hail Mary. Themes of isolation and problem-solving.",
    content:
      "<p>Great discussion about Project Hail Mary. Everyone loved the Ryland-Rocky friendship and the xenolinguistics aspect. Key themes: scientific problem-solving under pressure, sacrifice for humanity, unlikely friendship across species. Compared to The Martian — similar lone-scientist vibe but more emotional depth. Next month's pick: 'Tomorrow, and Tomorrow, and Tomorrow' by Gabrielle Zevin. Meeting at Lisa's place on April 5th.</p>",
    date: "2026-02-27",
    isAIGenerated: false,
  },
];

const TEST_CONVERSATIONS = [
  {
    title: "Debugging the payment webhook",
    aiSummary:
      "Discussed intermittent Stripe webhook failures. Root cause: duplicate event processing due to missing idempotency keys. Fix: add Redis-based deduplication with 24-hour TTL. Also found that retry logic was not exponential — switched to exponential backoff with jitter.",
    date: "2026-03-10",
    status: "ended" as const,
  },
  {
    title: "Planning the team offsite",
    aiSummary:
      "Brainstormed ideas for the Q2 team offsite. Options: escape room, cooking class, hiking at Muir Woods. Budget: $150 per person. Date: April 12th. Need to send survey to the team by Friday. Sarah will book the venue once we decide. Also discussed combining it with a hackathon — build something fun in the morning, team activity in the afternoon.",
    date: "2026-03-09",
    status: "ended" as const,
  },
  {
    title: "Coffee chat about machine learning",
    aiSummary:
      "Informal chat with Alex about ML use cases in our product. Discussed: recommendation engine for content feed, anomaly detection for fraud, and NLP for auto-categorizing support tickets. Alex recommended starting with a simple TF-IDF classifier before jumping to transformers. Shared some Hugging Face tutorials and the fast.ai course as learning resources.",
    date: "2026-03-08",
    status: "ended" as const,
  },
  {
    title: "Apartment lease renewal discussion",
    aiSummary:
      "Talked with the landlord about lease renewal. Current rent: $2,400/month. Proposed increase to $2,600. Negotiated down to $2,500 with a 14-month lease instead of 12. Need to sign by March 20th. Also asked about replacing the dishwasher — they'll send a maintenance request. Consider whether to stay or look for a new place closer to the office.",
    date: "2026-03-07",
    status: "ended" as const,
  },
  {
    title: "Code review feedback session",
    aiSummary:
      "Reviewed PR #847 — the new caching layer for user profiles. Main feedback: cache invalidation strategy is too aggressive (clearing entire cache on any update). Suggested targeted invalidation using cache tags. Also: the TTL of 5 minutes is too short for mostly-static profile data — increase to 1 hour with event-driven invalidation. Test coverage is good but missing edge case for concurrent cache writes.",
    date: "2026-03-06",
    status: "ended" as const,
  },
  {
    title: "Running training plan discussion",
    aiSummary:
      "Discussed half-marathon training with Jamie. Current pace: 9:30/mile. Goal: sub-2-hour finish (9:09/mile pace). Plan: 4 runs per week — 2 easy, 1 tempo, 1 long run. Long runs increase by 1 mile per week, maxing at 12 miles. Race day: April 27th. Need new running shoes — current pair has 400+ miles. Jamie recommended the Brooks Ghost 16.",
    date: "2026-03-05",
    status: "ended" as const,
  },
];

// =============================================================================
// Embedding generation
// =============================================================================

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  // Batch in groups of 20 to stay under rate limits
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += 20) {
    const batch = texts.slice(i, i + 20);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    results.push(...response.data.map((d) => d.embedding));
  }
  return results;
}

function stripHtml(html: string): string {
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

// =============================================================================
// Seed and cleanup
// =============================================================================

async function seedData() {
  console.log("🔍 Seeding semantic search test data...\n");
  console.log(`User ID: ${TEST_USER_ID}`);
  console.log(`MongoDB: ${MONGODB_URI.replace(/\/\/.*@/, "//***@")}\n`);

  // Generate embeddings for all content in parallel
  console.log("📐 Generating embeddings...");

  const noteTexts = TEST_NOTES.map(
    (n) => `${n.title} ${stripHtml(n.content)}`,
  );
  const convTexts = TEST_CONVERSATIONS.map(
    (c) => `${c.title} ${c.aiSummary}`,
  );

  const [noteEmbeddings, convEmbeddings] = await Promise.all([
    generateEmbeddings(noteTexts),
    generateEmbeddings(convTexts),
  ]);

  console.log(
    `✅ Generated ${noteEmbeddings.length} note + ${convEmbeddings.length} conversation embeddings\n`,
  );

  // Insert into MongoDB
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db("notes");

    // Insert notes
    console.log("📝 Inserting notes...");
    const noteDocs = TEST_NOTES.map((note, i) => ({
      userId: TEST_USER_ID,
      title: note.title,
      summary: note.summary,
      content: note.content,
      isStarred: false,
      isAIGenerated: note.isAIGenerated,
      date: note.date,
      embedding: noteEmbeddings[i],
      createdAt: new Date(`${note.date}T12:00:00Z`),
      updatedAt: new Date(`${note.date}T12:00:00Z`),
      _testData: true, // Tag for cleanup
    }));

    const noteResult = await db.collection("notes").insertMany(noteDocs);
    console.log(`✅ Inserted ${noteResult.insertedCount} notes`);

    // Insert conversations
    console.log("💬 Inserting conversations...");
    const convDocs = TEST_CONVERSATIONS.map((conv, i) => ({
      userId: TEST_USER_ID,
      date: conv.date,
      title: conv.title,
      status: conv.status,
      startTime: new Date(`${conv.date}T10:00:00Z`),
      endTime: new Date(`${conv.date}T10:30:00Z`),
      chunkIds: [],
      runningSummary: "",
      aiSummary: conv.aiSummary,
      generatingSummary: false,
      pausedAt: null,
      resumedFrom: null,
      noteId: null,
      noteGenerationFailed: false,
      embedding: convEmbeddings[i],
      silenceCount: 0,
      chunksSinceCompression: 0,
      createdAt: new Date(`${conv.date}T10:00:00Z`),
      updatedAt: new Date(`${conv.date}T10:30:00Z`),
      _testData: true, // Tag for cleanup
    }));

    const convResult = await db
      .collection("conversations")
      .insertMany(convDocs);
    console.log(`✅ Inserted ${convResult.insertedCount} conversations`);

    console.log("\n✅ Semantic search test data seeded successfully!");
    console.log("\n📋 Next steps:");
    console.log("   1. Run the search eval: bun test:eval:search");
    console.log("   2. Or test manually: curl 'localhost:3000/search?q=performance+optimization'");
  } finally {
    await client.close();
  }
}

async function cleanData() {
  console.log("🧹 Cleaning semantic search test data...\n");

  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db("notes");

    const noteResult = await db
      .collection("notes")
      .deleteMany({ userId: TEST_USER_ID, _testData: true });
    console.log(`Deleted ${noteResult.deletedCount} test notes`);

    const convResult = await db
      .collection("conversations")
      .deleteMany({ userId: TEST_USER_ID, _testData: true });
    console.log(`Deleted ${convResult.deletedCount} test conversations`);

    console.log("\n✅ Cleanup complete!");
  } finally {
    await client.close();
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI not set");
    process.exit(1);
  }
  if (!OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY not set");
    process.exit(1);
  }

  const isClean = process.argv.includes("--clean");

  try {
    if (isClean) {
      await cleanData();
    } else {
      await seedData();
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();
