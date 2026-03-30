/**
 * Auto-Conversation Pipeline Index
 *
 * Re-exports all auto-conversation pipeline components.
 */

export { AUTO_NOTES_CONFIG } from "./config";
export {
  DOMAIN_PROFILES,
  containsHighSignalKeyword,
  getDomainPromptContext,
  type DomainProfile,
  type DomainContext,
} from "./domain-config";
export { TriageClassifier, type TriageResult } from "../../classifier/TriageClassifier";
export {
  ConversationTracker,
  type TrackerState,
  type TrackingDecision,
} from "./ConversationTracker";
