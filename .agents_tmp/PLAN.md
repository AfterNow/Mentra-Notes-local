# 1. OBJECTIVE

Conduct a comprehensive privacy audit of the Mentra Notes application to ensure it can operate in a fully local/self-hosted mode without any data leaving the system. This includes:

1. **Code audit** - Review what data is collected/stored and where it goes
2. **Network analysis** - Verify no unexpected external API calls
3. **Data flow documentation** - Document what stays local vs. what could leave the system
4. **Configuration review** - Ensure no telemetry/analytics are enabled
5. **Dependency cleanup** - Remove unused cloud provider SDKs and evaluate third-party dependencies

# 2. CONTEXT SUMMARY

## Current Dependencies (from package.json)

### Cloud Provider SDKs (candidates for removal):
- `@anthropic-ai/sdk` - Anthropic Claude API client
- `@aws-sdk/client-s3` - AWS S3/R2 client
- `@google/genai` - Google Gemini API client
- `openai` - OpenAI API client

### Other Dependencies to Evaluate:
- `@mentra/sdk` - MentraOS SDK (required for glasses integration)
- `@mentra/react` - MentraOS React components
- `posthog-js` - Analytics/telemetry (⚠️ HIGH PRIORITY)
- `resend` - Email service
- `mongoose` - MongoDB client (local DB is fine)

## Key Files to Audit:
- `src/index.ts` - Main entry point, server setup
- `src/backend/services/llm/` - LLM provider implementations
- `src/backend/services/storage/` - Storage implementations
- `src/backend/services/*.service.ts` - Various service files
- `src/frontend/` - Frontend code (check for tracking)
- `package.json` - Dependencies

## Data Types in the Application:
- **Transcriptions** - Speech-to-text from glasses
- **Conversations** - Detected conversation segments
- **Notes** - AI-generated or manual notes
- **Photos** - Images captured from glasses
- **User settings** - Preferences and configuration

# 3. APPROACH OVERVIEW

## Audit Strategy

### Phase 1: Dependency Analysis
1. Identify all npm packages that could send data externally
2. Determine which are required vs. optional
3. Create a removal plan for unused cloud SDKs

### Phase 2: Code Audit
1. Search for external API calls (fetch, axios, SDK clients)
2. Search for telemetry/analytics code
3. Review environment variable usage
4. Check for hardcoded URLs or API endpoints

### Phase 3: Data Flow Mapping
1. Trace data from input (glasses) to storage
2. Document all external touchpoints
3. Identify configuration switches for local-only mode

### Phase 4: Cleanup Implementation
1. Remove unused dependencies
2. Add configuration guards for optional cloud features
3. Update documentation

# 4. IMPLEMENTATION STEPS

## Step 1: Audit PostHog Analytics
**Goal:** Identify and evaluate PostHog telemetry integration.

**FINDINGS (from preliminary audit):**

PostHog is actively used in 8 files:
- `src/frontend/services/posthog/client.ts` - **HARDCODED API KEY!**
- `src/frontend/services/posthog/events.ts` - Event tracking
- `src/frontend/services/posthog/features.ts` - Feature flags
- `src/frontend/services/posthog/index.ts` - Exports
- `src/frontend/lib/posthog.ts` - Additional utilities
- `src/frontend/App.tsx` - Integration
- `src/frontend/pages/onboarding/OnboardingPage.tsx` - Usage
- `src/backend/api/router.ts` - Backend proxy

**Critical issue in `client.ts`:**
```typescript
PostHog.init("phc_QuuFFRBKtdPDMsA96Yw608iwmcOe5UtZcHOzpTbSF0y", {
  api_host: "/api/posthog",
  ui_host: "https://us.posthog.com",
  persistence: "memory",
});
```

**Action required:**
1. Remove hardcoded PostHog API key
2. Make PostHog completely optional via `DISABLE_ANALYTICS=true`
3. Guard all PostHog imports with feature flag
4. Consider removing `posthog-js` from package.json entirely for privacy-focused fork

---

