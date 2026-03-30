# Mentra Notes v3.0.0 — Changelog

## New Features

### Auto-Conversation Pipeline
- 3-stage pipeline: ChunkBuffer → TriageClassifier → ConversationTracker
- Automatic conversation detection from meaningful speech
- Provisional title generation every 3 chunks
- AI summary generation on conversation end
- Running summary maintained per conversation
- Configurable silence thresholds, word minimums, model tiers

### Multi-Select & Batch Operations
- Long-press to enter selection mode on conversations, notes, and transcripts
- Selection header with count, Cancel, Select All
- Bottom action bar with contextual actions
- No text selection during selection mode (select-none)
- Instant checkbox appearance (no shift animation)

### Conversation Merging
- Merge 2-10 ended conversations into one
- Fresh AI summary + title for merged conversation
- Chunks reassigned to merged conversation
- Option to trash originals after merge
- Merged conversation highlighted with 4-second red pulse animation
- Merge button grayed out when < 2 selected

### Export & Email System
- Export drawer with content toggles and destination selection
- Clipboard export with formatted text + metadata
- Email export via Resend with HTML templates
- Notes: linked conversation + conversation transcript sub-toggles
- Conversations: linked transcript + linked AI note toggles
- Transcripts: per-date cards with segment tables
- Content toggle always on (not disableable)
- CC support with "Remember CC" checkbox

### Transcript Deletion
- Permanently deletes from R2 + MongoDB (not soft delete)
- Warning drawer if conversations exist on those dates
- "Transcript deleted" indicator on conversation detail + transcript pages
- Removed from available dates on session reconnect

### Redesigned Pages
- Settings page: warm stone design, user profile at top, Supabase avatar
- Email templates: warm stone colors, responsive, type badges
- Conversation rows: favourite star icon, "Generating title..." spinner
- Notes page: filter/view toggle visible on empty state

### Mic Status Indicator
- Compact circle next to FAB button
- Red pulsing dot = mic on, gray icon = mic off
- Shown on HomePage and NotesPage

## Improvements

### Conversation Detection
- Requires 3 meaningful chunks to confirm (was 2)
- Requires 2 consecutive fillers to pause (was 1)
- Requires 7 silence chunks to end conversation (was 4, ~35s)
- Topic change goes through PENDING confirmation (was instant new conversation)
- Resumption classifier more lenient (only splits on completely unrelated subjects)
- Default to continuation on LLM error (was default to new topic)
- Background audio detection: TV, radio, podcasts classified as filler
- Fast-track threshold raised from 10 to 25 words

### Note Generation
- Fallback to all segments when time filter matches 0 (timezone mismatch fix)
- Uses conversation's startTime/endTime as fallback when chunks are empty
- Summary generation uses chunkIds directly (not time range query)
- Merge-aware prompt for broader title generation
- Error logged to console for debugging

### Scroll Behavior
- TranscriptTab: scroll unlocks on scroll up, re-locks near bottom (200px threshold)
- No auto-scroll on interim text updates (removed characterData from MutationObserver)
- useAutoScroll hook: same fix applied to ConversationTranscriptPage
- Initial scroll to bottom only fires once (not on every re-render)

### Search
- AbortController cancels stale queries (prevents flash of old results)
- Minimum 2-second loading + actual query time
- No more "nothing found" → results flash

### Performance
- Checkbox animations removed (instant show/hide, no framer-motion)
- ConversationList overflow: visible (not hidden) for selection highlight
- NotesPage: proper scroll container with min-h-0 + overflow-y-auto

## Bug Fixes

### Critical
- Fixed: Notes page couldn't scroll (missing overflow-y-auto + min-h-0)
- Fixed: Swipe-to-reveal broken by long-press handlers overwriting touch events (merged handlers)
- Fixed: Conversations empty state blocked transcripts tab (removed early return)
- Fixed: Transcript segments flashing between loading and "no transcript" (segmentsLoadedRef guard)
- Fixed: S3Client memory leak — hundreds of instances per day (singleton pattern)
- Fixed: ConversationManager segmentCache never cleared (clear in destroy)

### Conversation
- Fixed: "uh-huh" immediately pausing conversations (now needs 2 consecutive fillers)
- Fixed: Topic change instantly creating new conversation (now goes through PENDING)
- Fixed: Note generation failing due to time range mismatch (fallback to all segments)
- Fixed: 0 minute duration display (minimum 1 minute)
- Fixed: "New Conversation" / "Untitled Conversation" placeholder (now shows spinner)
- Fixed: Merged conversation title same as source (merge-aware prompt + chunkIds-based query)
- Fixed: Merged conversation had 0 chunks (use chunkIds array, not DB query)
- Fixed: AI summary prompt mentioning "smart glasses" (removed)

### UI
- Fixed: Text selectable during multi-select mode (select-none always applied)
- Fixed: Onboarding re-triggers on reconnect (onboardingResolvedRef guard)
- Fixed: Dark mode leaking to new users (forced light mode)
- Fixed: Favourites filter pill not showing in notes (added to condition)
- Fixed: "Nothing found" flash before conversations hydrate (guard on isConversationsHydrated)
- Fixed: Filter loading fake 3-second delay (removed, filters apply instantly)
- Fixed: Loading/empty states not centered (h-full instead of flex-1)

### Memory Leaks
- Fixed: S3Client created per-request in r2Upload + r2Fetch (singleton)
- Fixed: ConversationManager.segmentCache never cleared
- Fixed: ConversationManager.provisionalTitleInFlight not cleared on destroy
- Fixed: ChunkBufferManager buffer/callbacks not cleared on destroy
- Fixed: TranscriptManager pendingSegments not cleared on destroy
- Fixed: FileManager had no destroy() method
- Fixed: ChatManager had no destroy() method
- Fixed: SummaryManager LLM provider not cleared on destroy
- Added: Memory logging on session create/destroy

## Removed
- Dark mode toggle (always light mode, commented out for future re-enable)
- Text File export option (replaced by Email)
- Share export option (replaced by Email)
- Fake filter loading delays (3-second and 1-second timers removed)
