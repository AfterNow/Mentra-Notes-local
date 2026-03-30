/**
 * OnboardingPage - Multi-step onboarding flow
 *
 * Shows every time the app opens (logic not implemented yet).
 * Steps:
 * 1. Welcome - Introduction to Mentra Notes
 * 2. Tell us about you - Name, role, company, LinkedIn
 * 3. What matters most - Priority selection
 * 4. Who do you talk to most - Contacts & topics
 * 5-9. Tutorial walkthrough (5 pages: Always on, AI does the work, Stay organized, Swipe to manage, You're all set)
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "motion/react";
import { useMentraAuth } from "@mentra/react";
import { useSynced } from "../../hooks/useSynced";
import type { SessionI } from "../../../shared/types";
import {
  trackOnboardingStarted,
  trackOnboardingStepViewed,
  trackOnboardingCompleted,
  trackOnboardingSkipped,
} from "../../services/posthog";
import { WelcomeStep } from "./components/WelcomeStep";
import { AboutYouStep } from "./components/AboutYouStep";
import { PrioritiesStep } from "./components/PrioritiesStep";
import { ContactsStep } from "./components/ContactsStep";
import { TutorialAlwaysOn } from "./components/TutorialAlwaysOn";
import { TutorialAINotes } from "./components/TutorialAINotes";
import { TutorialOrganize } from "./components/TutorialOrganize";
import { TutorialSwipe } from "./components/TutorialSwipe";
import { TutorialComplete } from "./components/TutorialComplete";
import { OnboardingFooter } from "./components/OnboardingFooter";
import { SkipDialog } from "./components/SkipDialog";
import { SplashScreen } from "../../components/shared/SplashScreen";

/** Onboarding form data collected across steps */
export interface OnboardingData {
  name: string;
  role: string;
  company: string;
  priorities: Set<string>;
  contacts: string[];
  topics: string[];
}

const STORAGE_KEY = "onboarding-progress";

/** Persist onboarding step + form data to localStorage */
function saveProgress(step: number, data: OnboardingData) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        step,
        data: { ...data, priorities: Array.from(data.priorities) },
      })
    );
  } catch {}
}

/** Restore onboarding progress from localStorage */
function loadProgress(): { step: number; data: OnboardingData } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      step: parsed.step ?? 0,
      data: {
        name: parsed.data?.name ?? "",
        role: parsed.data?.role ?? "",
        company: parsed.data?.company ?? "",
        priorities: new Set(parsed.data?.priorities ?? ["decisions", "summaries"]),
        contacts: parsed.data?.contacts ?? [],
        topics: parsed.data?.topics ?? [],
      },
    };
  } catch {
    return null;
  }
}

function clearProgress() {
  localStorage.removeItem(STORAGE_KEY);
}

const TOTAL_STEPS = 9;

const STEP_NAMES = [
  "welcome",
  "about_you",
  "priorities",
  "contacts",
  "tutorial_always_on",
  "tutorial_ai_notes",
  "tutorial_organize",
  "tutorial_swipe",
  "tutorial_complete",
];

