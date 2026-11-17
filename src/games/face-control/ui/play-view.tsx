"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { LEVEL_PHASES, resumeTargetFor } from "../play/machine";
import type { FaceControlSession, SessionView } from "../play/session";
import { FaceDock, KeysDock } from "./dock";
import { useCoarsePointer, useRunValues } from "./hooks";
import { Hud } from "./hud";
import { TouchControls } from "./touch-controls";
import { FaceLostPanel, LevelCompletePanel, LevelIntroPanel, PausedPanel, PracticePanel } from "./world-panels";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** 3, 2, 1, Go: big dot-matrix numerals on a dark disc, so they read on the light dawn sky too. */
function Countdown({ value }: { value: number | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <AnimatePresence mode="popLayout">
        {value !== null ? (
          <motion.div
            key={value}
            className="grid size-36 place-items-center rounded-full bg-canvas/90 shadow-ring sm:size-44"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.15, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } }}
          >
            <span className="type-score text-game">{value === 0 ? "Go" : value}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Brief, small messages: "Checkpoint", "2 lives left". */
function Toast({ toast, low }: { toast: SessionView["toast"]; low: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4",
        low ? "top-[calc(19rem+env(safe-area-inset-top))] sm:top-[calc(14rem+env(safe-area-inset-top))]" : "top-[calc(10.5rem+env(safe-area-inset-top))] sm:top-[calc(7.25rem+env(safe-area-inset-top))]",
      )}
    >
      <AnimatePresence>
        {toast ? (
          <motion.span
            key={toast.id}
            className="type-body rounded-full bg-canvas/90 px-4 py-2 font-semibold text-fg shadow-ring"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
          >
            {toast.text}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Everything over the full-bleed Phaser world: HUD chips, toasts, the
 * countdown, the camera dock (or keys, or touch buttons) and the panels.
 */
export function PlayView({ session, view }: { session: FaceControlSession; view: SessionView }) {
  const { machine } = view;
  const { phase } = machine;
  const run = useRunValues(session);
  const touch = useCoarsePointer();
  const face = machine.mode === "face" && machine.camera;
  const controlsVisible = phase === "practice" || phase === "playing" || phase === "countdown";

  return (
    <div className="fixed inset-0 z-10">
      {LEVEL_PHASES.includes(phase) ? <Hud run={run} /> : null}
      {phase === "practice" ? <PracticePanel session={session} machine={machine} touch={touch} /> : null}
      <Toast toast={view.toast} low={phase === "practice"} />
      <Countdown value={view.countdown} />

      {face ? (
        <FaceDock session={session} />
      ) : touch ? (
        controlsVisible ? <TouchControls session={session} /> : null
      ) : (
        <KeysDock session={session} canUseCamera={resumeTargetFor(phase) !== null} />
      )}

      <AnimatePresence mode="wait">
        {phase === "level-intro" && machine.levelReady ? (
          <LevelIntroPanel key="level-intro" session={session} machine={machine} run={run} bestTime={view.bestTimes[machine.levelIndex]} />
        ) : null}
        {phase === "paused" ? <PausedPanel key="paused" session={session} machine={machine} run={run} /> : null}
        {phase === "face-lost" ? <FaceLostPanel key="face-lost" session={session} /> : null}
        {phase === "level-complete" ? <LevelCompletePanel key="level-complete" session={session} machine={machine} /> : null}
      </AnimatePresence>
    </div>
  );
}
