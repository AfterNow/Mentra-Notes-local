# Issue #17: Memory Leak Investigation

## Overview

Memory grows steadily from ~350MB to ~900MB+ over 1-2 days, then drops sharply on server restart. Classic sawtooth pattern indicating objects allocated but never freed by the garbage collector.

## Memory Graph Analysis

```
900MB ─────────────/│         /│
                  / │       /  │
700MB ──────── /   │     /    │
              /    │   /      │
350MB ──────/     │ /        │──
           restart  restart   restart
           3/16     3/18      3/20
```

- Growth rate: ~25MB/hour (~500MB over 20 hours)
- Baseline after restart: ~150-350MB
- Peak before restart: ~900-1000MB
- Pattern is consistent across restarts — same leak sources every time

---

## CRITICAL — Fix Immediately

### 1. S3Client Created Per-Request (Not Shared)

**Severity:** CRITICAL
**Estimated impact:** 40-60% of memory growth
**Files:**
- `src/backend/services/r2Upload.service.ts` (lines 73, 284, 340, 421)
- `src/backend/services/r2Fetch.service.ts` (line 38)

**Problem:** Every R2 operation creates a brand new `S3Client` instance. S3 clients maintain internal connection pools, HTTP agents, and request buffers. These are heavyweight objects (~100-500KB each) designed to be long-lived singletons.

With the app processing hundreds of transcript segments per day:
- `uploadPhotoToR2()` — new client per photo
- `uploadToR2()` — new client per batch upload
- `fetchExistingBatch()` — new client per fetch
- `fetchTranscriptFromR2()` — new client per historical transcript load
- `listR2TranscriptDates()` — new client per date listing
- `deleteFromR2()` — new client per deletion

Over 24 hours with multiple users, this creates hundreds-thousands of S3Client instances. The AWS SDK v3 S3Client does not self-cleanup — connection pools persist until the process exits.

**Fix:**
```typescript
// Before (in every function):
const s3Client = new S3Client({ ... });

// After (module-level singleton):
let _s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _s3Client;
}
```

**Effort:** 1-2 hours
**Risk:** Low — singleton pattern is the AWS-recommended approach

---

### 2. ConversationManager.segmentCache Never Cleared

**Severity:** HIGH
**Estimated impact:** 20-30% of memory growth
**File:** `src/backend/session/managers/ConversationManager.ts` (line 42)

```typescript
private segmentCache = new Map<string, any[]>();
```

**Problem:** This cache stores ALL transcript segments from R2 for each date that a conversation's segments are loaded. A single day's transcript can have 1000-3000+ segments, each with full text content.

- Cache entries are added when `getSegmentsForConversation()` fetches from R2 (line ~926)
- Cache is NEVER cleared — not on session destroy, not on time expiry, never
- `destroy()` method (line 166) doesn't clear it
- Each date entry: 1000 segments * ~200 bytes = ~200KB per date
- User accessing 10 historical dates = 2MB cached per session
- Multiple users over 24 hours = 10-50MB+ in dead caches

**Fix:**
1. Clear cache in `destroy()`:
   ```typescript
   destroy() {
     this.segmentCache.clear();
     // ... existing cleanup
   }
   ```
2. Add TTL-based eviction (optional):
   ```typescript
   // Clear entries older than 30 minutes
   private segmentCacheTimestamps = new Map<string, number>();
   ```
3. Cap cache size (e.g., max 5 dates cached, LRU eviction)

**Effort:** 30 minutes
**Risk:** Very low

---

## SIGNIFICANT — Fix This Week

### 3. Session Cleanup on Disconnect

**Severity:** MEDIUM-HIGH
**File:** `src/backend/session/NotesSession.ts`, `src/backend/session/SessionManager.ts`

**Problem:** When a user disconnects (tab close, network drop), the session and all its managers must be fully destroyed. If any manager holds references to large objects (segment arrays, chunk buffers, cached data), those objects persist in memory until the session is garbage collected.

**What to verify:**
- Are all `setInterval`/`setTimeout` timers cleared in every manager's `destroy()`?
- Are all event listeners removed?
- Are all arrays/Maps/Sets emptied?
- Is the session removed from the SessionManager's session map?

**Key managers to audit:**
- `ChunkBufferManager` — heartbeat interval (5s) must be cleared
- `SummaryManager` — rolling summary timer must be cleared
- `TranscriptManager` — pendingSegments must be flushed/cleared
- `R2Manager` — any batch timers must be cleared

---

### 4. ChunkBufferManager Heartbeat Interval

**Severity:** MEDIUM
**File:** `src/backend/session/managers/ChunkBufferManager.ts`

**Problem:** The heartbeat runs every 5 seconds (`setInterval`). If not properly cleared on session disconnect, it keeps the entire ChunkBufferManager (and everything it references) alive in memory indefinitely.

**What to check:**
- Is `clearInterval(heartbeat)` called in `destroy()`?
- Does the heartbeat callback reference `this` (keeping the manager alive via closure)?

---

### 5. TranscriptManager.pendingSegments Race Condition

