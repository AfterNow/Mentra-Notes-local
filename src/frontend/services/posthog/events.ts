/**
 * PostHog event tracking
 *
 * Centralized event tracking functions for analytics.
 * All functions are no-ops when analytics is disabled.
 */

import PostHog, { isPostHogEnabled } from "./client";

/**
 * Safe capture wrapper - only sends events when analytics is enabled
 */
function safeCapture(event: string, properties?: Record<string, unknown>) {
  if (isPostHogEnabled()) {
    PostHog.capture(event, properties);
  }
}

// -- Onboarding Events --

export function trackOnboardingStarted() {
  safeCapture("onboarding_started");
}

export function trackOnboardingStepViewed(step: number, stepName: string) {
  safeCapture("onboarding_step_viewed", { step, step_name: stepName });
}

export function trackOnboardingCompleted() {
  safeCapture("onboarding_completed");
}

export function trackOnboardingSkipped(atStep: number) {
  safeCapture("onboarding_skipped", { skipped_at_step: atStep });
}

export function trackOnboardingProfileFilled(fields: {
  hasName: boolean;
  hasRole: boolean;
  hasCompany: boolean;
  linkedLinkedIn: boolean;
}) {
  safeCapture("onboarding_profile_filled", fields);
}

export function trackOnboardingPrioritiesSelected(priorities: string[]) {
  safeCapture("onboarding_priorities_selected", {
    priorities,
    count: priorities.length,
  });
}

export function trackOnboardingContactsAdded(count: number) {
  safeCapture("onboarding_contacts_added", { count });
}

export function trackOnboardingTopicsAdded(topics: string[]) {
  safeCapture("onboarding_topics_added", {
    topics,
    count: topics.length,
  });
}
