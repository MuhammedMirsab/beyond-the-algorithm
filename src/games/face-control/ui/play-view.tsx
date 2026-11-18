"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { LEVEL_PHASES, resumeTargetFor } from "../play/machine";
import type { FaceControlSession, SessionView } from "../play/session";
import { FaceDock, KeysDock } from "./dock";
import { useCoarsePointer, useRunValues, useWide } from "./hooks";
import { Hud } from "./hud";
import { TouchControls } from "./touch-controls";
import { FaceLostPanel, LevelCard, LevelCompletePanel, PausedPanel, PracticePanel } from "./world-panels";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** 2, 1, Go after a pause: big dot-matrix numerals on a dark disc, so they read on the light dawn sky too. */
function ResumeCountdown({ value }: { value: number | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <AnimatePresence mode="popLayout">
        {value !== null ? (
          <motion.div
            key={value}
            className="grid size-36 place-items-center rounded-full bg-canvas/90 shadow-ring sm:size-44"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1, transition: { type: "spring", duration: 0.35, bounce: 0.25 } }}
            exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } }}
          >
            <span className="type-score text-game">{value === 0 ? "Go" : value}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Brief, small messages under the status panel: "Checkpoint", "2 lives left". */
function Toast({ toast }: { toast: SessionView["toast"] }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-[calc(16rem+env(safe-area-inset-top))] z-20 flex justify-center px-4 lg:top-[calc(4.75rem+env(safe-area-inset-top))]"
    >
      <AnimatePresence>
        {toast ? (
          <motion.span
            key={toast.id}
            className="type-body rounded-full bg-canvas/90 px-4 py-2 font-semibold text-fg shadow-ring"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: EASE_OUT } }}
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
 * Everything over the full-bleed world. Top left: the status panel (or the
 * practice moves). Top right, in the sky: the camera dock (or the keys), so
 * the platforms coming up on the right are never hidden. Centre: the level
 * card, countdowns and panels.
 */
export function PlayView({ session, view }: { session: FaceControlSession; view: SessionView }) {
  const { machine } = view;
  const { phase } = machine;
  const run = useRunValues(session);
  const touch = useCoarsePointer();
  const wide = useWide();
  const face = machine.mode === "face" && machine.camera;
  const controlsVisible = phase === "practice" || phase === "playing" || phase === "countdown";
  const counting = view.countdown !== null;
  const cardCountdown = counting && view.countdownKind === "begin" ? view.countdown : null;
  const showCard = (phase === "level-intro" && machine.levelReady) || cardCountdown !== null;

  const dock = face ? (
    <FaceDock session={session} className={wide ? "w-[clamp(12.5rem,18vw,17rem)]" : "w-[min(42vw,10.5rem)]"} compact={!wide} />
  ) : !touch && wide ? (
    <KeysDock session={session} canUseCamera={resumeTargetFor(phase) !== null} />
  ) : null;

  return (
    <div className="fixed inset-0 z-10">
      <div className="pointer-events-none absolute inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] z-20 flex items-start justify-between gap-3 px-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 md:flex-none">
          {LEVEL_PHASES.includes(phase) ? <Hud session={session} run={run} /> : null}
          {phase === "practice" ? <PracticePanel session={session} machine={machine} touch={touch} /> : null}
        </div>
        {wide ? dock : null}
      </div>
      {/* Phones: bottom right, lifted clear of the touch buttons when they show. */}
      {!wide && dock ? <div className={cn("absolute right-3 z-20", !face && touch && controlsVisible ? "bottom-24" : "bottom-3")}>{dock}</div> : null}

      <Toast toast={view.toast} />
      <ResumeCountdown value={counting && view.countdownKind === "resume" ? view.countdown : null} />
      {!face && touch && controlsVisible ? <TouchControls session={session} /> : null}

      <AnimatePresence>
        {showCard ? (
          <LevelCard
            key={`card-${machine.levelIndex}`}
            session={session}
            machine={machine}
            run={run}
            bestTime={view.bestTimes[machine.levelIndex]}
            countdown={cardCountdown}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {phase === "paused" ? <PausedPanel key="paused" session={session} machine={machine} run={run} /> : null}
        {phase === "face-lost" ? <FaceLostPanel key="face-lost" session={session} /> : null}
        {phase === "level-complete" ? <LevelCompletePanel key="level-complete" session={session} machine={machine} /> : null}
      </AnimatePresence>
    </div>
  );
}
