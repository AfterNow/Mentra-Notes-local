/**
 * SkipDialog - Confirmation dialog when user tries to skip onboarding
 */

import { motion, AnimatePresence } from "motion/react";

interface SkipDialogProps {
  open: boolean;
  onContinue: () => void;
  onSkip: () => void;
}

export function SkipDialog({ open, onContinue, onSkip }: SkipDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 p-8 flex flex-col items-center gap-5"
          >
            {/* Warning icon */}
            <div className="flex items-center justify-center rounded-2xl bg-[#FEE2E2] size-14">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>

            {/* Text */}
            <div className="flex flex-col items-center gap-2">
              <div className="text-[22px] leading-[28px] text-[#1C1917] dark:text-white font-['Red_Hat_Display',system-ui,sans-serif] font-extrabold">
                Skip setup?
              </div>
              <div className="text-[15px] leading-[22px] text-[#78716C] font-['Red_Hat_Display',system-ui,sans-serif] text-center">
                Setup helps personalize your experience.
                <br />
                Skipping means:
              </div>
            </div>

            {/* Consequences */}
            <div className="flex flex-col gap-3 w-full">
              <div className="flex items-center gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <div className="text-[15px] leading-[20px] text-[#1C1917] dark:text-white font-['Red_Hat_Display',system-ui,sans-serif]">
                  Notes may not be personalized to your role
                </div>
              </div>
              <div className="flex items-center gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <div className="text-[15px] leading-[20px] text-[#1C1917] dark:text-white font-['Red_Hat_Display',system-ui,sans-serif]">
                  Summaries may be less accurate
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-3 w-full pt-1">
              <button
                onClick={onContinue}
                className="flex items-center justify-center w-full h-[52px] rounded-[28px] bg-[#1C1917] dark:bg-white active:scale-[0.98] transition-transform"
              >
                <div className="text-[16px] text-[#FAFAF9] dark:text-black font-['Red_Hat_Display',system-ui,sans-serif] font-bold">
                  Continue Setup
                </div>
              </button>
              <button
                onClick={onSkip}
                className="flex items-center justify-center w-full h-[52px] rounded-[28px] border border-[#D6D3D1] dark:border-zinc-700 active:scale-[0.98] transition-transform"
              >
                <div className="text-[16px] text-[#1C1917] dark:text-white font-['Red_Hat_Display',system-ui,sans-serif] font-semibold">
                  Skip Anyway
                </div>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
