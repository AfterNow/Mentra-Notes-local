/**
 * TriageClassifier (Stage 2)
 *
 * Classifies each 40-second chunk as:
 * - auto-skipped: under word minimum with no high-signal keywords
 * - filler: LLM says it's background noise / small talk
 * - meaningful: LLM says it's substantive conversation worth tracking
 */

import type { TranscriptChunkI } from "../models/transcript-chunk.model";
import {
  getRecentChunks,
  updateChunkClassification,
} from "../models/transcript-chunk.model";
import { AUTO_NOTES_CONFIG } from "../core/auto-conversation/config";
import {
  containsHighSignalKeyword,
  getDomainPromptContext,
  type DomainProfile,
} from "../core/auto-conversation/domain-config";
import {
  createProviderFromEnv,
  type AgentProvider,
} from "../services/llm";

export type TriageResult = "auto-skipped" | "filler" | "meaningful";

export class TriageClassifier {
  private provider: AgentProvider | null = null;
  private domainProfile: DomainProfile;

  constructor(domainProfile: DomainProfile = "general") {
    this.domainProfile = domainProfile;

    try {
      this.provider = createProviderFromEnv();
    } catch (error) {
      console.error(
        "[Triage] No LLM provider available, will auto-skip all chunks:",
        error,
      );
    }
  }

  /**
   * Update the domain profile (e.g., when user changes room context)
   */
  setDomainProfile(profile: DomainProfile): void {
    this.domainProfile = profile;
  }

  /**
   * Classify a chunk. Updates the chunk's classification in DB and returns the result.
   */
  async classify(chunk: TranscriptChunkI): Promise<TriageResult> {
    // -----------------------------------------------------------------------
    // Stage 2a: Auto-skip check (no LLM needed)
    // -----------------------------------------------------------------------
    if (chunk.wordCount === 0 || !chunk.text.trim()) {
      // Silence signals (no _id) are treated as filler so the tracker can
      // detect silence patterns and pause/end conversations.
      // Persisted empty chunks are auto-skipped as before.
      if (!chunk._id) {
        return "filler";
      }
      await updateChunkClassification(chunk._id.toString(), "auto-skipped");
      return "auto-skipped";
    }

    if (
      chunk.wordCount < AUTO_NOTES_CONFIG.PRE_FILTER_WORD_MIN &&
      !containsHighSignalKeyword(chunk.text, this.domainProfile)
    ) {
      console.log(
        `[Triage] Chunk #${chunk.chunkIndex}: auto-skipped (${chunk.wordCount} words, below minimum, no keywords)`,
      );
      await updateChunkClassification(chunk._id!.toString(), "auto-skipped");
      return "auto-skipped";
    }

    // -----------------------------------------------------------------------
    // Stage 2b: LLM classification
    // -----------------------------------------------------------------------
    if (!this.provider) {
      // No LLM → conservative: treat as meaningful
      await updateChunkClassification(chunk._id!.toString(), "meaningful");
      return "meaningful";
    }

    try {
      // Get previous chunks for context
      const previousChunks = await getRecentChunks(
        chunk.userId,
        chunk.date,
        AUTO_NOTES_CONFIG.CONTEXT_LOOKBACK_CHUNKS + 1, // +1 because the current chunk is included
      );
      // Remove the current chunk from context
      const contextChunks = previousChunks.filter(
        (c) => c._id?.toString() !== chunk._id?.toString(),
      );

      const contextText = contextChunks
        .map((c) => `[Previous chunk]: ${c.text}`)
        .join("\n");

      const domainContext = getDomainPromptContext(this.domainProfile);

      const prompt = `You are a transcript triage classifier for smart glasses worn by a single user. Your job is to decide if a transcript chunk contains meaningful conversation the user is participating in, or is just filler/background noise.

If the chunk sounds like TV, a podcast, YouTube, a lecture, or any broadcast playing in the background — not a conversation the user is actively participating in — classify as FILLER.

Domain context: ${domainContext}

${contextText ? `Recent context:\n${contextText}\n\n` : ""}Current chunk to classify:
"${chunk.text}"

Classify this chunk as either FILLER or MEANINGFUL.

FILLER means:
- Background noise, music, TV, or transcription artifacts (e.g. "[inaudible]", "[crosstalk]")
- One-way monologues: lectures, podcasts, news segments, YouTube videos, audiobooks
- Content that lacks conversational markers (no turn-taking, no direct address to the user)
- Audio that sounds scripted, read aloud, or educational without user participation
- Greetings and goodbyes with no substance ("hey how's it going", "see you later")
- Small talk about weather, food, commute, sports, weekend plans
- Pure acknowledgments and backchannel ("yeah", "okay sure", "mmhmm", "that's interesting")
- Stalling and non-committal responses ("we'll see", "let me think about it", "hmm")
- Transition phrases with no content ("anyway, moving on", "so yeah")
- Vague agreement or deference with no new information ("whatever you think is best")
- Personal momentary interruptions with no lasting info ("hold on, left my keys", "let me grab my charger", "one sec, bathroom break")
- Standalone location references without context that don't convey who/what/why (e.g. "Room 204" alone with no surrounding discussion)

MEANINGFUL means:
- Specific facts, numbers, names, dates, or times that answer a question or advance a discussion (e.g. "Thursday at nine", "two fifty", "she quit")
- Decisions, agreements, or disagreements about something concrete
- Action items, requests, or commitments
- Problem reports, incidents, or complaints with specifics
- Planning, scheduling, or coordination
- Any statement that a note-taker would want to capture
- Must involve the user participating in the conversation (not just overhearing it)

IMPORTANT: Even very short phrases can be meaningful if they convey a specific fact, data point, or decision. "She quit" is meaningful (important news). "Thursday at nine" is meaningful (scheduling). "Two fifty" is meaningful (a number/price). But "okay sure" is filler (pure acknowledgment).

When transcription produces doubled/repeated words (e.g. "I I left left my my keys keys"), look past the repetition to judge the underlying content. A personal errand interruption is still filler even with transcription artifacts.

Respond with exactly one word: FILLER or MEANINGFUL`;

      const response = await this.provider.chat(
        [{ role: "user", content: prompt }],
        {
          tier: AUTO_NOTES_CONFIG.TRIAGE_MODEL_TIER,
          maxTokens: AUTO_NOTES_CONFIG.TRIAGE_MAX_TOKENS,
          temperature: 0.1,
        },
      );

      const responseText =
        response.content
          .filter((c) => c.type === "text")
          .map((c) => (c as any).text)
          .join("")
          .trim()
          .toUpperCase() || "MEANINGFUL";

      const classification: TriageResult = responseText.includes("FILLER")
        ? "filler"
        : "meaningful";

      console.log(
        `[Triage] Chunk #${chunk.chunkIndex}: ${classification} (LLM: ${responseText}, ${chunk.wordCount} words)`,
      );

      await updateChunkClassification(chunk._id!.toString(), classification);
      return classification;
    } catch (error) {
      console.error(
        `[Triage] LLM classification failed for chunk #${chunk.chunkIndex}, defaulting to meaningful:`,
        error,
      );
      // Fail-open: treat as meaningful
      await updateChunkClassification(chunk._id!.toString(), "meaningful");
      return "meaningful";
    }
  }
}
