# Privacy & Data Flow Documentation

## Overview

Mentra Notes can operate in **fully local mode** with no user data leaving your infrastructure.
This document explains what data the app collects, where it goes, and how to configure it for maximum privacy.

## Quick Start for Maximum Privacy

Add these settings to your `.env` file:

```bash
# Privacy-focused configuration
LOCAL_ONLY_MODE=true          # Prevents cloud LLM usage
ENABLE_ANALYTICS=false        # Disables PostHog analytics (already default)
AGENT_PROVIDER=llamacpp       # Use local AI (or ollama)
STORAGE_PROVIDER=local        # Use local filesystem storage

# Required for glasses integration
PACKAGE_NAME=com.mentra.notes
MENTRAOS_API_KEY=your_key

# Optional: MongoDB for persistence (use local instance)
MONGODB_URI=mongodb://localhost:27017/notes
```

## Data Types

### Transcriptions
- **Source:** MentraOS glasses (microphone)
- **Processing:** Speech-to-text on glasses, text sent to app server
- **Storage:** MongoDB (local) + Local filesystem (archived)
- **External sharing:** None in local mode

### AI Processing
- **Local mode:** Ollama or llama.cpp (all processing on your hardware)
- **Cloud mode:** Gemini/Anthropic/OpenAI (data sent to provider)

### Photos
- **Source:** MentraOS glasses (camera)
- **Storage:** Local filesystem or R2 (configurable)
- **External sharing:** None when using local storage

### User Settings
- **Source:** User preferences
- **Storage:** MongoDB (local)
- **External sharing:** None

## Privacy Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `LOCAL_ONLY_MODE` | `false` | When `true`, prevents cloud LLM providers |
| `ENABLE_ANALYTICS` | `false` | When `true`, enables PostHog analytics |
| `VITE_ENABLE_ANALYTICS` | `false` | Frontend analytics flag (must match backend) |
| `STORAGE_PROVIDER` | auto-detect | `local` or `r2` |
| `AGENT_PROVIDER` | `gemini` | LLM provider to use |

## Network Connections

### Always Local
| Destination | Purpose | Notes |
|-------------|---------|-------|
| MongoDB | Data storage | Can be localhost |
| llama.cpp/Ollama | AI processing | Local network only |
| Local filesystem | File storage | No network |

### Required External
| Destination | Purpose | Can Disable |
|-------------|---------|-------------|
| MentraOS API | Glasses authentication | No* |

*The MentraOS SDK is required for glasses communication. The auth flow verifies your app's identity with Mentra servers.

### Optional External (disabled by default)
| Destination | Purpose | How to Disable |
|-------------|---------|----------------|
| PostHog | Analytics | `ENABLE_ANALYTICS=false` (default) |
| Gemini API | AI processing | `LOCAL_ONLY_MODE=true` |
| OpenAI API | AI processing | `LOCAL_ONLY_MODE=true` |
| Anthropic API | AI processing | `LOCAL_ONLY_MODE=true` |
| Cloudflare R2 | File storage | `STORAGE_PROVIDER=local` |
| Resend | Email sending | Don't set `RESEND_API_KEY` |

## Analytics

Analytics are **disabled by default** for privacy. The PostHog integration is opt-in only.

To enable analytics (not recommended for self-hosted):
```bash
ENABLE_ANALYTICS=true
VITE_ENABLE_ANALYTICS=true
VITE_POSTHOG_KEY=your_posthog_key
```

When disabled:
- No tracking events are sent
- Feature flags return default values
- PostHog proxy returns 204 No Content

## AI Provider Privacy Comparison

| Provider | Data Location | Privacy Level |
|----------|---------------|---------------|
| llama.cpp | Your hardware | ✅ Maximum |
| Ollama | Your hardware | ✅ Maximum |
| OpenAI | OpenAI servers | ⚠️ Cloud |
| Anthropic | Anthropic servers | ⚠️ Cloud |
| Gemini | Google servers | ⚠️ Cloud |

## MentraOS SDK Data Flow

The MentraOS SDK handles:
1. **Authentication** - Verifies your app with Mentra servers
2. **Glasses communication** - WebSocket for transcription, photos
3. **Settings sync** - Glasses preferences

Data that flows through MentraOS:
- User email (for authentication)
- Transcription text (glasses → app)
- Photos (glasses → app)
- Glasses settings

**Note:** Transcription processing happens on the glasses, not Mentra servers. The SDK delivers text/photos directly to your app server.

## Verification Checklist

To verify your deployment is privacy-compliant:

1. **Check startup logs:**
   ```
   Privacy:
   • Local-only mode: ✅ Enabled (no cloud services)
   • Analytics:       ✅ Disabled
   ```

2. **Monitor network traffic:**
   - Use browser DevTools Network tab
   - Should see NO requests to posthog.com, googleapis.com, openai.com, anthropic.com

3. **Check storage location:**
   - Files should appear in `./data/storage/` (or your configured path)
   - No S3/R2 bucket access logs

## Dependencies & Their Data Implications

### Required Dependencies
| Package | Purpose | Data Sent |
|---------|---------|-----------|
| `@mentra/sdk` | Glasses integration | Auth tokens |
| `mongoose` | Database | None (local DB) |
| `hono` | Web server | None |

### Optional Cloud Dependencies
| Package | Purpose | When Used |
|---------|---------|-----------|
| `openai` | OpenAI API | `AGENT_PROVIDER=openai` |
| `@anthropic-ai/sdk` | Anthropic API | `AGENT_PROVIDER=anthropic` |
| `@google/genai` | Gemini API | `AGENT_PROVIDER=gemini` |
| `@aws-sdk/client-s3` | R2 storage | `STORAGE_PROVIDER=r2` |
| `posthog-js` | Analytics | `ENABLE_ANALYTICS=true` |
| `resend` | Email | `RESEND_API_KEY` set |

## Questions?

For privacy concerns or questions about data handling, please open an issue on the repository.
