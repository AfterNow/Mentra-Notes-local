# Semantic Search — Phase 1 & Phase 3 Implementation Plan

## Overview

Implement semantic search over notes and conversations (Phase 1), then add AI quick answers synthesized from search results (Phase 3). Phase 2 (transcript ingestion from R2) and Phase 4 (conversational AI) are out of scope.

---

## Phase 1: Semantic Search over Notes & Conversations

### Task 1: Embedding Service

**New file:** `src/backend/services/embedding.service.ts`

Create a thin wrapper around OpenAI's embeddings API (already in `package.json` as `openai`). Use `text-embedding-3-small` — cheap, fast, 1536 dimensions, good enough for this use case.

```ts
// Exports:
export async function generateEmbedding(text: string): Promise<number[]>
export async function generateEmbeddings(texts: string[]): Promise<number[][]>
```

- Use the existing `OPENAI_API_KEY` env var.
- For notes: strip HTML tags from content, then concatenate `title + " " + stripped_content`.
- For conversations: concatenate `title + " " + aiSummary` (only embed conversations that have an `aiSummary`).
- Keep it simple — no batching beyond what OpenAI supports in a single call.

---

### Task 2: Add `embedding` Field to Note & Conversation Models

**Files:**
- `src/backend/models/note.model.ts`
- `src/backend/models/conversation.model.ts`

Add to both schemas:

```ts
embedding: { type: [Number], default: [] }
```

Add to both interfaces:

```ts
embedding: number[];
```

No migration needed — existing docs will just have `embedding: []` (empty), and won't show up in vector search results until they get backfilled.

---

### Task 3: Generate Embeddings on Create/Update

**Files:**
- `src/backend/models/note.model.ts` — update `createNote()` and `updateNote()` helpers
- `src/backend/models/conversation.model.ts` — update `createConversation()` and `updateConversation()`

For notes:
- In `createNote()`: after creation, strip HTML from content, generate embedding from `title + " " + stripped_content`, and save it.
- In `updateNote()`: if `title` or `content` changed, strip HTML, regenerate embedding.
- HTML stripping: simple regex (`text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()`) is sufficient — no need for a DOM parser.

For conversations:
- In `updateConversation()`: if `aiSummary` is being set (conversation ended), generate embedding from `title + " " + aiSummary` and save it.
- **Only embed conversations that have an `aiSummary`.** Active/paused conversations without `aiSummary` are skipped entirely — no embedding, won't appear in search.
- Backfill script also skips conversations where `aiSummary` is empty.

Fire-and-forget pattern: don't block the response on embedding generation. Use `.then()` / `.catch()` to update async.

---

### Task 4: Create MongoDB Atlas Vector Search Indexes

Two indexes needed (created via Atlas UI or CLI, not in app code):

**Index 1 — notes collection:**
```json
{
  "type": "vectorSearch",
  "definition": {
    "fields": [
      {
        "type": "vector",
        "path": "embedding",
        "numDimensions": 1536,
        "similarity": "cosine"
      },
      {
        "type": "filter",
        "path": "userId"
      }
    ]
  }
}
```

**Index 2 — conversations collection:**
Same structure, same field paths.

Index names: `notes_vector_index`, `conversations_vector_index`.

Add a script or document the Atlas CLI commands to create these indexes. Consider adding a setup script at `src/scripts/create-vector-indexes.ts`.

---

### Task 5: Search Service

**New file:** `src/backend/services/search.service.ts`

```ts
interface SearchResult {
  id: string;
  type: "note" | "conversation";
  title: string;
  summary: string;
  date: string;
  score: number;
  content?: string; // For notes
}

export async function semanticSearch(
  userId: string,
  query: string,
  limit?: number,
): Promise<SearchResult[]>
```

Implementation:
1. Generate embedding for the query using `generateEmbedding()`.
2. Run two `$vectorSearch` aggregation pipelines in parallel (one per collection):
   ```ts
   collection.aggregate([
     {
       $vectorSearch: {
         index: "notes_vector_index",
         path: "embedding",
         queryVector: queryEmbedding,
         numCandidates: 50,
         limit: limit || 10,
         filter: { userId },
       },
     },
     {
       $project: {
         title: 1,
         summary: 1,
         content: 1,
         date: 1,
         score: { $meta: "vectorSearchScore" },
       },
     },
   ]);
   ```
