# 1. OBJECTIVE

Add Docker-friendly server configuration and local filesystem storage support to enable fully self-hosted deployment without cloud dependencies.

**Two main goals:**
1. Allow the server to bind to `0.0.0.0` for Docker port forwarding
2. Replace Cloudflare R2 with optional local filesystem storage for transcripts and photos

# 2. CONTEXT SUMMARY

## Relevant Files
- `src/index.ts` - Main entry point, Bun server configuration (line 92: `Bun.serve()`)
- `src/backend/services/r2Upload.service.ts` - R2 upload functions for transcripts and photos
- `src/backend/services/r2Fetch.service.ts` - R2 fetch functions for retrieving transcripts
- `src/backend/services/r2Batch.service.ts` - R2 batch operations for archiving
- `src/backend/session/managers/CloudflareR2Manager.ts` - Manager orchestrating R2 operations
- `env.example` - Environment variable documentation

## Current Limitations
1. **Server binding**: `Bun.serve()` defaults to `localhost`, preventing Docker port forwarding
2. **Storage**: Only Cloudflare R2 is supported; no local alternative exists
3. **Startup message**: Doesn't show local LLM provider status (ollama/llamacpp)

## Storage Usage in the App
R2 storage is used for:
- **Transcript archiving**: Daily transcript segments are batched and uploaded to R2
- **Photo storage**: Photos captured from glasses are uploaded immediately
- **Historical retrieval**: Fetching old transcripts for conversation context

# 3. APPROACH OVERVIEW

## Chosen Approach

### 1. Docker Binding
Add configurable `HOST` environment variable to control server binding address.
- Default: `0.0.0.0` (accessible from outside container)
- Configurable via `HOST` env var

### 2. Local Storage Provider
Create a storage abstraction layer with two implementations:
- `r2` - Existing Cloudflare R2 (default when R2 credentials are configured)
- `local` - New local filesystem storage (default when R2 is not configured)

The abstraction will be transparent to the rest of the app - same interface, different backends.

### 3. Startup Message Update
Update the startup message to show the actual configured AI provider (including ollama/llamacpp).

## Rationale
- **Storage abstraction**: Allows easy switching between cloud and local without changing application code
- **Auto-detection**: If R2 credentials are missing, automatically use local storage (no config needed)
- **Backward compatible**: Existing R2 users don't need to change anything

# 4. IMPLEMENTATION STEPS

## Step 1: Add Configurable Server Host Binding
**Goal:** Allow the server to bind to `0.0.0.0` for Docker compatibility.

**File:** `src/index.ts`

**Changes:**

1. Add HOST configuration (after line 23):
```typescript
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";  // Default to 0.0.0.0 for Docker
```

2. Update `Bun.serve()` (around line 92):
```typescript
Bun.serve({
  port: PORT,
  hostname: HOST,  // Add this line
  idleTimeout: 120,
  // ... rest of config
});
```

3. Update startup message (around line 83):
```typescript
console.log(`✅ Notes app running at http://${HOST}:${PORT}`);
console.log(`   • Webview: http://${HOST}:${PORT}`);
console.log(`   • API: http://${HOST}:${PORT}/api/health`);
```

---

## Step 2: Update Startup Message for Local LLM Providers
**Goal:** Show the actual configured AI provider in startup logs.

**File:** `src/index.ts`

**Changes:**

1. Update the AI provider detection (replace lines 40-42):
```typescript
// Check AI provider configuration
const agentProvider = process.env.AGENT_PROVIDER?.toLowerCase();
const hasGemini = !!process.env.GEMINI_API_KEY;
const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasOllama = agentProvider === "ollama";
const hasLlamaCpp = agentProvider === "llamacpp" || agentProvider === "llama";
const hasLocalLLM = hasOllama || hasLlamaCpp;
const hasCloudLLM = hasGemini || hasAnthropic || hasOpenAI;
const hasAI = hasLocalLLM || hasCloudLLM;
```

2. Update the AI provider display message (replace line 50-52):
```typescript
function getAIProviderStatus(): string {
  if (hasOllama) {
    const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL_FAST || "llama3.1";
    return `✅ Ollama (${model} @ ${baseUrl})`;
  }
  if (hasLlamaCpp) {
    const baseUrl = process.env.LLAMACPP_BASE_URL || "http://localhost:8080";
    const model = process.env.LLAMACPP_MODEL || "local-model";
    return `✅ llama.cpp (${model} @ ${baseUrl})`;
  }
  if (hasGemini) return "✅ Gemini";
  if (hasAnthropic) return "✅ Anthropic";
  if (hasOpenAI) return "✅ OpenAI";
  return "⚠️  (Optional - Set AGENT_PROVIDER or API keys for AI features)";
}