## Step 2: Audit MentraOS SDK
**Goal:** Understand what data the MentraOS SDK sends/receives.

**FINDINGS (from preliminary audit):**

MentraOS SDK is used in:
- `src/backend/NotesApp.ts` - Main app class extends `AppServer`
- `src/index.ts` - Creates auth routes via `createMentraAuthRoutes`
- Various session managers - Access glasses data

**Key usage in `NotesApp.ts`:**
```typescript
import { AppServer, AppSession } from "@mentra/sdk";
// App extends AppServer for glasses integration
```

**Key usage in `index.ts`:**
```typescript
import { createMentraAuthRoutes } from "@mentra/sdk";
// Creates routes for /api/mentra/auth/*
```

**Assessment:**
- **Required** for glasses communication and user authentication
- Cannot be removed if glasses integration is needed
- Need to document what data flows through this SDK
- For fully offline use: would need to investigate if SDK can work without cloud auth

**Action:**
1. Document data flow through MentraOS SDK
2. Investigate if offline/local auth mode exists
3. Add to PRIVACY.md as required external dependency

---

## Step 3: Audit LLM Provider Code
**Goal:** Verify cloud LLM providers are only used when explicitly configured.

**Files:**
- `src/backend/services/llm/anthropic.ts`
- `src/backend/services/llm/gemini.ts`
- `src/backend/services/llm/openai.ts`
- `src/backend/services/llm/ollama.ts`
- `src/backend/services/llm/llamacpp.ts`
- `src/backend/services/llm/index.ts`

**Verify:**
- Cloud providers only instantiated when API keys are present
- No fallback to cloud when local is configured
- No API calls unless explicitly selected

---

## Step 4: Audit Storage Services
**Goal:** Verify R2/S3 is only used when configured.

**Files:**
- `src/backend/services/storage/r2.ts`
- `src/backend/services/storage/local.ts`
- `src/backend/services/storage/index.ts`
- `src/backend/services/r2*.service.ts`

**Verify:**
- R2 only used when credentials are present
- Local storage works without any cloud config
- No fallback to cloud storage

---

## Step 5: Audit Email Service (Resend)
**Goal:** Identify email functionality and make it optional.

**FINDINGS (from preliminary audit):**

**File:** `src/backend/services/resend.service.ts`

**Current behavior:**
```typescript
const resend = new Resend(process.env.RESEND_API_KEY);
if (!process.env.RESEND_API_KEY) {
  console.warn("[Resend] RESEND_API_KEY not set — email sending will fail");
}
```

**Assessment:**
- Resend client is initialized at module load (even without API key)
- Sends emails from `notes@mentra.glass`
- Used for sharing notes/transcripts via email
- **Not required** for core functionality

**Action:**
1. Make Resend import lazy (only when API key is present)
2. Add `DISABLE_EMAIL=true` configuration option
3. Gracefully skip email features when disabled
4. Consider removing from package.json for privacy-focused fork

---

## Step 6: Audit Frontend for External Calls
**Goal:** Check frontend code for analytics, tracking, or external API calls.

**Search patterns:**
```bash
grep -r "fetch(" src/frontend/
grep -r "analytics" src/frontend/
grep -r "posthog" src/frontend/
grep -r "gtag" src/frontend/
grep -r "google" src/frontend/
grep -r "facebook" src/frontend/
grep -r "pixel" src/frontend/
```

**Check:**
- No hardcoded external URLs
- No third-party tracking scripts
- No external font/CDN loading

---

## Step 7: Audit Environment Variables
**Goal:** Document all environment variables and their privacy implications.

**Files:**
- `env.example`
- All `.ts` files using `process.env`

**Create documentation table:**
| Variable | Required | Privacy Impact | Notes |
|----------|----------|----------------|-------|
| MONGODB_URI | Optional | Local DB | Safe |
| GEMINI_API_KEY | Optional | Sends data to Google | Cloud only |
| ... | ... | ... | ... |

---

## Step 8: Remove Unused Cloud Dependencies
**Goal:** Remove cloud provider SDKs that aren't needed for local operation.

**File:** `package.json`