3. Merge results from both collections, sort by score descending, return top N.

---

### Task 6: Search API Endpoint

**File:** `src/backend/api/router.ts`

Add a new authenticated endpoint:

```
GET /api/search?q=<query>&limit=<number>
```

- Requires `authMiddleware`.
- Calls `semanticSearch(userId, query, limit)`.
- Returns `{ results: SearchResult[] }`.

---

### Task 7: Backfill Script

**New file:** `src/scripts/backfill-embeddings.ts`

A one-time script to generate embeddings for all existing notes and conversations that have `embedding: []`.

- Process in batches of 20 (OpenAI embeddings API supports batch input).
- Log progress.
- Run with `bun run src/scripts/backfill-embeddings.ts`.

---

### Task 8: Search Page (Frontend)

**New file:** `src/frontend/pages/search/SearchPage.tsx`

Layout:
- Search bar at top (shadcn `Input` with search icon).
- Results list below, each result is a clickable card showing:
  - Type badge ("Note" or "Conversation")
  - Title
  - Summary (truncated)
  - Date
  - Relevance score (optional, subtle)
- Empty state when no query / no results.
- Loading state while searching.

Use existing patterns:
- `useSynced` for auth context / userId.
- `fetch()` to call `/api/search?q=...`.
- shadcn `Input`, `Badge`, `Card` components.
- `motion` for list animations (consistent with other pages).

---

### Task 9: Add Search to Navigation

**File:** `src/frontend/components/layout/Shell.tsx`

Add a search icon (`Search` from lucide-react) to the bottom nav:
- **Mobile:** Add as 4th item in bottom bar (between Home and Settings, or as a dedicated icon).
- **Desktop:** Add to the sidebar icon list.

Route: `/search`.

**File:** `src/frontend/router.tsx`

Add route:
```tsx
<Route path="/search" component={SearchPage} />
```

---

### Task 10: Click-Through from Search Results

When a user clicks a search result:
- **Note result:** Navigate to `/note/:id` (existing route).
- **Conversation result:** Navigate to `/day/:date?tab=conversations&conversationId=<id>`. The DayPage reads the query params, switches to the Conversations tab, scrolls to the matching conversation, and auto-expands it.

**DayPage changes needed:**
- Read `tab` and `conversationId` from URL query params on mount.
- If `tab=conversations`, set the active tab to Conversations.
- If `conversationId` is present, scroll that conversation into view and expand/open it.
- Use `scrollIntoView({ behavior: "smooth" })` after the conversation list renders.

**SearchResult type update:**
- Conversation results must include the `conversationId` so the frontend can build the URL.

---

## Phase 3: AI Quick Answers

### Task 11: Answer Generation Service

**New file:** `src/backend/services/answer.service.ts`

```ts
export async function generateAnswer(
  query: string,
  searchResults: SearchResult[],
): Promise<string>
```

Implementation:
- Take the top 5 search results.
- Build a prompt with the search results as context.
- Call the existing LLM provider (`createProviderFromEnv()`) with tier `"fast"`.
- System prompt: "You are a helpful assistant. Answer the user's question based ONLY on the provided context. If the context doesn't contain enough information, say so. Be concise — 1-3 sentences."
- Return the generated answer string.

---

### Task 12: Add AI Answer to Search Endpoint

**File:** `src/backend/api/router.ts`

Extend the search endpoint with an optional `ai=true` query param:

```
GET /api/search?q=<query>&limit=10&ai=true
```

When `ai=true`:
1. Run semantic search as before.
2. Pass results to `generateAnswer()`.
3. Return `{ answer: string, results: SearchResult[] }`.

This keeps the AI answer opt-in so the base search stays fast.

---

### Task 13: AI Answer UI

**File:** `src/frontend/pages/search/SearchPage.tsx`

Add an AI answer section above the results list:
- Shows a card with the AI-generated answer.
- Has a subtle "AI Answer" label.
- Appears with a fade-in animation after search results load.
- Loading state: skeleton or shimmer while generating.
- Toggle or auto-enabled — start with always-on when results exist.

---

## Implementation Order

