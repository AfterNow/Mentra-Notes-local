# Mentra Notes v3.0.0 — Complete Feature List

## 1. Real-Time Transcription

### Always-On Recording
- Continuous microphone capture from MentraOS smart glasses
- Final vs. interim text handling (real-time updates as user speaks)
- Force-finalize at 50-word threshold to prevent buffer overflow
- Transcription pause/resume toggle (settings + FAB menu)

### Multi-Speaker Support
- Speaker ID detection and tracking
- Color-coded speaker labels in transcript view (6 colors)
- Speaker-aware segments for conversation transcripts

### Photo Capture
- Photos captured at wake word time (parallel with user speaking)
- Uploaded to Cloudflare R2 with metadata (timestamp, timezone)
- Embedded in AI-generated notes when relevant
- LLM-powered photo description for context

### Transcript Organization
- Per-day organization (YYYY-MM-DD folders)
- Available dates tracking across MongoDB + R2
- Historical transcript loading with date navigation
- Hour-by-hour segment grouping with collapsible sections
- Segment count per hour/day

## 2. Auto-Notes Pipeline

### Stage 1: ChunkBuffer
- Accumulates transcript into 40-second chunks
- 5-second heartbeat interval
- Sentence boundary detection (waits up to 3 seconds for natural pause)
- Silence signal emission when buffer empty + not speaking
- Configurable via `AUTO_NOTES_CONFIG`

### Stage 2: TriageClassifier
- **Auto-skip**: Chunks under 4 words with no high-signal keywords
- **Fast-track**: Chunks with 25+ words marked meaningful immediately
- **LLM classification**: 4-24 word chunks classified by AI as MEANINGFUL or FILLER
- Filler detection: background audio, TV/radio, podcasts, one-word acknowledgments
- Context-aware: uses 2 previous chunks for classification context
- Domain profile support (general, product manager, etc.)

### Stage 3: ConversationTracker
- State machine: `IDLE → PENDING → TRACKING → PAUSED → END`
- **PENDING**: Requires 3 meaningful chunks (~15 seconds) before creating a conversation
- **TRACKING**: Monitors for topic continuation, new topics, or filler
- **PAUSED**: Requires 2 consecutive fillers to pause, 7 silence chunks to end
- **Resumption**: LLM checks if new speech continues the paused conversation (lenient — only splits on completely unrelated subjects)
- **Topic change**: Goes through PENDING confirmation instead of instant new conversation
- Running summary maintained per conversation (compressed every 3 chunks, max 300 words)

### Note Generation
- Triggered automatically when conversation ends
- Uses Gemini 2.5 Flash for structured note generation
- HTML output with `<h2>` headings, bullet lists, `<strong>` emphasis
- 100-500 word target
- Photo embedding when relevant (LLM decides relevance)
- Safety pass for content review
- Linked back to source conversation via `noteId`

## 3. Notes Management

### CRUD Operations
- **Create**: Manual (rich text editor) or AI-generated from conversation
- **Read**: Full note view with TipTap editor, metadata display
- **Update**: Title + content editing, folder assignment
- **Delete**: Three-tier — trash → permanent delete, or empty trash

### Organization
- **Folders**: Create with name + color (red, gray, blue), move notes between folders
- **Favorites**: Quick-access flagging with star icon
- **Archive**: Hide without deleting
- **Trash**: Soft delete with recovery option, empty trash for permanent deletion
- **Filter pills**: All, Manual, AI Generated
- **Filter drawer**: Sort (recent/oldest), show filter (all/favourites/archived/trash)

### Rich Text Editor (TipTap)
- Headings (H1-H3)
- Bold, italic, underline
- Bullet and numbered lists
- Code blocks
- Image embedding (from photos)
- Link insertion

### Batch Operations (Multi-Select)
- Long-press to enter selection mode
- Select All / Cancel buttons
- Actions: Export, Move to Folder, Favorite, Trash
- Selection count display
- No text selection during selection mode (select-none)

## 4. Conversations

### Auto-Detection
- Conversations automatically detected from meaningful speech chunks
- Provisional title generated every 3 chunks (LLM)
- AI summary generated when conversation ends
- Speaker-aware segments with color coding

### Conversation Detail
- Title (auto-generated, updates as conversation progresses)
- Time range + duration (minimum 1 minute display)
- AI summary section
- Transcript section with speaker labels
- "View full transcript" expand toggle (for 8+ segments)
- Generate Note button (if no note linked)
- Go to Note button (if note exists)
- "Generating title..." spinner when title not yet available
- "Transcript deleted" indicator if transcript data was removed

### Conversation Actions
- **Favorite** with star icon (visible in list)
- **Archive / Unarchive** via swipe
- **Trash** via swipe or multi-select
- **Export**: clipboard or email with conversation summary + transcript + linked AI note
- **Merge**: Combine 2-10 conversations into one with fresh AI summary
- **Generate Note**: Create AI note from conversation segments

