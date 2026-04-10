/**
 * PostHog feature flags
 *
 * Hook for checking feature flags + known flag constants.
 * Returns default values when analytics is disabled.
 */

import { useState, useEffect } from "react";
import PostHog, { isPostHogEnabled } from "./client";

/**
 * React hook that returns whether a feature flag is enabled.
 * Re-renders when PostHog feature flags are loaded.
 *
 * When analytics is disabled, immediately returns the default value.
 */
export function useFeatureFlag(
  flag: string,
  defaultValue = false,
): { enabled: boolean; loaded: boolean } {
  const [flagsLoaded, setFlagsLoaded] = useState(!isPostHogEnabled());
  const [enabled, setEnabled] = useState(defaultValue);

  useEffect(() => {
    // If analytics is disabled, use default value immediately
    if (!isPostHogEnabled()) {
      setEnabled(defaultValue);
      setFlagsLoaded(true);
      return;
    }

    // Check if flags were already loaded before this hook mounted
    const val = PostHog.isFeatureEnabled(flag);
    console.log(`[PostHog] useFeatureFlag init "${flag}":`, val, "typeof:", typeof val);
    if (typeof val === "boolean") {
      setEnabled(val);
      setFlagsLoaded(true);
    }

    // Fallback: if PostHog never responds, unblock after 3s with default value
    const timeout = setTimeout(() => {
      setFlagsLoaded((loaded) => {
        if (!loaded) console.warn(`[PostHog] Flag "${flag}" timed out — using default`);
        return true;
      });
    }, 3000);

    const unsubscribe = PostHog.onFeatureFlags(() => {
      const val = PostHog.isFeatureEnabled(flag);
      console.log(`[PostHog] onFeatureFlags "${flag}":`, val);
      // When flags have loaded, undefined means the flag is disabled/absent → treat as false
      setEnabled(val === true);
      setFlagsLoaded(true);
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [flag, defaultValue]);

  return { enabled: flagsLoaded ? enabled : defaultValue, loaded: flagsLoaded };
}

/** Known feature flag keys */
export const FLAGS = {
  NEW_MENTRA_UI: "new-mentraos-ui-miniapps",
  FRONTEND_ONBOARD: "frontend-onboard",
} as const;
