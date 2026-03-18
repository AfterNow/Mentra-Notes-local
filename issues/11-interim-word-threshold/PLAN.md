# Interim Word Threshold — Force-Finalize Long Interim Segments

Owner: Aryan
Priority: Medium — UX reliability for continuous speech
Related: `issues/2-interim-fallback` (timeout-based, different trigger)

---

## Problem

When a user speaks continuously without pausing, the speech recognition engine may not emit an `isFinal` segment for a long time. The interim text keeps growing unboundedly — a single interim can become hundreds of words. This causes:

1. **UI issue**: The interim text blob on the frontend keeps growing, making it hard to read
2. **Data loss risk**: If the connection drops mid-interim, all that text is lost (only final segments are persisted)
3. **Chunk pipeline starvation**: The auto-notes chunk buffer only receives final segments, so a 2-minute monologue produces zero chunks

---

## Solution: Word Count Threshold on Interim Text

When interim text exceeds a word count threshold (50 words), force-finalize it:

1. Take the current interim text and emit it as a final segment
2. Reset the interim buffer
3. The next interim from the speech engine will contain **all** accumulated text (old + new), but we only keep the **new portion** (everything after what we already finalized)

This creates a stream of reasonably-sized final segments even during continuous speech.

---

## Key Design Decision: Cumulative Word Count Stripping

The speech recognition engine doesn't know we force-finalized. It will keep sending full cumulative interim text that includes words we already finalized. We strip the prefix using a **cumulative word count** — we track how many words have been force-finalized so far, and skip that many words from each new interim.

This is simpler and more reliable than text comparison, since the speech engine may revise earlier words.

---

## Files to Modify

```
src/backend/session/managers/TranscriptManager.ts  — add threshold logic in addSegment()
```

---

## Implementation Steps

### Step 1 — Add Threshold Config

In `TranscriptManager.ts`, add a constant:

```ts
const INTERIM_WORD_THRESHOLD = 50; // Force-finalize after this many words
```

### Step 2 — Track Force-Finalized Word Count

Add instance variables to `TranscriptManager`:

```ts
private _forceFinalizedWordCount: number = 0;  // Cumulative words force-finalized
```

### Step 3 — Modify `addSegment()` Interim Handling

Current logic (simplified):
```ts
if (!isFinal) {
  this.interimText = text;
  return;
}
```

New logic:
```ts
if (!isFinal) {
  // Strip already-finalized words from the interim using word count
  const interimWords = text.trim().split(/\s+/);
  const cleanWords = interimWords.slice(this._forceFinalizedWordCount);
  const cleanInterim = cleanWords.join(" ");

  if (cleanWords.length >= INTERIM_WORD_THRESHOLD) {
    // Force-finalize: treat this interim as a final segment
    console.log(`[TranscriptManager] Force-finalizing interim (${cleanWords.length} words)`);
    this._forceFinalizedWordCount = interimWords.length; // Track total words finalized
    // Fall through to final segment handling with cleanInterim as the text
    // ... (create segment with isFinal: true, cleanInterim as text)
  } else {
    this.interimText = cleanInterim;
    return;
  }
}
```

### Step 4 — Reset on Final Segment

When a real `isFinal` segment arrives from the speech engine, reset the tracking:

```ts
if (isFinal) {
  this._forceFinalizedWordCount = 0; // Reset — speech engine finalized naturally
  // ... existing final handling
}
```

### Step 5 — Reset on Recording Stop

In `stopRecording()` or equivalent, reset:
```ts
this._forceFinalizedWordCount = 0;
```

---

## Edge Cases

### 1. User pauses briefly then continues
The speech engine may emit a final for the first part, then start fresh interims for the continuation. `_forceFinalizedWordCount` gets reset on real finals, so this works naturally.

### 2. Force-finalized segment overlaps with a late real final
If the speech engine finally emits a real `isFinal` that covers the same text we already force-finalized, we'd get duplicates.

**Mitigation**: When a real final arrives and `_forceFinalizedWordCount > 0`, check if its text substantially overlaps with what we already force-finalized. If >70% word overlap, skip it and just reset the counter.

### 3. Connection drops mid-interim
With the threshold in place, we force-finalize every ~50 words, so at most ~50 words of speech would be lost on disconnect instead of potentially minutes of speech.

---

## Testing Checklist

- [ ] Normal speech with natural pauses: verify force-finalize never triggers (pauses produce real finals before 50 words)
- [ ] Continuous monologue (no pauses): verify segments are force-finalized every ~50 words
- [ ] Verify stripped text doesn't include duplicates from previous force-finalized segments
- [ ] Verify real finals after force-finalized segments don't create duplicates
- [ ] Verify chunk buffer receives the force-finalized segments correctly
- [ ] Verify UI shows clean interim text (not growing unboundedly)

---

## Config Summary

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `INTERIM_WORD_THRESHOLD` | 50 words | Force-finalize interim text after this many words |
