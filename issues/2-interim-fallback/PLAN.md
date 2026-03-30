# Interim Transcript Fallback — Implementation Plan

Owner: Aryan
Priority: Medium — Reliability fix for poor microphone scenarios

---

## Problem

The chunk buffer only accepts **final** transcript segments (`NotesSession.ts:162`). If the speech recognition engine struggles (bad mic, background noise, accent issues), it may produce a stream of interim results that never finalize. In this case:

1. `markSpeaking(true)` keeps firing (interims flowing)
2. `addText()` is never called (no finals arrive)
3. Heartbeat sees empty buffer + `isSpeaking = true` → skips silently
4. **Result: Speech is lost. No chunks, no notes, no error.**

---

## Solution: Interim Timeout Fallback

If interim transcripts have been flowing for N seconds without a single final arriving, take the **latest interim text** and promote it to a final — feeding it into the chunk buffer.

This keeps finals as the primary (accurate) source while preventing silent data loss.

---

## Files to Modify

```
src/backend/session/NotesSession.ts          — track interim state, add timeout logic
src/backend/services/auto-notes/config.ts    — add INTERIM_FALLBACK_TIMEOUT_MS parameter
```

No new files needed.

---

## Implementation Steps

### Step 1 — Add Config Parameter

In `config.ts`, add:

```
INTERIM_FALLBACK_TIMEOUT_MS: 15_000   // 15 seconds of interims with no final → promote latest interim
```

Why 15 seconds: Most speech recognition engines finalize within 5-10 seconds. 15s gives plenty of room for slow finalization while still catching the "never finalizes" case before the user loses a meaningful amount of speech.

### Step 2 — Track Interim State in NotesSession

Add to `NotesSession`:

- `private _lastInterimText: string = ""` — stores the most recent interim transcript text
- `private _lastInterimTime: number = 0` — timestamp of when interims started flowing (without a final in between)
- `private _interimFallbackTimer: ReturnType<typeof setTimeout> | null = null`

### Step 3 — Modify `onTranscription()` in NotesSession

Current logic:
```ts
onTranscription(text: string, isFinal: boolean, speakerId?: string): void {
  this.transcript.addSegment(text, isFinal, speakerId);
  this.chunkBuffer.markSpeaking(!isFinal);
  if (isFinal && text.trim()) {
    this.chunkBuffer.addText(text);
  }
}
```

New logic:
```ts
onTranscription(text: string, isFinal: boolean, speakerId?: string): void {
  this.transcript.addSegment(text, isFinal, speakerId);
  this.chunkBuffer.markSpeaking(!isFinal);

  if (isFinal && text.trim()) {
    // Got a real final — feed it to chunk buffer and reset interim tracking
    this.chunkBuffer.addText(text);
    this.clearInterimFallback();
  } else if (!isFinal && text.trim()) {
    // Interim result — track it and start fallback timer if not already running
    this._lastInterimText = text;
    this.startInterimFallbackIfNeeded();
  }
}
```

### Step 4 — Implement Fallback Timer Methods

```ts
private startInterimFallbackIfNeeded(): void {
  // Timer already running — just update the stored text (done in onTranscription)
  if (this._interimFallbackTimer) return;

  this._interimFallbackTimer = setTimeout(() => {
    this.promoteInterim();
  }, AUTO_NOTES_CONFIG.INTERIM_FALLBACK_TIMEOUT_MS);
}

private promoteInterim(): void {
  if (this._lastInterimText.trim()) {
    console.warn(
      `[NotesSession] No final transcript in ${AUTO_NOTES_CONFIG.INTERIM_FALLBACK_TIMEOUT_MS}ms — promoting interim: "${this._lastInterimText.substring(0, 50)}..."`
    );
    this.chunkBuffer.addText(this._lastInterimText);
  }
  this.clearInterimFallback();
}

private clearInterimFallback(): void {
  if (this._interimFallbackTimer) {
    clearTimeout(this._interimFallbackTimer);
    this._interimFallbackTimer = null;
  }
  this._lastInterimText = "";
}
```

