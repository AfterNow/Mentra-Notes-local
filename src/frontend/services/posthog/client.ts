/**
 * PostHog client initialization
 *
 * Analytics is DISABLED BY DEFAULT for privacy.
 * To enable: set VITE_ENABLE_ANALYTICS=true in your .env file.
 */

import PostHog from "posthog-js";

// Check if analytics is enabled (defaults to false for privacy)
// Handle case where import.meta.env might be undefined in some builds
const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
const isAnalyticsEnabled = env.VITE_ENABLE_ANALYTICS === "true";
const posthogKey = env.VITE_POSTHOG_KEY as string | undefined;

// Only initialize PostHog if explicitly enabled AND key is provided
if (isAnalyticsEnabled && posthogKey) {
  PostHog.init(posthogKey, {
    api_host: "/api/posthog",
    ui_host: "https://us.posthog.com",
    persistence: "memory",
  });
  console.log("[PostHog] Analytics enabled");
} else {
  // Analytics disabled - PostHog methods will be no-ops
  console.log("[PostHog] Analytics disabled");
}

/**
 * Check if analytics is enabled
 */
export function isPostHogEnabled(): boolean {
  return isAnalyticsEnabled && !!posthogKey;
}

export default PostHog;
