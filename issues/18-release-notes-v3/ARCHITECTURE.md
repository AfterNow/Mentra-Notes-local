# Mentra Notes v3.0.0 — Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MentraOS Glasses                      │
│  Microphone → Audio Stream → MentraOS SDK → WebSocket   │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    Hono.js Server (Bun)                  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Auth MW     │  │   API Routes │  │  WebSocket   │  │
│  │  (MentraOS)   │  │  (REST)      │  │  (Sync)      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                           │                             │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Session Manager                     │    │
│  │  ┌─────────────────────────────────────────┐    │    │
│  │  │         Per-User Session                 │    │    │
│  │  │                                         │    │    │
│  │  │  ┌──────────┐ ┌──────────┐ ┌────────┐  │    │    │
│  │  │  │Transcript │ │Conversa- │ │ Notes  │  │    │    │
│  │  │  │ Manager   │ │tion Mgr  │ │Manager │  │    │    │
│  │  │  └──────────┘ └──────────┘ └────────┘  │    │    │
│  │  │  ┌──────────┐ ┌──────────┐ ┌────────┐  │    │    │
│  │  │  │  Summary  │ │   Chat   │ │Settings│  │    │    │
│  │  │  │ Manager   │ │ Manager  │ │Manager │  │    │    │
│  │  │  └──────────┘ └──────────┘ └────────┘  │    │    │
│  │  │  ┌──────────┐ ┌──────────┐ ┌────────┐  │    │    │
│  │  │  │   File   │ │  Folder  │ │  R2    │  │    │    │
│  │  │  │ Manager   │ │ Manager  │ │Manager │  │    │    │
│  │  │  └──────────┘ └──────────┘ └────────┘  │    │    │
│  │  │  ┌──────────┐ ┌──────────┐              │    │    │
│  │  │  │  Chunk   │ │  Input   │              │    │    │
│  │  │  │ Buffer   │ │ Manager  │              │    │    │
│  │  │  └──────────┘ └──────────┘              │    │    │
│  │  └─────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │          Auto-Notes Pipeline                      │   │
│  │  ChunkBuffer → TriageClassifier → ConvTracker    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  LLM Service │  │  R2 Service  │  │ Email Service│  │
│  │  (Gemini/    │  │  (Cloudflare)│  │  (Resend)    │  │
│  │   Claude/OAI)│  │              │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐  ┌────────┐  ┌────────┐
         │MongoDB │  │  R2    │  │ Resend │
         │        │  │(Photos │  │(Email) │
         │(Data)  │  │+Trans) │  │        │
         └────────┘  └────────┘  └────────┘
```

## Data Flow: Audio → Note

```
1. Glasses Mic → Audio Stream
2. MentraOS SDK → Transcription (Deepgram/Google)
3. Transcript Segment → TranscriptManager
   ├── Persist to MongoDB (DailyTranscript)
   ├── Sync to frontend (live display)
   └── Feed to ChunkBufferManager
4. ChunkBuffer (40s window) → TranscriptChunk
5. TriageClassifier → MEANINGFUL / FILLER / AUTO-SKIPPED
6. ConversationTracker (state machine)
   ├── IDLE: Wait for meaningful chunk
   ├── PENDING: Buffer 3 chunks to confirm
   ├── TRACKING: Group chunks into conversation
   ├── PAUSED: Detect silence (7 chunks to end)
   └── END: Trigger AI summary + note generation
7. NotesManager.generateNote()
   ├── Load segments for conversation time range
   ├── Build transcript text
   ├── LLM generates structured HTML note
   └── Link note to conversation
8. Sync to frontend → User sees note in list
```

## Frontend Architecture

```
┌─────────────────────────────────────────────────────┐
│                     React 19 App                     │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │              Wouter Router                   │    │
│  │  / → HomePage                               │    │
│  │  /notes → NotesPage                         │    │
│  │  /note/:id → NotePage (editor)              │    │
│  │  /conversation/:id → ConversationDetailPage │    │
│  │  /conversation/:id/transcript → TranscriptP │    │
│  │  /conversation/:id/generating → GeneratingP │    │
│  │  /transcript/:date → TranscriptPage         │    │
│  │  /collections → CollectionsPage             │    │
│  │  /folder/:id → FolderPage                   │    │
│  │  /search → SearchPage                       │    │
│  │  /settings → SettingsPage                   │    │
│  │  /onboarding → OnboardingPage               │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ┌──────────────┐  ┌──────────────────────────┐    │
│  │  useSynced   │  │  Shared Components       │    │
│  │  (WebSocket  │  │  ExportDrawer            │    │
│  │   + RPC)     │  │  EmailDrawer             │    │
│  │              │  │  MultiSelectBar          │    │
│  │  useMulti-   │  │  SelectionHeader         │    │
│  │  Select      │  │  FilterDrawers           │    │
│  │              │  │  BottomDrawer             │    │
│  │  useAutoScr- │  │  LoadingState            │    │
│  │  oll         │  │  WaveIndicator           │    │
│  │              │  │  SkeletonLoader          │    │
│  │  useSwipeTo- │  │  FABMenu                 │    │
│  │  Reveal      │  │  DropdownMenu            │    │
│  └──────────────┘  └──────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## Database Schema

### MongoDB Collections

| Collection | Key Fields | Purpose |
|-----------|-----------|---------|
| `usersettings` | userId, displayName, timezone, onboardingCompleted, role, company, priorities | User preferences |
| `notes` | userId, title, content, date, isAIGenerated, isFavourite, isArchived, isTrashed, folderId | Notes data |
| `conversations` | userId, date, title, status, startTime, endTime, chunkIds, aiSummary, noteId | Detected conversations |
| `transcriptchunks` | userId, date, text, startTime, endTime, chunkIndex, classification, conversationId | 40s audio chunks |
| `dailytranscripts` | userId, date, segments[] | Full day transcripts |
| `hoursummaries` | userId, date, hour, summary, segmentCount | Hourly AI summaries |
| `chatmessages` | userId, date, role, content | AI chat history |
| `files` | userId, date, hasTranscript, hasNotes, r2Key, segmentCount, hourCount | Date metadata |
| `folders` | userId, name, color | Note folders |
| `userstates` | userId, batchEndOfDay | R2 batch scheduling |

### Cloudflare R2 Structure

```
transcripts/
  {userId}/
    {YYYY-MM-DD}/
      transcript.json          ← Full day transcript (archived)
      photos/
        photo-{timestamp}.jpg  ← Captured photos
```

## Sync Protocol

### Connection
1. Frontend opens WebSocket to `/ws/sync?userId=...`
2. Backend creates/gets session for user
3. Backend sends `{ type: "connected" }`
4. Backend sends `{ type: "snapshot", state: {...} }` with full state
5. Frontend renders from snapshot

### State Updates
- Backend: `@synced` property changes → diff sent as `{ type: "state_change", manager, property, value }`
- Frontend: `useSynced()` hook receives changes, triggers React re-render

### RPC Calls
- Frontend: `session.notes.generateNote(title, start, end)`
- Serialized as: `{ type: "rpc", manager: "notes", method: "generateNote", args: [...], id: "uuid" }`
- Backend executes, returns: `{ type: "rpc_response", id: "uuid", result: {...} }`
- Frontend resolves the Promise

### Reconnection
- On visibility change (tab hidden → visible): check connection, reconnect if needed
- On reconnect: full snapshot re-sent (ensures consistency)
- `onboardingResolvedRef` prevents onboarding re-trigger on reconnect
