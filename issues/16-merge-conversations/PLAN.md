# Issue #16: Merge Conversations

## Overview

Allow users to select multiple conversations and merge them into a single new conversation. This handles the case where the auto-conversation tracker splits what should be one continuous conversation into multiple pieces.

## User Flow

1. User enters multi-select mode on the Conversations tab
2. Selects 2+ conversations
3. Taps **Merge** button in the bottom bar
4. A **Merge Drawer** appears with:
   - Title: "Merge {N} Conversations?"
   - Description explaining what will happen
   - Checkbox: "Move original conversations to trash after merge" (default: checked)
   - **Merge** button (primary, dark)
   - **Cancel** button
5. On confirm:
   - Segments from all selected conversations are loaded and sorted by timestamp (oldest → newest)
   - A new conversation is created with all accumulated segments
   - AI generates a new summary and title for the merged conversation
   - If "move to trash" is checked, original conversations are trashed (not permanently deleted)
   - The linked notes on the original conversations are NOT carried over (treated as a fresh conversation)
   - User exits selection mode, sees the new merged conversation in the list

## Segment Ordering

Segments are sorted chronologically across all source conversations:
- Oldest segments first, newest last
- If conversations span multiple dates (e.g., yesterday + today), segments from yesterday come before today's
- Within the same date, sort by timestamp

## Edge Cases (Basic)

| Case | Behavior |
|------|----------|
| Conversations have linked AI notes | Notes are ignored — merge creates a fresh conversation with no noteId |
| Conversations span multiple dates | New conversation uses the earliest date as its `date`, with `startTime` from earliest segment and `endTime` from latest |
| One conversation is active/paused | Active/paused conversations cannot be selected, so this can't happen |
| Only 1 conversation selected | Merge button is disabled (need 2+) |
| Conversations are from trash | Merge button hidden when in trash filter |
| Original conversations trashed | Optional via checkbox — moves to trash, not permanent delete |
| Merged conversation has 0 segments | Shouldn't happen since we require ended conversations with chunks, but fallback: use chunks text if segments fail to load |

## Edge Cases (Deep Investigation)

### HIGH RISK

#### Chunk References & Orphaning
- Each `TranscriptChunk` has a `conversationId` field. When merging, all chunks from source conversations must be reassigned to the merged conversation's ID
- If any chunk is missed, it becomes orphaned — queryable only by time range, breaking conversation integrity
- `chunkIds` array must be merged in chronological order by `chunkIndex`/`startTime`, not insertion order
- If a chunk was already deleted (cleanup), the merged conversation will silently have fewer segments
- **Mitigation:** Reassign chunk `conversationId` in bulk via `TranscriptChunk.updateMany()`, deduplicate chunk IDs before merging

#### Frontend Sync & State Mismatch
- The frontend syncs via `conversations.set()` which replaces the entire list
- If merging happens server-side without properly syncing, the frontend still has old conversation objects
- Clicking a trashed/deleted source conversation after merge crashes the UI
- **Mitigation:** Atomic sync — add the new conversation and remove/update the old ones in a single `conversations.mutate()` call

#### Stale Embeddings (Semantic Search)
- Conversations store an `embedding` field (vector for semantic search), generated when `aiSummary` is set
- Merging changes the conversation's content, making old embeddings irrelevant
- If not regenerated, semantic search returns incorrect results
- **Mitigation:** Regenerate embedding after generating the new AI summary

#### Concurrency & Race Conditions
- If a merge is in progress and new chunks are being added to one of the source conversations, the merge could miss chunks
- If a note is being generated from a source conversation simultaneously, it might fail or generate from partial data
- **Mitigation:** Only allow merging of "ended" conversations (already enforced). Add a merge lock to prevent concurrent merges on the same conversations

### MEDIUM RISK

#### Cross-Date Conversations
- A conversation's `date` field stores ONE date (start date in user's timezone)
- Merging conversations across different dates forces a choice — merged conversation can only belong to one date
- This breaks the assumption that conversations are grouped by day
- **Mitigation:** Use the earliest date. Show a note in the merge drawer if conversations span multiple dates

#### Running Summary Word Count
- Each conversation has a `runningSummary` (compressed transcript text, max 300 words)
- Merging 3 conversations with 300-word summaries = 900 words, exceeding the compression target
- The `runningSummary` is used by the LLM for chunk classification and resumption checks
- **Mitigation:** Don't concatenate running summaries — regenerate from the AI summary of the merged conversation

#### Orphaned Notes
- Source conversations may have linked notes (`noteId`). After merging:
  - The notes still exist but now reference conversations that may be trashed
  - The `From: conversation title` label on those notes becomes stale
- **Mitigation:** Don't delete notes. They remain as standalone notes. Their `From:` label might show a trashed conversation title — acceptable

