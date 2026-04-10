/**
 * PostHog service barrel export
 *
 * Analytics is DISABLED BY DEFAULT for privacy.
 * Set VITE_ENABLE_ANALYTICS=true and VITE_POSTHOG_KEY to enable.
 */

export { default as PostHog, isPostHogEnabled } from "./client";
export { useFeatureFlag, FLAGS } from "./features";
export {
  trackOnboardingStarted,
  trackOnboardingStepViewed,
  trackOnboardingCompleted,
  trackOnboardingSkipped,
  trackOnboardingProfileFilled,
  trackOnboardingPrioritiesSelected,
  trackOnboardingContactsAdded,
  trackOnboardingTopicsAdded,
} from "./events";