export function OnboardingPage() {
  const saved = useRef(loadProgress());
  const [step, setStep] = useState(saved.current?.step ?? 0);
  const [direction, setDirection] = useState(1);
  const [showSplash, setShowSplash] = useState(false);
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [, navigate] = useLocation();

  // Synced session for saving onboarding data
  const { userId } = useMentraAuth();
  const { session } = useSynced<SessionI>(userId || "");

  // Lifted onboarding form state
  const [onboardingData, setOnboardingData] = useState<OnboardingData>(
    saved.current?.data ?? {
      name: "",
      role: "",
      company: "",
      priorities: new Set(["decisions", "summaries"]),
      contacts: [],
      topics: [],
    }
  );

  const updateOnboardingData = useCallback((partial: Partial<OnboardingData>) => {
    setOnboardingData((prev) => ({ ...prev, ...partial }));
  }, []);

  /** Save onboarding data to backend via synced session */
  const saveOnboardingData = useCallback(async () => {
    if (!session?.settings) return;
    try {
      await session.settings.updateSettings({
        displayName: onboardingData.name || undefined,
        role: onboardingData.role || undefined,
        company: onboardingData.company || undefined,
        priorities: Array.from(onboardingData.priorities),
        contacts: onboardingData.contacts,
        topics: onboardingData.topics,
        onboardingCompleted: true,
      });
    } catch (err) {
      console.error("[Onboarding] Failed to save data:", err);
    }
  }, [session, onboardingData]);

  // Persist onboarding progress to localStorage on every step/data change
  useEffect(() => {
    saveProgress(step, onboardingData);
  }, [step, onboardingData]);

  // Track onboarding started on mount
  useEffect(() => {
    trackOnboardingStarted();
  }, []);

  // Save data and navigate to home while splash still covers the screen
  const hasSaved = useRef(false);
  useEffect(() => {
    if (!showSplash || hasSaved.current) return;
    hasSaved.current = true;
    clearProgress();
    saveOnboardingData();
    const timer = setTimeout(() => {
      sessionStorage.setItem("onboarding-complete-splash", "1");
      navigate("/");
    }, 2000);
    return () => clearTimeout(timer);
  }, [showSplash]);

  // Track each step view
  useEffect(() => {
    trackOnboardingStepViewed(step, STEP_NAMES[step]);
  }, [step]);

  const next = useCallback(() => {
    if (step >= TOTAL_STEPS - 1) {
      trackOnboardingCompleted();
      setShowSplash(true);
      return;
    }
    setDirection(1);
    setStep((s) => s + 1);
  }, [step]);

  const back = useCallback(() => {
    if (step <= 0) return;
    setDirection(-1);
    setStep((s) => s - 1);
  }, [step]);

  const finish = useCallback(() => {
    trackOnboardingSkipped(step);
    setShowSplash(true);
  }, [step]);

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 80 : -80,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -80 : 80,
      opacity: 0,
    }),
  };

  // Footer config per step: [dotIndex, totalDots, buttonLabel, showBack]
  const isWelcome = step === 0;
  const isLastStep = step === TOTAL_STEPS - 1;
  const dotIndex = step - 1; // step 1 → dot 0, step 8 → dot 7
  const totalDots = TOTAL_STEPS - 1; // 8 dots (exclude welcome)
  const buttonLabel = isLastStep ? "Done" : "Next";
  const onAction = isLastStep ? finish : next;

  const renderStep = () => {
    switch (step) {
      case 0:
        return <WelcomeStep onNext={next} />;
      case 1:
        return <AboutYouStep onNext={next} onBack={back} data={onboardingData} onChange={updateOnboardingData} />;
      case 2:
        return <PrioritiesStep onNext={next} onBack={back} data={onboardingData} onChange={updateOnboardingData} />;
      case 3:
        return <ContactsStep onNext={next} onBack={back} data={onboardingData} onChange={updateOnboardingData} />;
      case 4:
        return <TutorialAlwaysOn onNext={next} onBack={back} />;
      case 5:
        return <TutorialAINotes onNext={next} onBack={back} />;
      case 6:
        return <TutorialOrganize onNext={next} onBack={back} />;
      case 7:
        return <TutorialSwipe onNext={next} onBack={back} />;
      case 8:
        return <TutorialComplete onFinish={finish} onBack={back} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full w-full bg-[#FAFAF9] dark:bg-black overflow-hidden relative flex flex-col">
      {/* Scrollable step content */}
      <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="h-full w-full"
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer — fades in after welcome, absolute so it doesn't shift welcome layout */}
      <AnimatePresence>
        {!isWelcome && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute bottom-0 left-0 right-0 bg-[#FAFAF9] dark:bg-black"
          >
            <OnboardingFooter
              activeIndex={dotIndex}
              totalDots={totalDots}
              buttonLabel={buttonLabel}
              onAction={onAction}
              onBack={step > 0 ? back : undefined}
              onSkip={() => setShowSkipDialog(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip confirmation dialog */}
      <SkipDialog
        open={showSkipDialog}
        onContinue={() => setShowSkipDialog(false)}
        onSkip={() => {
          setShowSkipDialog(false);
          finish();
        }}
      />

      {/* Post-onboarding splash — navigate while still covering, then fade */}
      <SplashScreen
        visible={showSplash}
        message="Getting you set up"
        duration={2400}
        onDone={() => {}}
      />
    </div>
  );
}