| #  | Task | Phase | Depends On |
|----|------|-------|------------|
| 1  | Embedding service | 1 | — |
| 2  | Add embedding field to models | 1 | — |
| 3  | Generate embeddings on create/update | 1 | 1, 2 |
| 4  | Create vector search indexes | 1 | 2 |
| 5  | Search service | 1 | 1, 4 |
| 6  | Search API endpoint | 1 | 5 |
| 7  | Backfill script | 1 | 1, 2 |
| 8  | Search page (frontend) | 1 | 6 |
| 9  | Add search to nav | 1 | 8 |
| 10 | Click-through from results | 1 | 8 |
| 11 | Answer generation service | 3 | 5 |
| 12 | Add AI answer to endpoint | 3 | 6, 11 |
| 13 | AI answer UI | 3 | 8, 12 |

Tasks 1, 2, and 4 can be done in parallel. Tasks 8, 9, 10 can be done in parallel once 6 is done. Phase 3 tasks (11-13) are sequential and depend on Phase 1 being complete.

---

## Edge Cases & Type Safety

### Types that must NOT change
- `Note` in `src/shared/types.ts` — shared with frontend, no `embedding` field. Leave it alone.
- `NoteData` in `NotesManager.ts` — same, frontend-facing. No `embedding`.
- `Conversation` in `src/shared/types.ts` — frontend type, no `embedding`.
- `ConversationManagerI` in `src/shared/types.ts` — no changes.

### Types that DO change (backend only)
- `NoteI` in `note.model.ts` — add `embedding: number[]`.
- `ConversationI` in `conversation.model.ts` — add `embedding: number[]`.
- These are Mongoose interfaces, never sent to the frontend directly. `NotesManager.hydrate()` already cherry-picks fields into `NoteData`, so the `embedding` field is naturally excluded.

### `updateNote()` model helper
- Current signature only accepts `title`, `content`, `summary`, `isStarred`. It does NOT accept `embedding`.
- **Do NOT widen that function** — it's used by the frontend-facing RPC and we don't want embeddings passed through there.
- Instead, embedding updates use a separate direct Mongoose call: `Note.updateOne({ _id }, { $set: { embedding } })`. Keep embedding logic isolated in the embedding service or a dedicated helper.

### `$project` in vector search must exclude `embedding`
- The `$project` stage in the `$vectorSearch` pipeline must NOT return the `embedding` field. Embeddings are 1536 floats — sending them over the wire to the frontend would be wasteful and leak internal data.

### HTML stripping edge cases
- Notes can contain `<img>` tags with photo URLs. Strip those too — they're not searchable text.
- Empty content after stripping (e.g., a note that's only photos) → embed just the title. If title is also empty, skip embedding.
- `&amp;`, `&lt;`, etc. — decode HTML entities after stripping tags.

### Conversations without `aiSummary`
- Active and paused conversations have no `aiSummary`. They are NOT embedded and will NOT appear in search results. This is intentional.
- The backfill script must filter: `{ aiSummary: { $ne: "" }, embedding: { $size: 0 } }` (or check for missing `embedding` field).

### Empty/short content
- If a note's stripped text (title + content) is less than ~5 characters, skip embedding. It won't produce meaningful search results.
- Same for conversations — if `title + aiSummary` is trivially short, skip.

### Embedding failures
- Fire-and-forget: if OpenAI embedding call fails (rate limit, network), the document just doesn't get an embedding. It won't appear in search.
- Log the error but don't throw — never block note creation/update on embedding failure.
- The backfill script can be re-run to catch any documents that were missed.

### Search with zero results
- If both `$vectorSearch` queries return empty (user has no embedded content yet), return `{ results: [] }` — not an error.
- Frontend shows a "No results found" empty state.

### Concurrent embedding updates
- If a user rapidly edits a note, multiple embedding calls could fire. Last-write-wins is fine — the final embedding will reflect the latest content. No locking needed.

---

## Key Decisions

- **Embedding model:** OpenAI `text-embedding-3-small` (1536 dims). Cheap ($0.02/1M tokens), fast, good quality. OpenAI SDK is already a dependency.
- **Inline embeddings:** Stored directly on note/conversation documents. Simple, no extra collections for Phase 1.
- **Fire-and-forget embedding generation:** Don't block CRUD operations on embedding calls. If embedding fails, document just won't appear in search until next update.
- **No external vector DB:** MongoDB Atlas Vector Search handles everything. No Pinecone/Weaviate dependency.
- **AI answers use existing LLM provider:** Reuses the `createProviderFromEnv()` infrastructure. No new LLM dependency.
