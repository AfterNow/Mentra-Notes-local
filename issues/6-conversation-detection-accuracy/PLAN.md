# Conversation Detection Accuracy

## Current Issues

### Issue 1: Single-chunk conversations (noise)

One meaningful chunk instantly creates a conversation. Overheard fragments, background audio, and one-off sentences all become "conversations."

**Examples:**
- "Everybody listen. Somebody took my electric butter warmer" → becomes "Missing Electric Butter Warmer" conversation
- "If carbon dioxide or CO2 from the air" → becomes "CO2 Discussion"
- A plant biology lecture playing on TV → becomes "Plant Health and Sunlight Balance"

### Issue 2: Running summary never compressed

`runningSummary` grows unbounded — every chunk's text is appended with `\n`. Config has `SUMMARY_MAX_WORDS: 300` and `SUMMARY_COMPRESSION_INTERVAL: 3` but compression was never implemented. For long conversations:
- Wastes tokens when sent to LLM for `classifyChunkInContext()` and `checkResumption()`
- Could degrade classification quality as context gets noisy

### Issue 3: NoteGenerator is dead code

`NoteGenerator.ts` is exported but never instantiated or called. The actual note system is `NotesManager` (frontend-triggered RPC). NoteGenerator should be removed.

### Issue 4: Preamble chunks silently reclassified

When a new conversation starts, 3 preceding chunks are pulled in as "preamble." Their classification stays as-is but they get assigned to the conversation — even if they were originally "filler." This can pull irrelevant content into conversations.

### Issue 5: Triage classifier too generous with broadcast content

The classifier marks overheard facts from TV/podcasts/YouTube as "meaningful" because they contain specific information. But the user isn't participating — it's ambient audio.

### Issue 6: No logging for pipeline state transitions

Hard to debug why a conversation was created or why chunks were classified a certain way. No structured logging that traces a chunk through the full pipeline.

---

## Plan

### Fix 1: PENDING state — require 3 meaningful chunks to confirm a conversation

Add a `PENDING` state to the state machine:

```
IDLE → PENDING (accumulating) → TRACKING (confirmed) → PAUSED → END
```

