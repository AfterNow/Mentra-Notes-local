# Mentra Notes v3.0.0 — Release Overview

## What is Mentra Notes?

Mentra Notes is an always-on transcription and AI-powered note-taking application for MentraOS smart glasses. It continuously listens through the glasses microphone, automatically detects conversations, generates structured notes, and organizes everything by day — all without the user lifting a finger.

## What's New in v3

### Auto-Conversation Detection
The app now automatically detects when a real conversation is happening vs. background noise. It uses a 3-stage pipeline — **Buffer → Triage → Track** — to classify audio chunks, group them into conversations, and trigger AI note generation when a conversation ends. No manual "start recording" button needed.

### Multi-Select & Batch Operations
Long-press any conversation, note, or transcript to enter selection mode. Select multiple items and perform batch actions:
- **Export** to clipboard or email
- **Merge** conversations into one (conversations only)
- **Favorite** / **Trash** in bulk
- **Move** notes to folders

### Conversation Merging
Select 2-10 conversations and merge them into a single conversation with a fresh AI-generated summary. Useful when the auto-detector splits what should be one continuous discussion. Option to trash the originals after merge.

### Export & Email Sharing
Export notes, conversations, or transcripts via:
- **Clipboard** — formatted plain text with metadata
- **Email** — rich HTML email with styled cards, timestamps, and download links (PDF/TXT/Word)

Export options are contextual:
- Notes: include linked conversation + conversation transcript
- Conversations: include summary, linked transcript, linked AI note
- Transcripts: include full segment-by-segment content

### Redesigned Settings Page
Warm stone design matching the rest of the app. Shows user profile (name, role, company, avatar) at top, followed by recording settings, preferences, and onboarding reset.

### Redesigned Email Templates
Both notes and transcript email templates updated to match the warm stone design:
- Light beige background (#FAFAF9)
- Stone-colored typography and borders
- Responsive layout (full-width on mobile, 620px centered on desktop)
- Note type badges: AI Generated (red), Manual (gray), Conversation (gray), Transcript (gray)

### Transcript Deletion with Warnings
Deleting transcripts now permanently removes data from both MongoDB and Cloudflare R2. If conversations exist on those dates, a warning shows how many will lose their linked transcript. Deleted transcripts show a clear "Transcript deleted" indicator on both the conversation detail and transcript pages.

### Conversation End Detection Improvements
- Requires 2 consecutive filler chunks before pausing (was 1) — "uh-huh" alone won't pause
- Requires 7 silence chunks to end (was 4) — ~35 seconds instead of ~20
- Topic change goes through PENDING confirmation (needs 3 chunks, not instant)
- Resumption classifier is more lenient — only splits on completely unrelated subjects
- Background audio detection improved (TV, radio, podcasts classified as filler)

### Memory Leak Fixes
- S3Client singleton pattern (was creating new client per R2 operation)
- ConversationManager segment cache cleared on session destroy
- All manager destroy() methods audited and fixed
- Memory logging on session create/destroy for monitoring

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Server | Hono.js |
| Frontend | React 19 + Tailwind CSS 4 |
| Editor | TipTap |
| Animations | Framer Motion |
| Routing | Wouter |
| Database | MongoDB + Mongoose |
| Object Storage | Cloudflare R2 |
| AI/LLM | Gemini 2.5 Flash (primary), Claude, OpenAI |
| Email | Resend |
| Auth | MentraOS SDK |
| Search | Jina (semantic) |
| Analytics | PostHog |
| Sync | Custom WebSocket + RPC library |
| Deployment | Docker via Porter |
