"use client";

import { CircleHelp, Music, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GameShell } from "@/components/game/game-shell";
import { NextPlayerButton } from "@/components/game/next-player";
import { Notice } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { entrance } from "@/lib/entrance";
import { instrumentInfo } from "../engine/instruments/index";
import { tracker } from "../engine/tracking/tracker";
import type { Story, StudioSession, View } from "../play/session";
import { AdaptiveButton } from "./adaptive-button";
import { CameraView } from "./camera-view";
import { DockActions, InstrumentSwitch, type DockPanel } from "./dock";
import { HowItWorksModal } from "./how-it-works";
import { CoachCallout, CoachPill, HandsPill, MachineReadout, MouseHints } from "./hud";
import { useCoarsePointer, useLive, useSettings, useStudio } from "./hooks";
import { CountIn, LessonPanel, LessonTip } from "./lesson-view";
import { LessonsView } from "./lessons-view";
import { PlayAlongModal } from "./play-along-modal";
import { ReachCard } from "./reach-card";
import { ResultView } from "./result-view";
import { SettingsModal } from "./settings-modal";
import { Stage } from "./stage";
import { TakeModal } from "./take-modal";
import { useCoach } from "./use-coach";

/** Reset for the next visitor after this long with no hand in view and no input. */
const IDLE_RESET_MS = 90_000;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** How much of the camera shows through: playing, people must see themselves clearly. */
const VIDEO_OPACITY: Record<View, number> = {
  play: 0.85,
  lesson: 0.72,
  lessons: 0.2,
  result: 0.2,
};

type Panel = DockPanel | "how" | null;

/** A full-screen layer over the stage (lessons, results), scrolling on its own. */
function Layer({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <motion.div
      role="region"
      aria-label={label}
      initial={entrance({ opacity: 0 })}
      animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE_OUT } }}
      exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
      className={cn("absolute inset-0 z-20 overflow-y-auto overscroll-contain bg-canvas/85", className)}
    >
      {/* Pinned under the floating header, so scrolled content fades out behind it instead of running into its text. */}
      <div aria-hidden className="sticky top-0 z-10 h-[calc(4rem+env(safe-area-inset-top))] bg-canvas shadow-[0_12px_12px_-4px_var(--color-canvas)]" />
      {children}
    </motion.div>
  );
}

/** Slides a dock group up into place the first time it appears. */
function DockSlot({ children }: { children: ReactNode }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } }}
      exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
      className="flex"
    >
      {children}
    </motion.div>
  );
}

/**
 * Everything after the intro: the full-bleed camera stage with the
 * instrument on it, a quiet HUD (which hands the camera sees, and one coach
 * line), and a dock that grows as the visitor plays. Lessons and results
 * slide over it. All of it belongs to one visitor and is dropped by Next player.
 */