**Severity:** MEDIUM
**File:** `src/backend/session/managers/TranscriptManager.ts` (lines 64, 375-382)

**Problem:** Segments are added to `pendingSegments[]` and flushed to MongoDB on a 30-second timer. If MongoDB is slow or the persist call fails:
- Segments keep accumulating (3-5 segments/sec = 90-150 segments in 30s)
- Failed persist doesn't clear the array — it keeps growing
- At ~200 bytes per segment, a 10-minute MongoDB outage = 180KB of queued segments per user

**Fix:** Add max queue size + error recovery:
```typescript
if (this.pendingSegments.length > 500) {
  console.warn("[TranscriptManager] pendingSegments overflow, dropping oldest");
  this.pendingSegments = this.pendingSegments.slice(-200);
}
```

---

### 6. FileManager._operationInProgress Promise Chain

**Severity:** MEDIUM
**File:** `src/backend/session/managers/FileManager.ts` (lines 71, 623-641)

**Problem:** File operations (trash, archive, favourite) create a Promise that subsequent operations `await`. If an operation throws without calling `resolveOperation()`, the Promise never resolves — blocking all future file operations for that session AND keeping the Promise chain in memory.

**Fix:** Ensure `resolveOperation()` is always called in `finally`:
```typescript
// Already done in most places, but verify ALL paths
try {
  // ... operation
} finally {
  resolveOperation!(); // Must always be called
  this._operationInProgress = null;
}
```

---

### 7. provisionalTitleInFlight Set Leak

**Severity:** LOW-MEDIUM
**File:** `src/backend/session/managers/ConversationManager.ts` (line 294)

**Problem:** The `provisionalTitleInFlight` Set tracks conversation IDs currently generating titles. If a conversation is deleted/trashed while title generation is in-flight, the ID stays in the Set forever (small leak, ~50 bytes per ID).

**Fix:** Add timeout-based cleanup:
```typescript
setTimeout(() => {
  this.provisionalTitleInFlight.delete(convId);
}, 30000); // 30s max for title generation
```

---

## LOW PRIORITY — Nice to Have

### 8. Mongoose Connection Pool

**Severity:** LOW
**Problem:** MongoDB connections are pooled by Mongoose. Default pool size is 5. Under heavy load, pool may grow. Not a leak per se, but worth monitoring.

### 9. Closure Chains in waitForSentenceBoundary

**Severity:** LOW
**File:** `src/backend/session/managers/ChunkBufferManager.ts` (lines 182-212)

**Problem:** Recursive `setTimeout` in `waitForSentenceBoundary` creates closure chains that capture buffer state. Each 500ms check creates a new closure referencing `initialText` and `this.buffer`. Over 8s max wait = 16 closures per chunk boundary check.

**Fix:** Use a single timer that checks periodically instead of recursive timeouts.

---

## Implementation Plan

### Phase 1 — Quick Wins (1-2 hours, biggest impact)

1. **Singleton S3Client** — Create module-level singleton in r2Upload.service.ts and r2Fetch.service.ts
2. **Clear segmentCache** — Add `this.segmentCache.clear()` to ConversationManager.destroy()
3. **Clear provisionalTitleInFlight** — Add `this.provisionalTitleInFlight.clear()` to destroy()

### Phase 2 — Session Cleanup Audit (2-3 hours)

4. Audit every manager's `destroy()` method for:
   - Timers not cleared
   - Event listeners not removed
   - Arrays/Maps/Sets not emptied
5. Add `pendingSegments` overflow protection in TranscriptManager
6. Verify `_operationInProgress` Promise resolution in all FileManager paths

### Phase 3 — Monitoring (1 hour)

7. Add memory usage logging on session create/destroy:
   ```typescript
   console.log(`[Session] Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
   ```
8. Add session count logging to track active sessions vs memory

---

## Expected Impact

| Fix | Memory Saved | Confidence |
|-----|-------------|------------|
| Singleton S3Client | 200-400MB/day | High |
| Clear segmentCache | 50-150MB/day | High |
| Session cleanup audit | 50-100MB/day | Medium |
| pendingSegments cap | 10-30MB/day | Medium |
| provisionalTitle cleanup | 1-5MB/day | Low |

**Total estimated reduction: 300-600MB/day** — should keep steady-state memory under 500MB instead of climbing to 900MB+.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/backend/services/r2Upload.service.ts` | Singleton S3Client |
| `src/backend/services/r2Fetch.service.ts` | Singleton S3Client |
| `src/backend/session/managers/ConversationManager.ts` | Clear segmentCache + provisionalTitleInFlight in destroy() |
| `src/backend/session/managers/TranscriptManager.ts` | Cap pendingSegments, clear in destroy() |
| `src/backend/session/managers/FileManager.ts` | Verify Promise resolution, clear in destroy() |
| `src/backend/session/managers/ChunkBufferManager.ts` | Verify heartbeat cleanup in destroy() |
| `src/backend/session/NotesSession.ts` | Add memory logging on create/destroy |
