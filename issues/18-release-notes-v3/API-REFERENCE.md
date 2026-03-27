# Mentra Notes v3.0.0 — API Reference

## Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check, returns active session count |
| GET | `/api/auth/status` | Authentication status check |
| GET | `/api/session/status` | Current session state (connected, recording, counts) |

## Notes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notes` | Get all notes for authenticated user |
| GET | `/api/notes/:id` | Get specific note by ID |
| POST | `/api/notes` | Create manual note (title, content) |
| POST | `/api/notes/generate` | Generate AI note from transcript |
| PUT | `/api/notes/:id` | Update note (title, content) |
| DELETE | `/api/notes/:id` | Delete note |
| GET | `/api/notes/:id/download/:format` | Download note as PDF/TXT/DOCX (signed URL token required) |

## Transcripts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transcripts/today` | Get today's transcript segments |
| GET | `/api/transcripts/:date` | Get historical transcript for specific date |
| DELETE | `/api/transcripts/today` | Clear today's transcript |

## Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get user settings |
| PUT | `/api/settings` | Update user settings |

## Files (Date Management)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files` | Get all files with optional filter query param |
| GET | `/api/files/:date` | Get specific date's file metadata |
| PATCH | `/api/files/:date` | Update file flags (archived, trashed, favourite) |

## Photos

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/photos/:date/:filename` | Proxy R2 photo to browser |

## Email

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/email/send` | Send notes email via Resend |
| POST | `/api/transcript/email` | Send transcript email via Resend |

### POST /api/email/send — Request Body

```json
{
  "to": "user@email.com",
  "cc": ["cc@email.com"],
  "sessionDate": "March 22, 2026",
  "sessionStartTime": "9:00 AM",
  "sessionEndTime": "5:00 PM",
  "notes": [
    {
      "noteId": "abc123",
      "noteTimestamp": "9:30 AM",
      "noteTitle": "Meeting Notes",
      "noteContent": "<p>HTML content...</p>",
      "noteType": "AI Generated"
    }
  ]
}
```

### POST /api/transcript/email — Request Body

```json
{
  "to": "user@email.com",
  "cc": ["cc@email.com"],
  "userId": "user-id",
  "date": "2026-03-22",
  "sessionDate": "March 22, 2026",
  "sessionStartTime": "9:00 AM",
  "sessionEndTime": "5:00 PM",
  "segments": [
    { "timestamp": "9:00 AM", "text": "Hello everyone..." }
  ]
}
```

## Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=...&limit=10&userId=...` | Semantic search across notes and conversations |

## Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/mentra/auth/init` | Initialize auth (exchange temp token / verify signed token) |

## WebSocket

| Endpoint | Description |
|----------|-------------|
| `ws://host/ws/sync?userId=...` | Real-time sync connection |

### WebSocket Messages (Client → Server)

```json
{ "type": "rpc", "manager": "notes", "method": "generateNote", "args": [...], "id": "uuid" }
```

### WebSocket Messages (Server → Client)

```json
{ "type": "connected" }
{ "type": "snapshot", "state": { ... } }
{ "type": "state_change", "manager": "notes", "property": "notes", "value": [...] }
{ "type": "rpc_response", "id": "uuid", "result": { ... } }
```

## RPC Methods (via WebSocket)

### TranscriptManager
- `getRecentSegments(count?)` — Get last N segments
- `getFullText()` — Get full transcript as text
- `clear()` — Clear transcript
- `loadDateTranscript(date)` — Load historical transcript
- `loadTodayTranscript()` — Switch back to today
- `removeDates(dates[])` — Remove dates from available list

### NotesManager
- `generateNote(title?, startTime?, endTime?)` — AI-generate note
- `createManualNote(title, content)` — Create manual note
- `updateNote(noteId, updates)` — Update note
- `deleteNote(noteId)` — Delete note
- `favouriteNote(noteId)` / `unfavouriteNote(noteId)`
- `archiveNote(noteId)` / `unarchiveNote(noteId)`
- `trashNote(noteId)` / `untrashNote(noteId)` / `permanentlyDeleteNote(noteId)`
- `emptyNoteTrash()` — Empty notes trash
- `batchFavouriteNotes(ids[])` / `batchTrashNotes(ids[])` / `batchMoveNotes(ids[], folderId)`

### ConversationManager
- `deleteConversation(id)` — Delete conversation
- `linkNoteToConversation(convId, noteId)` — Link note
- `loadConversationSegments(convId)` — Load transcript segments
- `favouriteConversation(id)` / `unfavouriteConversation(id)`
- `archiveConversation(id)` / `unarchiveConversation(id)`
- `trashConversation(id)` / `untrashConversation(id)`
- `emptyTrash()` — Empty conversations trash
- `mergeConversations(ids[], trashOriginals)` — Merge conversations
- `batchFavouriteConversations(ids[])` / `batchTrashConversations(ids[])`

### ChatManager
- `sendMessage(content)` — Send chat message
- `clearHistory()` — Clear chat
- `loadDateChat(date)` — Load chat for specific date

### SettingsManager
- `updateSettings(settings)` — Update user settings
- `getSettings()` — Get current settings

### FileManager
- `refreshFiles()` — Force refresh file list
- `getFilesRpc(filter?)` — Get files with filter
- `setFilter(filter)` — Change active filter
- `archiveFile(date)` / `unarchiveFile(date)`
- `trashFile(date)` — Trash file (deletes R2 + MongoDB transcript data)
- `restoreFile(date)` — Restore from trash
- `favouriteFile(date)` / `unfavouriteFile(date)`
- `permanentlyDeleteFile(date)` — Permanent delete
- `purgeDate(date)` — Delete all data for a date
- `emptyTrash()` — Empty files trash

### FoldersManager
- `createFolder(name, color)` — Create folder
- `updateFolder(folderId, updates)` — Update folder
- `deleteFolder(folderId)` — Delete folder

### SummaryManager
- `generateHourSummary(hour)` — Generate summary for specific hour
- `loadSummariesForDate(date)` — Load hour summaries for a date
