# [not-done] HomePage Infinite Re-render Loop

Priority: High
Status: Not Started
Date: 2026-03-13

---

## Problem

HomePage re-renders hundreds of times per second, spamming the console with identical render logs. ChatManager also repeatedly loads chat history for the same dates. This degrades performance significantly.

```
[browser] [HomePage] Render - backendFilter: all, activeView: folders, activeFilter: all, files: 27
[ChatManager] Loading chat history for 2026-03-12
[ChatManager] Loading chat history for 2026-03-13
```

## Root Cause

The `useSynced` hook creates a **new Proxy object** on every state version change, causing all consumers to re-render even when the underlying data hasn't changed.

**File:** `src/frontend/hooks/useSynced.ts` line 314-379

```typescript
const session = useMemo((): T | null => {
  // ... creates new Proxy object every time
  return new Proxy({} as object, { ... }) as T;
}, [client, version]);  // <-- version changes on EVERY state_change
```

### How the loop works

1. Backend sends `state_change` (e.g. `refreshCounts()` in FileManager, ChatManager loading history)
2. `scheduleNotify()` increments `_version` in the SyncClient
3. `setVersion(client.version)` triggers React state update
4. `useMemo` recomputes because `version` is in its dependency array
5. A brand new Proxy object is created (new reference)
6. React sees new `session` object reference, re-renders all consumers
7. Downstream effects (ChatManager loads, FileManager counts) trigger more state changes
8. Loop repeats

### Why the Proxy recreation is unnecessary

The Proxy reads from `client.currentState` dynamically on every property access. It doesn't capture state at creation time. So recreating it on every version bump produces an identical Proxy — just with a new object reference that React treats as a change.

## Proposed Fix

Make the Proxy a **stable reference** using `useRef`. The `version` state update still triggers re-renders (React sees `setVersion` call), but the `session` object identity stays the same, preventing unnecessary cascade re-renders in child components.

```typescript
// Store proxy in a ref so it's created once per client
const proxyRef = useRef<T | null>(null);

if (client && !proxyRef.current) {
  proxyRef.current = new Proxy({} as object, {
    get(target, prop: string) {
      const state = client.currentState;
      if (!state) return undefined;
      // ... same proxy logic, but reads state dynamically
    },
  }) as T;
}

const session = client?.currentState && Object.keys(client.currentState).length > 0
  ? proxyRef.current
  : null;

// version is consumed implicitly by being in component scope (triggers re-render)
void version;
```

This ensures:
- Re-renders still happen when state changes (via `setVersion`)
- But child components only re-render if the values they read actually changed (since session identity is stable)

## Secondary Issue: ChatManager Repeated Loading

ChatManager loads chat history on every re-render cycle. Should add a guard to skip loading if the date hasn't changed since last load.

## Files Involved

- `src/frontend/hooks/useSynced.ts` — Proxy creation in useMemo (primary fix)
- `src/frontend/pages/home/HomePage.tsx` — debug console.log (remove after fix)
- `src/backend/session/managers/ChatManager.ts` — repeated history loading
- `src/backend/session/managers/FileManager.ts` — refreshCounts() triggering state changes