**Dependencies to evaluate for removal:**

1. **`@anthropic-ai/sdk`** - Only needed if using Anthropic
   - Check if code guards against import when not configured
   - Consider: Keep but make optional, or remove entirely

2. **`@google/genai`** - Only needed if using Gemini
   - Same evaluation as above

3. **`openai`** - Only needed if using OpenAI
   - Same evaluation as above

4. **`@aws-sdk/client-s3`** - Only needed for R2 storage
   - Check if local storage works without it
   - Consider: Keep but make optional

5. **`resend`** - Only needed for email features
   - Evaluate if email is essential
   - Consider: Keep but make optional

6. **`posthog-js`** - Analytics
   - **REMOVE** or make completely optional with clear disable flag

**Approach options:**

**Option A: Lazy Loading (Recommended)**
Keep dependencies in package.json but only import when needed:
```typescript
// Only import when actually using Anthropic
if (provider === "anthropic") {
  const { Anthropic } = await import("@anthropic-ai/sdk");
  // use it
}
```

**Option B: Complete Removal**
Remove from package.json and delete provider files:
- Delete `src/backend/services/llm/anthropic.ts`
- Delete `src/backend/services/llm/gemini.ts`
- Delete `src/backend/services/llm/openai.ts`
- Update `src/backend/services/llm/index.ts`

---

## Step 9: Create Privacy Configuration
**Goal:** Add clear configuration for privacy-focused deployment.

**File:** `env.example` (update)

**Add section:**
```bash
# =============================================================================
# Privacy Configuration
# =============================================================================

# Disable all analytics/telemetry (default: true for self-hosted)
DISABLE_ANALYTICS=true

# Disable email features
DISABLE_EMAIL=true

# Force local-only mode (prevents any cloud provider usage)
LOCAL_ONLY_MODE=true
```

**File:** `src/index.ts` (update)

**Add startup checks:**
```typescript
const isLocalOnly = process.env.LOCAL_ONLY_MODE === "true";
const analyticsDisabled = process.env.DISABLE_ANALYTICS !== "false"; // Default disabled

if (isLocalOnly) {
  // Verify no cloud services are configured
  if (process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
    console.warn("⚠️  LOCAL_ONLY_MODE is set but cloud API keys are configured. Cloud APIs will NOT be used.");
  }
}

console.log(`   • Privacy Mode: ${isLocalOnly ? "✅ Local Only" : "⚠️  Cloud services may be used if configured"}`);
console.log(`   • Analytics:    ${analyticsDisabled ? "✅ Disabled" : "⚠️  Enabled"}`);
```

---

## Step 10: Update LLM Index for Local-Only Mode
**Goal:** Enforce local-only mode in LLM provider selection.

**File:** `src/backend/services/llm/index.ts`

**Changes:**
```typescript
export function getProviderFromEnv(): ProviderName {
  const isLocalOnly = process.env.LOCAL_ONLY_MODE === "true";
  const envProvider = process.env.AGENT_PROVIDER?.toLowerCase();
  
  // In local-only mode, only allow ollama or llamacpp
  if (isLocalOnly) {
    if (envProvider === "ollama") return "ollama";
    if (envProvider === "llamacpp" || envProvider === "llama") return "llamacpp";
    
    // Default to llamacpp in local-only mode
    console.warn("[LLM] LOCAL_ONLY_MODE: Defaulting to llamacpp provider");
    return "llamacpp";
  }
  
  // Normal provider selection
  if (envProvider === "anthropic" || envProvider === "claude") return "anthropic";
  if (envProvider === "openai") return "openai";
  if (envProvider === "ollama") return "ollama";
  if (envProvider === "llamacpp" || envProvider === "llama") return "llamacpp";
  
  return "gemini"; // Default
}
```

---

## Step 11: Create Data Flow Documentation
**Goal:** Document all data flows for transparency.

**File:** `PRIVACY.md` (new file in repo root)