**Logic:**
- First meaningful chunk in IDLE → move to `PENDING`, buffer the chunk (don't create DB conversation yet)
- Each subsequent meaningful chunk in PENDING → add to pending buffer
- After 3 meaningful chunks → promote to `TRACKING`: create conversation in DB with all buffered chunks
- If silence threshold (3 filler chunks) hit while in PENDING → discard pending buffer, back to IDLE
- Pending chunks are still persisted as transcript chunks, just not assigned to a conversation

**Logging:**
```
[ConversationTracker] IDLE → PENDING | first meaningful chunk received (chunk #12, 15 words)
[ConversationTracker] PENDING | buffered chunk 2/3 (chunk #13, 22 words)
[ConversationTracker] PENDING | buffered chunk 3/3 — promoting to TRACKING
[ConversationTracker] PENDING → TRACKING | conversation created: 507f1f77bcf86cd799439011 (3 chunks)
```

Or if it fizzles out:
```
[ConversationTracker] PENDING | silence chunk 1/3
[ConversationTracker] PENDING | silence chunk 2/3
[ConversationTracker] PENDING | silence chunk 3/3 — discarding pending buffer (2 chunks never confirmed)
[ConversationTracker] PENDING → IDLE | pending conversation discarded
```

**Config:**
- `MIN_CHUNKS_TO_CONFIRM: 3` — tunable, start with 3

**Files:**
- `core/auto-conversation/ConversationTracker.ts`
- `core/auto-conversation/config.ts`

---

### Fix 2: Running summary compression

Every `SUMMARY_COMPRESSION_INTERVAL` (3) chunks, if `runningSummary` exceeds `SUMMARY_MAX_WORDS` (300), compress it with an LLM call.

**Logic:**
- Track `chunksSinceCompression` counter on the conversation
- After every 3 chunks added, check word count
- If over 300 words, call LLM (fast tier) to compress to ~150 words while preserving key facts
- Update `runningSummary` in DB

**Logging:**
```
[ConversationTracker] Summary compression triggered (conv 507f1f77, 450 words → compressing to ~150)
[ConversationTracker] Summary compressed: 450 → 142 words
```

**Files:**
- `core/auto-conversation/ConversationTracker.ts` — add compression in `addChunkToConversation()`

---

### Fix 3: Remove NoteGenerator (dead code)

Delete `NoteGenerator.ts` and remove its re-export from `core/auto-conversation/index.ts`.

**Files:**
- Delete `core/auto-conversation/NoteGenerator.ts`
- `core/auto-conversation/index.ts` — remove export line

---

### Fix 4: Tighten triage classifier for broadcast content

Add broadcast/ambient detection to the classifier prompt.

**Add to FILLER criteria:**
- One-way educational monologues, lectures, podcasts, or news segments
- Content that lacks conversational markers (no turn-taking, no direct address)
- Audio that sounds scripted or read aloud

**Add to system preamble:**
- "You are classifying audio from smart glasses worn by a single user. If the chunk sounds like TV, a podcast, YouTube, or a lecture playing in the background — not a conversation the user is participating in — classify as FILLER."

**Logging:**
```
[TriageClassifier] Chunk #14: meaningful (LLM: MEANINGFUL, 22 words, 340ms)
[TriageClassifier] Chunk #15: filler (LLM: FILLER, 18 words, 290ms)
[TriageClassifier] Chunk #16: auto-skipped (3 words, no keywords, skipped LLM)
```

**Files:**
- `classifier/TriageClassifier.ts`
- `test/evals/classifier/fixtures/` — add broadcast test cases

---

### Fix 5: Pipeline-wide structured logging

Add consistent, traceable logging across all pipeline stages so you can follow a chunk from buffer → triage → tracker → conversation.

**Format:** `[Stage] STATE → STATE | description (key metrics)`

**ChunkBufferManager:**
```
[ChunkBuffer] Chunk #12 emitted: 15 words, "The meeting is at 3 PM..." (buffered 12.3s)
[ChunkBuffer] Silence signal emitted (no speech for 12s)
[ChunkBuffer] Skipping silence — user still speaking (interim results active)
```

**TriageClassifier:**
```
[Triage] Chunk #12: auto-skipped (3 words, below minimum, no keywords)
[Triage] Chunk #13: meaningful (LLM: MEANINGFUL, 22 words, 340ms)
[Triage] Chunk #14: filler (LLM: FILLER, 18 words, 290ms)
```

**ConversationTracker:**
```
[Tracker] State: IDLE | received meaningful chunk #13
[Tracker] IDLE → PENDING | first meaningful chunk buffered (1/3)
[Tracker] State: PENDING | meaningful chunk #14 buffered (2/3)
[Tracker] State: PENDING | meaningful chunk #15 buffered (3/3) — confirming conversation
[Tracker] PENDING → TRACKING | conversation 507f1f77 created (3 chunks)
[Tracker] State: TRACKING | chunk #16 classified as CONTINUATION (LLM, 280ms)
[Tracker] State: TRACKING | filler received — pausing
[Tracker] TRACKING → PAUSED | conversation 507f1f77 paused (silenceCount: 1)
[Tracker] State: PAUSED | silence 2/3
[Tracker] State: PAUSED | silence 3/3 — ending conversation
[Tracker] PAUSED → IDLE | conversation 507f1f77 ended (6 chunks, 2m 14s)
```

**ConversationManager:**
```
[ConvManager] AI summary generation started for 507f1f77
[ConvManager] AI summary complete: "Weekly Standup Notes" (512ms)
```

---

## Implementation Order

1. **Fix 5** — logging first (helps debug everything else)
2. **Fix 3** — remove dead code (NoteGenerator)
3. **Fix 1** — PENDING state (biggest accuracy impact)
4. **Fix 4** — triage classifier prompt update
5. **Fix 2** — summary compression (polish)

## Config Changes Summary

```typescript
// New
MIN_CHUNKS_TO_CONFIRM: 3,        // Meaningful chunks needed before creating a conversation
PENDING_SILENCE_THRESHOLD: 3,    // Filler chunks in PENDING before discarding

// Existing (no change needed)
PRE_FILTER_WORD_MIN: 4,          // Keep at 4 — PENDING state handles the noise now
SILENCE_END_CHUNKS: 3,
SUMMARY_COMPRESSION_INTERVAL: 3,
SUMMARY_MAX_WORDS: 300,
```