### Step 5 — Clean Up on Disconnect

In `clearAppSession()`, add:
```ts
this.clearInterimFallback();
```

This prevents a stale timer from firing after glasses disconnect.

---

## Edge Cases

### 1. Interim text keeps changing — which version do we use?
We always store the **latest** interim (`_lastInterimText` gets overwritten on each interim event). By the time the 15s timer fires, we have the most refined version the speech engine produced. This is the best guess available.

### 2. Final arrives just before the timer fires
`clearInterimFallback()` is called on every final, which cancels the timer. No double-feeding occurs. The final takes priority as intended.

### 3. Rapid alternating interim → final → interim → final
Normal behavior. Each final cancels the timer, each new interim-only streak restarts it. The fallback only triggers during a sustained 15-second gap with no finals.

### 4. Interim text overlaps with a late-arriving final
Speech recognition engines replace interim text with the final. If a final arrives for the same utterance after we already promoted the interim, we'd get **duplicate text** in the buffer.

**Mitigation:** After promoting an interim, set a short "cooldown" flag. If a final arrives within 2 seconds of a promotion and its text substantially overlaps with the promoted text (e.g., >70% word overlap), skip that final to avoid duplication.

Add to config:
```
INTERIM_PROMOTION_COOLDOWN_MS: 2_000
```

Implementation:
```ts
private _lastPromotionTime: number = 0;
private _lastPromotedText: string = "";

// In the final handling path:
if (isFinal && text.trim()) {
  if (this.shouldSkipDuplicateFinal(text)) {
    console.log(`[NotesSession] Skipping duplicate final after interim promotion`);
    this.clearInterimFallback();
    return;  // skip addText, still clear the timer
  }
  this.chunkBuffer.addText(text);
  this.clearInterimFallback();
}

private shouldSkipDuplicateFinal(finalText: string): boolean {
  if (!this._lastPromotedText) return false;
  const elapsed = Date.now() - this._lastPromotionTime;
  if (elapsed > AUTO_NOTES_CONFIG.INTERIM_PROMOTION_COOLDOWN_MS) return false;

  // Simple word overlap check
  const promotedWords = new Set(this._lastPromotedText.toLowerCase().split(/\s+/));
  const finalWords = finalText.toLowerCase().split(/\s+/);
  const overlap = finalWords.filter(w => promotedWords.has(w)).length;
  return overlap / finalWords.length > 0.7;
}
```

### 5. User goes silent (stops speaking) — interims stop, timer is still running
If the user stops speaking, interims stop flowing and `markSpeaking(false)` is called (from the last final or silence detection). The timer may still fire with stale interim text.

**Mitigation:** In `promoteInterim()`, check `this.chunkBuffer._isSpeaking`. If false (no speech activity), skip promotion — the user already stopped talking and the text was likely already captured via finals or is truly silence.

### 6. Very short interims (single words like "um", "uh")
These would be promoted if 15 seconds pass. This is acceptable — the triage classifier downstream already filters chunks under 4 words as `auto-skipped`. No special handling needed.

### 7. Session dispose while timer is pending
Add to `dispose()`:
```ts
this.clearInterimFallback();
```

---

## Testing Checklist

- [ ] Normal mic: finals flow normally, fallback timer never fires
- [ ] Simulate bad mic: send only interims for 20s → verify interim gets promoted at 15s
- [ ] Send interims for 14s then a final → verify timer cancels, final is used
- [ ] Send interims, promote happens, then late final arrives → verify dedup works
- [ ] Disconnect glasses while timer is running → verify timer is cleaned up
- [ ] Session dispose while timer is running → verify no errors

---

## Config Summary

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `INTERIM_FALLBACK_TIMEOUT_MS` | 15,000 ms | How long to wait for a final before promoting interim |
| `INTERIM_PROMOTION_COOLDOWN_MS` | 2,000 ms | Window after promotion where duplicate finals are skipped |
