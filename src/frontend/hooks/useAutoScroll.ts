/**
 * useAutoScroll - Smart auto-scroll for live content (transcripts, chat, etc.)
 *
 * Behavior:
 * - On mount: scrolls to bottom instantly
 * - New content (DOM mutations): auto-scrolls to bottom if enabled
 * - User touches screen and scrolls UP: disables auto-scroll, shows button
 * - User taps "scroll to bottom" button: re-enables auto-scroll, scrolls down
 * - Auto-scroll ONLY re-enables via the button — never from scroll position
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
  const autoScrollRef = useRef(true);
  const isTouchingRef = useRef(false);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Reset state on re-init
    autoScrollRef.current = true;
    setShowScrollButton(false);

    let scrollAtTouchStart = 0;

    const handleTouchStart = () => {
      isTouchingRef.current = true;
      scrollAtTouchStart = container.scrollTop;
    };

    const handleTouchEnd = () => {
      isTouchingRef.current = false;
    };

    const handleScroll = () => {
      if (!isTouchingRef.current) return;
      // User scrolled up from where they started touching — unlock
      if (container.scrollTop < scrollAtTouchStart) {
        autoScrollRef.current = false;
        setShowScrollButton(true);
      } else {
        // User scrolled back to bottom — re-lock
        const { scrollTop, scrollHeight, clientHeight } = container;
        if (scrollHeight - scrollTop - clientHeight < 50) {
          autoScrollRef.current = true;
          setShowScrollButton(false);
        }
      }
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });
    container.addEventListener("scroll", handleScroll, { passive: true });

    // Auto-scroll on new content (DOM mutations) only if enabled
    let observer: MutationObserver | null = null;
    if (!disableAutoScroll) {
      observer = new MutationObserver(() => {
        if (!autoScrollRef.current) return;
        requestAnimationFrame(() => {
          container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
        });
      });
      observer.observe(container, { childList: true, subtree: true, characterData: true });
    }

    // Initial scroll to bottom
    container.scrollTo({ top: container.scrollHeight, behavior: "instant" });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("scroll", handleScroll);
      observer?.disconnect();
    };
  }, deps);

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    autoScrollRef.current = true;
    setShowScrollButton(false);
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, []);

  return { scrollContainerRef, showScrollButton, scrollToBottom };
}
