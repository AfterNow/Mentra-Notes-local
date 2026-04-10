/**
 * PostHog client initialization
 *
 * Analytics is DISABLED BY DEFAULT for privacy.
 * To enable: set VITE_ENABLE_ANALYTICS=true in your .env file.
 */

import PostHog from "posthog-js";

// Check if analytics is enabled (defaults to false for privacy)
const isAnalyticsEnabled = import.meta.env.VITE_ENABLE_ANALYTICS === "true";
const posthogKey = import.meta.env.VITE_POSTHOG_KEY;

// Only initialize PostHog if explicitly enabled AND key is provided
if (isAnalyticsEnabled && posthogKey) {
  PostHog.init(posthogKey, {
    api_host: "/api/posthog",
    ui_host: "https://us.posthog.com",
    persistence: "memory",
  });
  console.log("[PostHog] Analytics enabled");
} else {
  // Create a no-op PostHog instance for when analytics is disabled
  console.log("[PostHog] Analytics disabled (VITE_ENABLE_ANALYTICS not set)");
}

/**
 * Check if analytics is enabled
 */
export function isPostHogEnabled(): boolean {
  return isAnalyticsEnabled && !!posthogKey;
}

export default PostHog;