#### Segment Loading from Different Sources
- Segments come from a 3-tier fallback: in-memory → MongoDB → R2
- Merging conversations from different dates may hit different sources
- If R2 data was deleted for one conversation (transcript deleted feature), those segments are silently lost
- **Mitigation:** Log a warning if any source conversation returns 0 segments. Show in the merge drawer if data is missing

#### Title Decision
- Each source conversation has a different title
- **Mitigation:** Regenerate title from the merged AI summary (LLM call). Don't try to combine existing titles

### LOW RISK

#### Favourite/Archive/Trash Status Conflicts
- Source conversations may have different statuses (one favourited, one archived)
- **Mitigation:** New conversation starts as default (not favourited, not archived, not trashed). User can favourite after

#### Resumption Metadata
- Conversations have `resumedFrom` field for lineage tracking
- Merging breaks the lineage chain
- **Mitigation:** Set `resumedFrom: null` on merged conversation. Not user-facing

#### Metadata & Timestamps
- `createdAt`/`updatedAt` on the merged conversation should use current time
- Chunks have `metadata` field that may have conflicting data
- **Mitigation:** Use current time for `createdAt`. Chunk metadata is preserved as-is

## Implementation Plan

### Phase 1: Backend RPC

**File:** `src/backend/session/managers/ConversationManager.ts`

Add new RPC method:

```typescript
@rpc
async mergeConversations(
  conversationIds: string[],
  trashOriginals: boolean
): Promise<string> // returns new conversation ID
```

Steps:
1. Validate: all conversations exist, status is "ended", at least 2 IDs
2. Sort source conversations by `startTime` ascending (chronological order)
3. For each conversation, load segments via `getSegmentsForConversation()`
4. Merge all segments into one array, sort by `timestamp` ascending, deduplicate
5. Merge all `chunkIds` from source conversations, sorted chronologically
6. Reassign chunk `conversationId` to the new conversation ID via bulk update
7. Create new conversation record with:
   - `date`: earliest conversation's date
   - `startTime`: earliest segment/chunk timestamp
   - `endTime`: latest segment/chunk timestamp
   - `status`: "ended"
   - `noteId`: null
   - `isFavourite`: false, `isArchived`: false, `isTrashed`: false
   - Combined `chunkIds`
   - `runningSummary`: empty (will be regenerated)
8. Generate AI summary + title via existing `generateAISummary()` flow
9. Generate embedding from the new AI summary
10. If `trashOriginals`: call `trashConversation()` for each source (NOT delete — preserves data)
11. Sync to frontend: add new conversation, update trashed ones in a single `conversations.mutate()`
12. Return the new conversation ID

### Phase 2: Frontend — Merge Button (DONE)

**File:** `src/frontend/pages/home/HomePage.tsx`

- ✅ `MergeIcon` added to `MultiSelectBar.tsx`
- ✅ Merge action added to `convSelectActions`
- TODO: Disable merge when < 2 conversations selected
- TODO: Wire onClick to open merge drawer

### Phase 3: Frontend — Merge Drawer

**File:** `src/frontend/pages/home/HomePage.tsx` (inline)

Vaul Drawer with:
- Title: "Merge {N} Conversations?"
- List of conversation titles being merged (scrollable if many)
- Warning if conversations span multiple dates
- Warning if any source conversation has 0 loadable segments
- Checkbox: "Move originals to trash" (default checked)
- Merge button (calls the RPC, shows loading state)
- Cancel button

### Phase 4: Type Updates

**File:** `src/shared/types.ts`

Add to `ConversationManagerI`:
```typescript
mergeConversations(conversationIds: string[], trashOriginals: boolean): Promise<string>;
```

## Files to Modify

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `mergeConversations` to `ConversationManagerI` |
| `src/backend/session/managers/ConversationManager.ts` | Add `mergeConversations` RPC |
| `src/backend/models/conversation.model.ts` | May need bulk chunk reassignment helper |
| `src/frontend/components/shared/MultiSelectBar.tsx` | ✅ `MergeIcon` added |
| `src/frontend/pages/home/HomePage.tsx` | Add merge drawer, handler, state |

## Design Notes

- Merge button uses a "combine" icon (two arrows merging into one line)
- Button sits between Export and Favorite in the bottom bar
- Only enabled when 2+ conversations are selected
- Drawer matches the existing delete confirmation drawer style (vaul, warm stone design)
- Merge is an async operation — show a loading spinner on the button while in progress
- After merge completes, auto-navigate to the new conversation detail page (optional)

## Decisions

1. **No auto-navigate after merge.** Spinner on merge button → generates → exits selection mode → merged conversation appears in the list naturally.
2. **Max 10 conversations** can be merged at once. Show error/disable if > 10 selected.
3. **No preview** in the merge drawer. Keep it simple — title, description, trash checkbox, merge button.