export function StudioScreen({ session, onNextPlayer }: { session: StudioSession; onNextPlayer: () => void }) {
  const view = useStudio(session);
  const live = useLive(session);
  const leftHanded = useSettings((s) => s.tracking).leftHanded;
  const touch = useCoarsePointer();
  const coach = useCoach(session, { touch, leftHanded });
  const [panel, setPanel] = useState<Panel>(null);
  const [story, setStory] = useState<Story | null>(null);
  /** The take the visitor has already seen; a newer one opens its panel. */
  const [seenTake, setSeenTake] = useState(0);
  const playAreaRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nextPlayerRef = useRef(onNextPlayer);
  const simulated = view.mode === "mouse";
  const takeOpen = panel === "take" || (view.takeShown > seenTake && view.view === "play");
  const cameraStatus = view.mode === "camera" ? view.tracker.status : null;
  const cameraReady = view.mode !== "camera" || cameraStatus === "running";

  useEffect(() => {
    nextPlayerRef.current = onNextPlayer;
  });

  const openPanel = useCallback(
    (p: Panel) => {
      if (p === "how") setStory(session.story());
      setPanel(p);
    },
    [session],
  );

  const closePanel = useCallback(() => {
    setPanel(null);
    setSeenTake(session.getSnapshot().takeShown);
  }, [session]);

  // Each new view puts keyboard focus on its heading.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [view.view]);

  /* ── Booth: back to the intro after 90 s with no hand and no input ── */
  useEffect(() => {
    let last = performance.now();
    const onInput = () => {
      last = performance.now();
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    for (const name of events) window.addEventListener(name, onInput, { passive: true });
    const timer = window.setInterval(() => {
      const f = tracker.frame;
      if (f.hands.length && performance.now() - f.time < 1000 && !tracker.simulating) last = performance.now();
      if (performance.now() - last > IDLE_RESET_MS) nextPlayerRef.current();
    }, 3000);
    return () => {
      window.clearInterval(timer);
      for (const name of events) window.removeEventListener(name, onInput);
    };
  }, []);

  /* ── Keyboard: simulated hands, and R to record once Record is showing ── */
  const modalOpen = panel !== null || takeOpen;
  const canRecord = view.reveal >= 2;
  useEffect(() => {
    const playing = view.view === "play" || view.view === "lesson";
    const typing = (el: Element | null) => !!el?.closest("input, textarea, select, [contenteditable]");
    const onDown = (e: KeyboardEvent) => {
      if (!playing || modalOpen || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target instanceof Element ? e.target : null;
      if (typing(el) || el?.closest("[role=dialog]")) return;
      if (simulated && e.code === "Space") {
        // Space is the fist here, not a button press.
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
        tracker.simFist(true);
        return;
      }
      if (simulated && /^Digit[0-6]$/.test(e.code)) {
        tracker.simLeftSlot(Number(e.code.slice(5)));
        return;
      }
      if (e.key.toLowerCase() === "r" && !e.repeat && view.view === "play" && canRecord) {
        e.preventDefault();
        const s = session.getSnapshot().rec.state;
        if (s === "idle") void session.record();
        else if (s === "recording" || s === "waiting") void session.stopRecording();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (simulated && e.code === "Space") tracker.simFist(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      tracker.simFist(false);
    };
  }, [session, simulated, view.view, modalOpen, canRecord]);

  const playing = view.view === "play" || view.view === "lesson";
  const problem = view.problem;
  const reachOpen = view.reach.status !== "idle";
  const instrumentName = view.instrument ? instrumentInfo(view.instrument).name.toLowerCase() : null;

  return (
    <GameShell
      slug="air-studio"
      immersive
      sound
      actions={
        <>
          <AdaptiveButton icon={<CircleHelp />} label="How it works" popup onClick={() => openPanel("how")} />
          <NextPlayerButton onClick={onNextPlayer} />
        </>
      }
    >
      <div className="relative h-dvh w-full overflow-hidden">
        <Stage session={session} simulated={simulated} videoOpacity={cameraReady ? VIDEO_OPACITY[view.view] : 0.45} playArea={playAreaRef} />

        {/* Play and lessons: the instrument fills the free area between the HUD and the dock band. */}
        {playing ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-2 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(4.25rem+env(safe-area-inset-top))] sm:px-6 sm:pb-5">
            {view.view === "play" ? (
              <div className="flex flex-col gap-1">
                <h1 ref={headingRef} tabIndex={-1} className="sr-only">
                  {instrumentName ? `Playing the ${instrumentName}` : "Air Studio"}
                </h1>
                <div className="flex h-11 items-center justify-between gap-3">
                  <div className="min-w-0">{simulated ? <MouseHints recordKey={canRecord} /> : <HandsPill live={live} />}</div>
                  <MachineReadout mode={view.mode} live={live} />
                </div>
                <CoachPill line={coach} simulated={simulated} />
              </div>
            ) : (
              <LessonPanel session={session} view={view} headingRef={headingRef} />
            )}
            <div ref={playAreaRef} className="min-h-0 flex-1" />
            {/* A fixed band for the dock: the instrument above never moves when the dock grows. */}
            <div className="flex min-h-[7.5rem] flex-wrap content-end items-end justify-center gap-2 sm:min-h-[9rem] lg:min-h-[4.25rem]">
              {view.view === "play" ? (
                reachOpen ? (
                  <ReachCard reach={view.reach} onAgain={session.measureReach} onStandard={session.resetReach} onClose={session.closeReach} />
                ) : (
                  <AnimatePresence>
                    {view.reveal >= 1 ? (
                      <DockSlot key="instruments">
                        <InstrumentSwitch current={view.instrument} loading={view.loading} onPick={(id) => void session.pickInstrument(id)} />
                      </DockSlot>
                    ) : null}
                    {view.reveal >= 1 ? (
                      <DockSlot key="actions">
                        <DockActions session={session} view={view} onOpen={openPanel} onPractice={session.openLessons} />
                      </DockSlot>
                    ) : null}
                  </AnimatePresence>
                )
              ) : view.lesson ? (
                <LessonTip text={view.lesson.lesson.tip} />
              ) : null}
            </div>
          </div>
        ) : null}

        {view.view === "play" && cameraReady ? <CoachCallout line={coach} /> : null}

        {view.view === "lesson" || (view.view === "play" && view.rec.state === "waiting") ? <CountIn value={view.countIn} /> : null}

        {/* Camera: asking, starting the hand model, or what went wrong. The kit waits, dimmed, behind it. */}
        {view.mode === "camera" && !cameraReady ? (
          <div className="absolute inset-0 z-20 grid place-items-center px-4 pt-16">
            <CameraView state={view.tracker} onRetry={session.chooseCamera} onMouse={session.chooseMouse} />
          </div>
        ) : null}

        <AnimatePresence>
          {view.view === "lessons" ? (
            <Layer key="lessons" label="Practice">
              <LessonsView
                current={view.instrument}
                bests={view.bests}
                headingRef={headingRef}
                onStart={(id, level) => void session.startLesson(id, level)}
                onBack={session.leavePractice}
              />
            </Layer>
          ) : null}
          {view.view === "result" && view.result ? (
            <Layer key="result" label="Lesson result" className="bg-canvas">
              <ResultView
                result={view.result}
                story={view.result.story}
                headingRef={headingRef}
                onAgain={() => view.result && void session.startLesson(view.result.lesson.id, view.result.level)}
                onLessons={session.openLessons}
                onFreePlay={session.leavePractice}
              />
            </Layer>
          ) : null}
        </AnimatePresence>

        {/* A lesson's instrument loading, or a problem that stops play. */}
        {view.loading && (view.view === "lessons" || view.view === "lesson") ? (
          <div className="absolute inset-0 z-30 grid place-items-center bg-canvas/80 px-4">
            <Notice icon={<Music />} title={`Loading the ${instrumentInfo(view.loading.id).name.toLowerCase()}`}>
              <p className="tabular-nums">{Math.round(view.loading.progress * 100)}%</p>
            </Notice>
          </div>
        ) : null}
        {problem ? (
          <div className="absolute inset-0 z-30 grid place-items-center bg-canvas/90 px-4">
            {problem.kind === "audio" ? (
              <Notice
                icon={<TriangleAlert />}
                title="The sound didn't start"
                actions={
                  <Button variant="primary" size="lg" onClick={() => window.location.reload()}>
                    Reload the page
                  </Button>
                }
              >
                <p>This browser didn&apos;t let the page play sound. Reload the page and try again.</p>
              </Notice>
            ) : (
              <Notice
                icon={<TriangleAlert />}
                title={`The ${instrumentInfo(problem.id).name.toLowerCase()} didn't load`}
                actions={
                  <>
                    <Button variant="primary" size="lg" onClick={() => void session.pickInstrument(problem.id)}>
                      Try again
                    </Button>
                    <Button variant="ghost" size="lg" onClick={session.clearProblem}>
                      {view.instrument ? `Keep the ${instrumentInfo(view.instrument).name.toLowerCase()}` : "Close"}
                    </Button>
                  </>
                }
              >
                <p>Its recordings didn&apos;t download. Check the connection, then try again. The synth needs no download.</p>
              </Notice>
            )}
          </div>
        ) : null}
      </div>

      <PlayAlongModal session={session} view={view} open={panel === "play-along"} onOpenChange={(open) => (open ? openPanel("play-along") : closePanel())} />
      <TakeModal session={session} view={view} open={takeOpen} onOpenChange={(open) => (open ? openPanel("take") : closePanel())} />
      <SettingsModal
        open={panel === "settings"}
        onOpenChange={(open) => (open ? openPanel("settings") : closePanel())}
        instrument={view.instrument}
        mode={view.mode}
        canMeasure={view.tracker.status === "running"}
        recordKey={canRecord}
        onMeasure={session.measureReach}
      />
      {story ? <HowItWorksModal story={story} open={panel === "how"} onOpenChange={(open) => (open ? setPanel("how") : closePanel())} /> : null}
    </GameShell>
  );
}
