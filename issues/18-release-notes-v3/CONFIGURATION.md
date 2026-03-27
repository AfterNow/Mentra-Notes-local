# Mentra Notes v3.0.0 — Configuration

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `CLOUDFLARE_R2_ENDPOINT` | R2 endpoint URL |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 access key |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 secret key |
| `CLOUDFLARE_R2_BUCKET_NAME` | R2 bucket name |

### AI Provider (at least one required)

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google Gemini API key (primary) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key (fallback) |
| `OPENAI_API_KEY` | OpenAI API key (fallback) |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `RESEND_API_KEY` | Resend email API key | — |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment (development/production) | development |
| `POSTHOG_API_KEY` | PostHog analytics key | — |

## Auto-Notes Pipeline Configuration

Located in `src/backend/core/auto-conversation/config.ts`:

### Buffer (Stage 1)

| Parameter | Value | Description |
|-----------|-------|-------------|
| `BUFFER_INTERVAL_MS` | 5,000 | How often to package buffer into chunks (ms) |
| `SENTENCE_BOUNDARY_MAX_WAIT_MS` | 3,000 | Max wait for sentence boundary after interval |

### Triage (Stage 2)

| Parameter | Value | Description |
|-----------|-------|-------------|
| `PRE_FILTER_WORD_MIN` | 4 | Chunks under this are auto-skipped |
| `CONTEXT_LOOKBACK_CHUNKS` | 2 | Previous chunks for classification context |

### Conversation Tracking (Stage 3)

| Parameter | Value | Description |
|-----------|-------|-------------|
| `MIN_CHUNKS_TO_CONFIRM` | 3 | Meaningful chunks needed to create conversation (~15s) |
| `PENDING_SILENCE_THRESHOLD` | 3 | Filler chunks in PENDING before discarding |
| `CONTEXT_PREAMBLE_CHUNKS` | 3 | Preceding chunks pulled into new conversation |
| `SILENCE_PAUSE_CHUNKS` | 2 | Consecutive fillers to pause conversation |
| `SILENCE_END_CHUNKS` | 7 | Consecutive silence chunks to end conversation (~35s) |
| `SUMMARY_MAX_WORDS` | 300 | Max words for running summary |
| `SUMMARY_COMPRESSION_INTERVAL` | 3 | Chunks before compressing summary |
| `RESUMPTION_WINDOW_MS` | 1,800,000 | Resume window (30 minutes) |

### LLM Tiers

| Parameter | Value | Description |
|-----------|-------|-------------|
| `TRIAGE_MODEL_TIER` | "fast" | Model for triage classification |
| `TRACKER_MODEL_TIER` | "fast" | Model for conversation tracking |
| `NOTE_GENERATION_MODEL_TIER` | "smart" | Model for note generation |
| `SUMMARY_MODEL_TIER` | "fast" | Model for summary compression |

### Token Limits

| Parameter | Value |
|-----------|-------|
| `TRIAGE_MAX_TOKENS` | 64 |
| `TRACKER_MAX_TOKENS` | 128 |
| `NOTE_GENERATION_MAX_TOKENS` | 4,096 |
| `SUMMARY_MAX_TOKENS` | 512 |

## Feature Flags (PostHog)

| Flag | Default | Description |
|------|---------|-------------|
| `frontend-onboard` | true | Show onboarding flow for new users |

## Porter Deployment Configuration

```yaml
name: mentra-notes
services:
  - name: mentra-notes
    type: web
    runtime: docker
    plan: starter-2  # 2 CPU cores
    ram: 5120        # 5GB RAM
    port: 3000
    healthcheck: /api/health
    domains:
      - general.mentra.glass
```

## Merge Limits

| Parameter | Value | Description |
|-----------|-------|-------------|
| Min conversations to merge | 2 | Must select at least 2 |
| Max conversations to merge | 10 | Performance limit |