console.log(`   • AI Provider: ${getAIProviderStatus()}`);
```

---

## Step 3: Create Storage Abstraction Interface
**Goal:** Define a common interface for storage providers.

**File:** `src/backend/services/storage/types.ts` (new file)

**Content:**
```typescript
/**
 * Storage Provider Types
 * Unified interface for transcript and photo storage
 */

export type StorageProvider = "r2" | "local";

export interface StorageSegment {
  text: string;
  timestamp: string; // UTC ISO string
  isFinal: boolean;
  speakerId?: string;
  index: number;
  type?: "transcript" | "photo";
  photoUrl?: string;
  photoMimeType?: string;
  photoDescription?: string;
  timezone?: string;
}

export interface StorageBatchData {
  userId: string;
  date: string; // YYYY-MM-DD
  timezone: string;
  batchedAt: string; // UTC ISO string
  segmentCount: number;
  segments: StorageSegment[];
}

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: Error;
}

export interface StorageService {
  /**
   * Upload a batch of transcript segments
   */
  uploadBatch(params: {
    userId: string;
    date: string;
    segments: StorageSegment[];
    timezone: string;
  }): Promise<UploadResult>;

  /**
   * Upload a photo
   */
  uploadPhoto(params: {
    userId: string;
    date: string;
    buffer: Buffer;
    mimeType: string;
    timestamp: Date;
    timezone?: string;
  }): Promise<UploadResult>;

  /**
   * Fetch transcript for a date
   */
  fetchTranscript(userId: string, date: string): Promise<StorageBatchData | null>;

  /**
   * List available transcript dates
   */
  listDates(userId: string): Promise<string[]>;

  /**
   * Delete transcript for a date
   */
  deleteTranscript(userId: string, date: string): Promise<{ success: boolean; error?: Error }>;

  /**
   * Check if storage is configured and available
   */
  isAvailable(): boolean;
}
```

---

## Step 4: Create Local Filesystem Storage Service
**Goal:** Implement local storage using the filesystem.

**File:** `src/backend/services/storage/local.ts` (new file)

**Key Implementation Details:**
- Default storage path: `./data/storage` (configurable via `LOCAL_STORAGE_PATH`)
- Directory structure: `{storagePath}/transcripts/{userId}/{date}/transcript.json`
- Photos: `{storagePath}/transcripts/{userId}/{date}/photos/photo-{timestamp}.{ext}`
- Use `Bun.file()` and `Bun.write()` for file operations
- Auto-create directories as needed

**Content:**
```typescript
/**
 * Local Filesystem Storage Service
 * Stores transcripts and photos on the local filesystem
 */

import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  StorageService,
  StorageSegment,
  StorageBatchData,
  UploadResult,
} from "./types";

const DEFAULT_STORAGE_PATH = "./data/storage";

