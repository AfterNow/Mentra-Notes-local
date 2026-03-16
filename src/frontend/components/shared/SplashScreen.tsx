/**
 * SplashScreen - Dot-burst loading animation
 *
 * Concentric rings of evenly-spaced dots collapse inward toward the center
 * in a low-FPS stepped animation. Rings maintain their circular shape
 * but each ring has slightly different timing for organic feel.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SplashScreenProps {
  visible?: boolean;
  /** Text shown below the spinner */
  message?: string;
  /** Auto-dismiss after this many ms. If omitted, stays until `visible` becomes false. */
  duration?: number;
  /** Called when the splash finishes (either duration elapsed or visible set to false) */
  onDone?: () => void;
}

const CX = 50;
const CY = 50;
const FPS = 9;
const FRAME_MS = 1000 / FPS;

// Rings: evenly spaced dots in circles, each ring collapses inward
// { outerR: starting radius, count: dots in ring, dotR: dot size, speed: frames to collapse, phase: frame offset }
const RINGS = [
  { outerR: 38, count: 14, dotR: 3.0, speed: 10, phase: 0 },
  { outerR: 30, count: 12, dotR: 3.2, speed: 9, phase: 2 },
  { outerR: 22, count: 10, dotR: 3.4, speed: 8, phase: 4 },
  { outerR: 14, count: 8, dotR: 3.6, speed: 7, phase: 3 },
  { outerR: 7, count: 6, dotR: 3.8, speed: 6, phase: 1 },
];

// Center dot pulse
const CENTER_OPACITIES = [0.82, 0.88, 0.94, 1, 0.94, 0.88, 0.82, 0.76];

function DotBurstSpinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => f + 1), FRAME_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
      {RINGS.map((ring, ri) => {
        // How far through its collapse cycle is this ring? 0 = outer, 1 = center
        const t = ((frame + ring.phase) % ring.speed) / ring.speed;

        // Current radius — collapses from outerR to 0
        const currentR = ring.outerR * (1 - t);

        // Opacity: faint at edge, brighter toward center
        const opacity = 0.1 + t * 0.7;

        // Dot size grows slightly as it approaches center
        const dotR = ring.dotR * (0.7 + t * 0.3);

        return Array.from({ length: ring.count }).map((_, di) => {
          // Slight per-dot angle offset that shifts each frame for organic rotation
          const angleOffset = (ri % 2 === 0 ? 1 : -1) * frame * 0.04;
          const angle = (2 * Math.PI * di) / ring.count + angleOffset;
          const cx = CX + currentR * Math.cos(angle);
          const cy = CY + currentR * Math.sin(angle);

          return (
            <circle
              key={`${ri}-${di}`}
              cx={cx}
              cy={cy}
              r={dotR}
              fill="#D94F3B"
              opacity={opacity}
            />
          );
        });
      })}

      {/* Center dot — always present, pulses */}
      <circle
        cx={CX}
        cy={CY}
        r={4.5}
        fill="#D94F3B"
        opacity={CENTER_OPACITIES[frame % CENTER_OPACITIES.length]}
      />
    </svg>
  );
}

export function SplashScreen({
  visible = true,
  message = "Loading",
  duration,
  onDone,
}: SplashScreenProps) {
  const [show, setShow] = useState(visible);

  // Sync with external visible prop
  useEffect(() => {
    setShow(visible);
  }, [visible]);

  // Auto-dismiss after duration
  useEffect(() => {
    if (!visible || duration == null) return;
    const timer = setTimeout(() => setShow(false), duration);
    return () => clearTimeout(timer);
  }, [visible, duration]);

  return (
    <AnimatePresence onExitComplete={onDone}>
      {show && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white dark:bg-black"
        >
          <DotBurstSpinner />
          {message && (
            <div className="text-[14px] tracking-[0.06em] text-[#D94F3B80] font-['Red_Hat_Text',system-ui,sans-serif] font-medium leading-[18px]">
              {message}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
