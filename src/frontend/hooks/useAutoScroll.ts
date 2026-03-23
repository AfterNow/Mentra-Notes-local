/**
 * useAutoScroll - Smart auto-scroll for live content (transcripts, chat, etc.)
 *
 * Behavior:
 * - On mount: scrolls to bottom instantly
 * - New content (DOM child additions): auto-scrolls to bottom if locked
 * - User scrolls up (away from bottom): unlocks auto-scroll, shows button
 * - User scrolls back near bottom (within 200px): re-locks auto-scroll
 * - Button tap: re-locks and scrolls to bottom
 *
 * Returns:
 * - scrollContainerRef: attach to the scrollable container element
 * - showScrollButton: whether to show the "jump to bottom" button
 * - scrollToBottom: call this from the button's onClick
 */

import { useEffect, useRef, useState, useCallback, type RefObject } from "react";

interface UseAutoScrollOptions {
  /** Re-initialize when this value changes (e.g., loading state) */
  deps?: unknown[];
  /** Disable the MutationObserver auto-scroll (useful for non-live views) */
  disableAutoScroll?: boolean;
}

interface UseAutoScrollReturn {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  showScrollButton: boolean;
  scrollToBottom: () => void;
}

export function useAutoScroll(options: UseAutoScrollOptions = {}): UseAutoScrollReturn {
  const { deps = [], disableAutoScroll = false } = options;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const lockedRef = useRef(true);
  const initialDone = useRef(false);

  // Initial scroll to bottom (once per deps change)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (initialDone.current) return;
    initialDone.current = true;
    lockedRef.current = true;
    setShowScrollButton(false);
    container.scrollTo({ top: container.scrollHeight, behavior: "instant" });
  }, deps);

  // Reset initial flag when deps change
  useEffect(() => {
    initialDone.current = false;
  }, deps);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isNearBottom = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      return scrollHeight - scrollTop - clientHeight < 200;
    };

    // Detect scroll position — works for touch, mouse, keyboard
    const handleScroll = () => {
      if (isNearBottom()) {
        lockedRef.current = true;
        setShowScrollButton(false);
      } else {
        lockedRef.current = false;
        setShowScrollButton(true);
      }
    };

    // Auto-scroll on new child elements only when locked
    // No characterData — avoids interim text causing scroll jank
    let observer: MutationObserver | null = null;
    if (!disableAutoScroll) {
      observer = new MutationObserver(() => {
        if (!lockedRef.current) return;
        requestAnimationFrame(() => {
          container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
        });
      });
      observer.observe(container, { childList: true, subtree: true });
    }

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      observer?.disconnect();
    };
  }, deps);

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    lockedRef.current = true;
    setShowScrollButton(false);
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, []);

  return { scrollContainerRef, showScrollButton, scrollToBottom };
}