export class LocalStorageService implements StorageService {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || process.env.LOCAL_STORAGE_PATH || DEFAULT_STORAGE_PATH;
  }

  private getTranscriptPath(userId: string, date: string): string {
    return path.join(this.basePath, "transcripts", userId, date, "transcript.json");
  }

  private getPhotosDir(userId: string, date: string): string {
    return path.join(this.basePath, "transcripts", userId, date, "photos");
  }

  private async ensureDir(dirPath: string): Promise<void> {
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }
  }

  isAvailable(): boolean {
    return true; // Local storage is always available
  }

  async uploadBatch(params: {
    userId: string;
    date: string;
    segments: StorageSegment[];
    timezone: string;
  }): Promise<UploadResult> {
    const { userId, date, segments, timezone } = params;
    const filePath = this.getTranscriptPath(userId, date);

    try {
      await this.ensureDir(path.dirname(filePath));

      // Merge with existing data if file exists
      let allSegments = [...segments];
      const existingData = await this.fetchTranscript(userId, date);
      if (existingData?.segments) {
        const existingIndices = new Set(existingData.segments.map(s => s.index));
        const newSegments = segments.filter(s => !existingIndices.has(s.index));
        allSegments = [...existingData.segments, ...newSegments];
      }

      const batchData: StorageBatchData = {
        userId,
        date,
        timezone,
        batchedAt: new Date().toISOString(),
        segmentCount: allSegments.length,
        segments: allSegments,
      };

      await Bun.write(filePath, JSON.stringify(batchData, null, 2));
      console.log(`[LocalStorage] Saved transcript: ${filePath} (${allSegments.length} segments)`);

      return { success: true, url: filePath };
    } catch (error) {
      console.error(`[LocalStorage] Upload failed:`, error);
      return { success: false, error: error as Error };
    }
  }

  async uploadPhoto(params: {
    userId: string;
    date: string;
    buffer: Buffer;
    mimeType: string;
    timestamp: Date;
    timezone?: string;
  }): Promise<UploadResult> {
    const { userId, date, buffer, mimeType, timestamp } = params;
    const extension = mimeType === "image/png" ? "png" : "jpg";
    const filename = `photo-${timestamp.getTime()}.${extension}`;
    const photosDir = this.getPhotosDir(userId, date);
    const filePath = path.join(photosDir, filename);

    try {
      await this.ensureDir(photosDir);
      await Bun.write(filePath, buffer);
      
      // Return a URL path that can be served by the API
      const publicUrl = `/api/photos/${date}/${filename}`;
      console.log(`[LocalStorage] Saved photo: ${filePath}`);

      return { success: true, url: publicUrl };
    } catch (error) {
      console.error(`[LocalStorage] Photo upload failed:`, error);
      return { success: false, error: error as Error };
    }
  }

  async fetchTranscript(userId: string, date: string): Promise<StorageBatchData | null> {
    const filePath = this.getTranscriptPath(userId, date);

    try {
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        return null;
      }
      const content = await file.text();
      return JSON.parse(content) as StorageBatchData;
    } catch {
      return null;
    }
  }

  async listDates(userId: string): Promise<string[]> {
    const userDir = path.join(this.basePath, "transcripts", userId);
    
    try {
      if (!existsSync(userDir)) {
        return [];
      }
      
      const { readdir } = await import("node:fs/promises");
      const entries = await readdir(userDir, { withFileTypes: true });
      
      return entries
        .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
        .map(entry => entry.name)
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  async deleteTranscript(userId: string, date: string): Promise<{ success: boolean; error?: Error }> {
    const filePath = this.getTranscriptPath(userId, date);

    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(filePath);
      console.log(`[LocalStorage] Deleted: ${filePath}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error as Error };
    }
  }
}

export function createLocalStorageService(basePath?: string): StorageService {
  return new LocalStorageService(basePath);
}
```

---

## Step 5: Wrap R2 Service with Storage Interface
**Goal:** Wrap existing R2 functions to implement the StorageService interface.

**File:** `src/backend/services/storage/r2.ts` (new file)

**Content:**
```typescript
/**
 * Cloudflare R2 Storage Service
 * Wraps existing R2 functions to implement StorageService interface
 */

import type {
  StorageService,
  StorageSegment,
  StorageBatchData,
  UploadResult,
} from "./types";
import {
  uploadBatchToR2,
  uploadPhotoToR2,
  type R2TranscriptSegment,
} from "../r2Upload.service";
import { fetchTranscriptFromR2, listR2TranscriptDates } from "../r2Fetch.service";

export class R2StorageService implements StorageService {
  isAvailable(): boolean {
    const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    return !!(endpoint && accessKeyId && secretAccessKey);
  }

  async uploadBatch(params: {
    userId: string;
    date: string;
    segments: StorageSegment[];
    timezone: string;
  }): Promise<UploadResult> {
    return uploadBatchToR2({
      userId: params.userId,
      date: params.date,
      segments: params.segments as R2TranscriptSegment[],
      timezone: params.timezone,
    });
  }

  async uploadPhoto(params: {
    userId: string;
    date: string;
    buffer: Buffer;
    mimeType: string;
    timestamp: Date;
    timezone?: string;
  }): Promise<UploadResult> {
    return uploadPhotoToR2(params);
  }

  async fetchTranscript(userId: string, date: string): Promise<StorageBatchData | null> {
    try {
      const data = await fetchTranscriptFromR2(userId, date);
      return data as StorageBatchData | null;
    } catch {
      return null;
    }
  }

  async listDates(userId: string): Promise<string[]> {
    try {
      return await listR2TranscriptDates(userId);
    } catch {
      return [];
    }
  }

  async deleteTranscript(userId: string, date: string): Promise<{ success: boolean; error?: Error }> {
    const { deleteFromR2 } = await import("../r2Upload.service");
    return deleteFromR2({ userId, date });
  }
}

export function createR2StorageService(): StorageService {
  return new R2StorageService();
}
```

---

## Step 6: Create Storage Factory
**Goal:** Auto-select storage provider based on configuration.

**File:** `src/backend/services/storage/index.ts` (new file)

**Content:**
```typescript
/**
 * Storage Service Factory
 * Auto-selects between R2 and local storage based on configuration
 */

export type { StorageService, StorageSegment, StorageBatchData, UploadResult, StorageProvider } from "./types";
export { LocalStorageService, createLocalStorageService } from "./local";
export { R2StorageService, createR2StorageService } from "./r2";

import type { StorageService, StorageProvider } from "./types";
import { createLocalStorageService } from "./local";
import { createR2StorageService } from "./r2";

let _storageService: StorageService | null = null;

/**
 * Get the configured storage provider type
 */
export function getStorageProvider(): StorageProvider {
  const explicit = process.env.STORAGE_PROVIDER?.toLowerCase();
  if (explicit === "local") return "local";
  if (explicit === "r2") return "r2";

  // Auto-detect: use R2 if configured, otherwise local
  const hasR2 = !!(
    process.env.CLOUDFLARE_R2_ENDPOINT &&
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  );

  return hasR2 ? "r2" : "local";
}

/**
 * Get or create the storage service singleton
 */
export function getStorageService(): StorageService {
  if (!_storageService) {
    const provider = getStorageProvider();
    console.log(`[Storage] Using ${provider} storage provider`);

    if (provider === "r2") {
      _storageService = createR2StorageService();
    } else {
      _storageService = createLocalStorageService();
    }
  }
  return _storageService;
}

/**
 * Check if storage is available
 */
export function isStorageAvailable(): boolean {
  return getStorageService().isAvailable();
}
```

---

## Step 7: Update CloudflareR2Manager to Use Storage Abstraction
**Goal:** Replace direct R2 calls with storage service abstraction.

**File:** `src/backend/session/managers/CloudflareR2Manager.ts`

**Changes:**

1. Update imports (at top of file):
```typescript
import { getStorageService, getStorageProvider, type StorageService } from "../../services/storage";
```

2. Add storage service property and update to use it throughout the class.

3. Key method updates - replace direct R2 calls:
```typescript
// Instead of: await batchTranscriptsToR2(...)
// Use: await this.storageService.uploadBatch(...)

// Instead of: await fetchTranscriptFromR2(...)
// Use: await this.storageService.fetchTranscript(...)

// Instead of: await listR2TranscriptDates(...)
// Use: await this.storageService.listDates(...)
```

---

## Step 8: Add Photo Serving Endpoint for Local Storage
**Goal:** Serve locally stored photos via API.

**File:** `src/backend/api/router.ts`

**Changes:**
Add endpoint to serve photos from local storage:
```typescript
// Serve photos from local storage
api.get("/photos/:date/:filename", async (c) => {
  const { date, filename } = c.req.param();
  const userId = c.get("userId"); // Get from auth context
  
  const storagePath = process.env.LOCAL_STORAGE_PATH || "./data/storage";
  const filePath = `${storagePath}/transcripts/${userId}/${date}/photos/${filename}`;
  
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return c.json({ error: "Photo not found" }, 404);
  }
  
  const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
  return new Response(file, {
    headers: { "Content-Type": mimeType },
  });
});
```

---

## Step 9: Update Environment Example
**Goal:** Document new environment variables.

**File:** `env.example`

**Changes:**
Add new sections:
```bash
# =============================================================================
# Server Configuration
# =============================================================================

PORT=3000
HOST=0.0.0.0  # Use 0.0.0.0 for Docker, localhost for local dev

# =============================================================================
# Storage Provider
# Auto-detects: uses R2 if configured, otherwise local filesystem
# =============================================================================

# Explicit storage provider selection (optional)
# STORAGE_PROVIDER=local  # or "r2"

# Local filesystem storage path (when using local storage)
# LOCAL_STORAGE_PATH=./data/storage

# Cloudflare R2 - For cloud storage of transcripts and photos
# If these are set, R2 will be used automatically
# CLOUDFLARE_R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
# CLOUDFLARE_R2_BUCKET_NAME=mentra-notes
# CLOUDFLARE_R2_ACCESS_KEY_ID=your_r2_access_key
# CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_r2_secret_key
```

---

## Step 10: Update Startup Message for Storage Provider
**Goal:** Show which storage provider is being used.

**File:** `src/index.ts`

**Changes:**
Add storage provider status to startup message:
```typescript
import { getStorageProvider, isStorageAvailable } from "./backend/services/storage";

// In the startup logs section:
const storageProvider = getStorageProvider();
const storageAvailable = isStorageAvailable();
const storagePath = process.env.LOCAL_STORAGE_PATH || "./data/storage";

console.log(
  `   • Storage:     ${storageAvailable 
    ? (storageProvider === "r2" ? "✅ Cloudflare R2" : `✅ Local (${storagePath})`)
    : "⚠️  Not configured"}`
);
```

# 5. TESTING AND VALIDATION

## Manual Testing

### Test 1: Docker Host Binding
1. Set `HOST=0.0.0.0` in `.env`
2. Start the application in Docker
3. Verify:
   - Startup message shows `http://0.0.0.0:3000`
   - Application is accessible from host machine via forwarded port

### Test 2: Local Storage - Transcripts
1. Remove R2 credentials from `.env` (or set `STORAGE_PROVIDER=local`)
2. Start the application
3. Verify startup message shows "✅ Local (./data/storage)"
4. Record some audio and end a conversation
5. Verify:
   - Transcript JSON file is created at `./data/storage/transcripts/{userId}/{date}/transcript.json`
   - No R2-related errors in logs

### Test 3: Local Storage - Photos
1. With local storage configured
2. Capture a photo from glasses (if available) or trigger photo upload
3. Verify:
   - Photo file is saved to `./data/storage/transcripts/{userId}/{date}/photos/`
   - Photo can be retrieved via `/api/photos/{date}/{filename}`

### Test 4: Storage Auto-Detection
1. Test with R2 credentials set → should use R2
2. Test without R2 credentials → should auto-fallback to local
3. Test with `STORAGE_PROVIDER=local` even with R2 creds → should force local

### Test 5: LLM Provider Startup Message
1. Set `AGENT_PROVIDER=llamacpp` and `LLAMACPP_BASE_URL=http://192.168.1.185:30000`
2. Start the application
3. Verify startup message shows: "✅ llama.cpp (local-model @ http://192.168.1.185:30000)"

## Verification Checklist
- [ ] Server binds to `0.0.0.0` when `HOST=0.0.0.0`
- [ ] Server binds to `localhost` when `HOST=localhost`
- [ ] Local storage creates correct directory structure
- [ ] Local storage saves and retrieves transcripts correctly
- [ ] Local storage saves and serves photos correctly
- [ ] R2 storage still works when credentials are provided
- [ ] Auto-detection correctly chooses storage provider
- [ ] Startup message shows correct AI provider (including local LLMs)
- [ ] Startup message shows correct storage provider
- [ ] TypeScript compilation succeeds without errors
- [ ] Docker port forwarding works correctly