**Content outline:**
```markdown
# Privacy & Data Flow Documentation

## Overview
Mentra Notes can operate in fully local mode with no data leaving your infrastructure.

## Data Types

### Transcriptions
- **Source:** MentraOS glasses (microphone)
- **Processing:** Speech-to-text on glasses, text sent to app
- **Storage:** MongoDB (local) + Local filesystem (archived)
- **External sharing:** None in local mode

### AI Processing
- **Local mode:** Ollama or llama.cpp (all processing on your hardware)
- **Cloud mode:** Gemini/Anthropic/OpenAI (data sent to provider)

### Photos
- **Source:** MentraOS glasses (camera)
- **Storage:** Local filesystem
- **External sharing:** None in local mode

## Configuration for Maximum Privacy

\`\`\`bash
LOCAL_ONLY_MODE=true
DISABLE_ANALYTICS=true
DISABLE_EMAIL=true
AGENT_PROVIDER=llamacpp
STORAGE_PROVIDER=local
\`\`\`

## Network Connections

| Destination | Purpose | Required | Can Disable |
|-------------|---------|----------|-------------|
| MongoDB (local) | Data storage | Yes | N/A (local) |
| llama.cpp server | AI processing | Yes (for AI) | Use local server |
| MentraOS | Glasses auth | Yes | No |

## Dependencies & Data Sharing

[Table of all npm packages and their data implications]
```

---

## Step 12: Disable PostHog Analytics
**Goal:** Completely disable PostHog or make it opt-in only.

**Find PostHog initialization and wrap with config check:**

```typescript
// Before
import posthog from 'posthog-js';
posthog.init('key', { ... });

// After
const analyticsEnabled = process.env.DISABLE_ANALYTICS !== "true" && 
                         process.env.POSTHOG_KEY;

if (analyticsEnabled) {
  const posthog = await import('posthog-js');
  posthog.default.init(process.env.POSTHOG_KEY, { ... });
}
```

**Or remove entirely from package.json if not needed.**

# 5. TESTING AND VALIDATION

## Privacy Verification Tests

### Test 1: Network Traffic Analysis
1. Start the app with `LOCAL_ONLY_MODE=true`
2. Use browser DevTools Network tab or Wireshark
3. Perform typical operations (transcribe, generate notes, etc.)
4. Verify NO external requests except:
   - MongoDB (should be localhost)
   - llama.cpp/Ollama (should be local network)
   - MentraOS (required for glasses - document what's sent)

### Test 2: Dependency Import Check
1. Remove cloud API keys from `.env`
2. Start the app
3. Verify no errors about missing Anthropic/Gemini/OpenAI
4. Verify app works with only Ollama/llama.cpp

### Test 3: Analytics Disabled
1. Set `DISABLE_ANALYTICS=true`
2. Check browser Network tab for PostHog requests
3. Verify zero analytics requests

### Test 4: Local Storage Only
1. Remove all R2/S3 credentials
2. Set `STORAGE_PROVIDER=local`
3. Use the app, trigger end-of-day batch
4. Verify files appear in `./data/storage/`
5. Verify no S3/R2 connection attempts

### Test 5: Email Disabled
1. Set `DISABLE_EMAIL=true` or remove Resend API key
2. Trigger any email functionality
3. Verify graceful handling (no errors, feature just disabled)

## Verification Checklist

### Code Audit
- [ ] All external API calls identified and documented
- [ ] PostHog usage found and made optional
- [ ] MentraOS SDK data flow documented
- [ ] No hardcoded external URLs
- [ ] No tracking pixels or external scripts

### Dependency Cleanup
- [ ] Unused cloud SDKs removed or made lazy-load
- [ ] `posthog-js` removed or disabled by default
- [ ] `resend` made optional
- [ ] All remaining dependencies justified

### Configuration
- [ ] `LOCAL_ONLY_MODE` implemented and tested
- [ ] `DISABLE_ANALYTICS` implemented and tested
- [ ] `DISABLE_EMAIL` implemented and tested
- [ ] Privacy startup messages added

### Documentation
- [ ] `PRIVACY.md` created with full data flow docs
- [ ] `env.example` updated with privacy options
- [ ] All environment variables documented with privacy impact