### Merge Feature
- Select 2-10 ended conversations
- Merge drawer shows titles of conversations being merged
- "Move originals to trash" checkbox (default: checked)
- Creates new conversation with:
  - Combined chunks from all sources (chronologically sorted)
  - Fresh AI-generated title and summary (merge-aware prompt)
  - Positioned after latest source conversation in list
- Merged conversation highlighted with subtle red pulse for 4 seconds
- Merge button grayed out when < 2 selected

## 5. Transcripts Tab

### Transcript List
- Shows all available transcript dates with segment counts
- Today highlighted with live recording indicator
- "X days of transcripts" subtitle
- Multi-select for batch export/delete

### Transcript Page (Per-Day View)
- Date header with back navigation
- Hour-by-hour collapsible sections
- Each hour shows:
  - Hour label (9 AM, 2 PM, etc.)
  - Conversation banner (linked summary title)
  - Preview segments (first 2) with "+N more" expand
  - Full expanded view with all segments
  - Collapse button
- Compact mode: single-line per hour with expand affordance
- "Transcript deleted" full-page indicator if data was removed
- Export and email via action menu

### Transcript Deletion
- Multi-select → Trash button
- Confirmation drawer with warning if conversations exist on those dates
- Permanently deletes from R2 + MongoDB (not recoverable)
- Removed from available dates list
- "Transcript deleted" shown on conversation detail and transcript pages

## 6. Search

### Semantic Search
- Search across notes and conversations
- Jina integration for semantic relevance
- Results grouped by type (Notes, Conversations)
- Score-based ranking

### Search UX
- Debounced input (400ms)
- Minimum 2-second loading state + actual query time
- Abort controller for canceling stale queries
- Recent searches in localStorage
- Filter pills: All, Notes, Conversations
- "Nothing found" empty state with suggestions

## 7. Export & Sharing

### Clipboard Export
- Notes: content + metadata (date, type, from conversation)
- Conversations: summary + transcript segments (timestamped) + linked AI note
- Transcripts: date headers + timestamped segments per day

### Email Export
- Rich HTML emails via Resend
- Note cards with type badges (AI Generated / Manual / Conversation / Transcript)
- Download buttons (PDF, TXT, Word) with signed URLs
- Session info header (date, time range)
- Responsive layout (620px desktop, full-width mobile)
- CC support with "Remember CC" checkbox
- Conversation email: includes summary, transcript table, linked notes
- Transcript email: date-separated cards with segment tables

### Export Drawer
- Content toggle (always on, not disableable)
- Linked Conversation toggle (notes) → sub-toggle for Conversation Transcript
- Linked Transcript toggle (conversations)
- Linked AI Note toggle (conversations)
- Warning for items without linked data
- Destination: Clipboard or Email

## 8. Settings

### User Profile
- Display name, role, company (from onboarding)
- Avatar from Supabase storage (falls back to initials)

### Recording
- Persistent transcription toggle

### Onboarding
- Reset onboarding option (restarts tutorial)

### Timezone
- Auto-detected from glasses
- Displayed in settings

### Mic Status Indicator
- Compact circle next to FAB button
- Red pulsing dot = mic on
- Gray muted-mic icon = mic off
- Shown on both HomePage and NotesPage

## 9. Onboarding (9 Steps)

1. Welcome screen
2. About You (name, role, company)
3. Priorities selection
4. Contacts & Topics input
5. Tutorial: Always-On recording
6. Tutorial: AI Does the Work
7. Tutorial: Stay Organized
8. Tutorial: Swipe to Manage
9. You're All Set (completion)

- Feature flag controlled (`FRONTEND_ONBOARD`)
- Won't re-trigger on reconnect (ref-guarded)
- Settings persisted to MongoDB

## 10. Glasses Integration (MentraOS)

### Connection
- Auto-detect glasses connection
- Full mode when glasses connected (mic + display)
- Timezone extraction from glasses settings

### Display Modes
- Live transcript on glasses
- Hour summaries
- Key points (future)

### Input
- Button press listeners
- Touch input handling
- Photo capture trigger

## 11. Real-Time Sync

### Architecture
- Custom sync library (`@synced` decorator)
- WebSocket connection per user
- RPC pattern: frontend calls backend methods
- Automatic state sync on property changes
- Snapshot on connect, incremental updates after
- Reconnect handling with visibility change detection
- Multi-tab support (multiple clients per session)

### Session Management
- One session per user (shared across tabs/devices)
- 11+ managers per session
- Automatic hydration from MongoDB on session create
- Graceful cleanup on disconnect
- Memory logging on create/destroy
