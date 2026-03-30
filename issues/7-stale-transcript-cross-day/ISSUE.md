# Stale Transcript Segments Showing Across Days

Priority: Medium
Status: Confirmed — root cause identified
Date: 2026-03-13

---

## Problem

When viewing today's transcript page, segments from yesterday (9 AM, 10 AM, 11 AM) appear even though today's transcription only started at 12 PM. MongoDB only contains today's document (`date: "2026-03-13"` with 9 segments, `createdAt: 2026-03-13T19:35:30Z`). Re-authenticating in incognito and visiting the day page fixed it — the stale hours disappeared after a few seconds.

## Observed Behavior

- Frontend shows hour groups: 9 AM, 10 AM, 11 AM, 12 PM, 1 PM, 2 PM, 5 PM
- Only 12 PM onward are from today's actual recording session
- 9 AM - 11 AM entries are from yesterday's transcript
- MongoDB only has today's document (date: "2026-03-13")
- Fixed itself on re-auth in incognito (fresh session creation)
- Stale entries disappeared after a few seconds (once re-hydrate completed)

---

## Confirmed Root Cause: Race condition in `hydrate()` + stale session reuse

### Full reproduction flow

1. **Session created yesterday** → `hydrate()` loads yesterday's segments, sets `loadedDate = "2026-03-12"`. `SyncedSession.hydrated` flag set to `true`.

2. **Server stays running overnight.** Session stays in memory with yesterday's segments. No re-hydrate happens because nothing triggers it.

3. **Today, frontend connects via WebSocket** → `src/index.ts:135`:
   ```typescript
   const session = await sessions.getOrCreate(userId);
   session.addClient(ws);
   ```
   `getOrCreate` finds the existing session → returns it (no re-hydrate since `SyncedSession.hydrated = true`, `src/lib/synced.ts:179`).

4. **`addClient` immediately sends snapshot** (`src/lib/sync.ts:610` / `src/lib/synced.ts:218`) with yesterday's stale segments + `loadedDate = "2026-03-12"`.

5. **Frontend receives snapshot**, renders stale segments. Then the `useEffect` in `DayPage.tsx:256` fires: sees `loadedDate ("2026-03-12") !== dateString ("2026-03-13")`, so it calls `loadTodayTranscript()`.

6. **`loadTodayTranscript()`** (`TranscriptManager.ts:414`) sees `loadedDate !== today`, calls `this.hydrate()`.

7. **`hydrate()` runs** — but there's a race condition in the method:
   - **Line 104:** `this.loadedDate = today` — sets immediately, broadcasts to frontend
   - **Lines 107-140:** async MongoDB fetch (takes time)
   - **Line 157:** `this.segments.set(loadedSegments)` — only now replaces stale segments

   Between step 104 and 157, `loadedDate` is already `"2026-03-13"` but segments are still yesterday's data. The frontend sees `loadedDate === dateString` (line 335 of DayPage.tsx) and thinks data is ready → shows stale segments briefly.

8. **Once line 157 executes**, segments are replaced with today's MongoDB data → stale entries disappear (this is why re-auth "fixed" it — the brief flash was too fast to notice with a fresh page load).

### Why incognito fixed it

In incognito, a fresh auth created a **new WebSocket connection**. Since the session may have been garbage-collected (no clients for a while) or the server restarted, `getOrCreate` created a **new session** with a fresh `hydrate()` that loaded only today's data. No stale state to race against.

---

## Secondary Issue: `persist()` date assignment

`TranscriptManager.persist()` (line 181) saves all pending segments under `this.getTimeManager().today()` — the date at persist time, NOT the date from the segment's timestamp. If the 30-second save timer fires after midnight, yesterday's pending segments get persisted under today's date in MongoDB. This contaminates today's MongoDB document with yesterday's data.

```typescript
// Current (buggy) — always uses "today" at persist time:
const today = this.getTimeManager().today();
await appendTranscriptSegments(userId, today, toSave);

// Should group by segment's actual timestamp date:
const segDate = timeManager.toDateString(new Date(segment.timestamp));
```

---

## Fixes (ordered by impact)

### Fix 1: Clear segments + set loadedDate atomically in `hydrate()` [CRITICAL]

The core race condition: `loadedDate` is set before segments are fetched. Fix by clearing segments immediately when the date changes, so stale data is never visible.

**File:** `src/backend/session/managers/TranscriptManager.ts` lines 98-104

```typescript
async hydrate(): Promise<void> {
  const userId = this._session?.userId;
  if (!userId) return;

  try {
    const today = this.getTimeManager().today();

    // Clear stale segments BEFORE async fetch so clients never see
    // yesterday's data with today's loadedDate
    if (this.loadedDate !== today) {
      this.segments.set([]);
    }
    this.loadedDate = today;
    // ... rest of hydrate (async MongoDB fetch + segments.set)
```

**Risk:** Minimal. Segments go empty briefly during fetch, but `isDataLoading` on the frontend should show a loading state during this window anyway (since `loadedDate` changed, the `isLoadingTranscript` flag will be true).

### Fix 2: Persist segments under their actual date [IMPORTANT]

Prevents midnight boundary contamination where yesterday's segments get saved into today's MongoDB document.

**File:** `src/backend/session/managers/TranscriptManager.ts` lines 174-192

Group `pendingSegments` by their `timestamp` date before calling `appendTranscriptSegments`.

**Risk:** Low. Segments already have a `timestamp` field set at creation time. The only edge case is segments without timestamps (shouldn't happen, but would fall back to `today()`).

### Fix 3: Frontend date filter for today's segments [DEFENSE IN DEPTH]

Even when `loadedDate === dateString`, filter segments by their actual timestamp date. This prevents any stale/misassigned segments from showing up regardless of backend state.

**File:** `src/frontend/pages/day/DayPage.tsx` lines 330-342

```typescript
const daySegments = useMemo(() => {
  if (isDataLoading) return [];

  if (loadedDate === dateString) {
    // For today, also filter by actual segment date to guard against
    // stale segments that haven't been cleared from memory yet
    if (isToday) {
      return allSegments.filter((segment) => {
        if (!segment.timestamp) return true;
        const iso = segment.timestamp instanceof Date
          ? segment.timestamp.toISOString()
          : String(segment.timestamp);
        return iso.slice(0, 10) === dateString;
      });
    }
    // ... existing historical cap logic
```

**Risk:** Very low, pure client-side filter. May filter out segments with timezone mismatches (segment created at 11:30 PM PT would have a UTC date of the next day). Could use timezone-aware date extraction instead of `iso.slice(0, 10)` to avoid this.

---

## Files Involved

| File | Role |
|------|------|
| `src/index.ts:129-137` | WebSocket handler — calls `getOrCreate` + `addClient` |
| `src/lib/synced.ts:178-186` | `SyncedSession.hydrate()` — only runs once (`hydrated` flag) |
| `src/lib/synced.ts:213-218` | `addClient` — sends snapshot immediately on connect |
| `src/lib/sync.ts:604-610` | Same as above (alternate sync lib) |
| `src/backend/session/managers/TranscriptManager.ts` | `hydrate()`, `persist()`, `loadTodayTranscript()` |
| `src/frontend/pages/day/DayPage.tsx` | `daySegments` memo, `isDataLoading`, date matching |
| `src/frontend/pages/day/components/tabs/TranscriptTab.tsx` | Hour grouping from segment timestamps |
