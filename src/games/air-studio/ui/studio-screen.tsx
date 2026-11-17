"use client";

import { CircleHelp, Music, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GameShell } from "@/components/game/game-shell";
import { NextPlayerButton } from "@/components/game/next-player";
import { Notice } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { entrance } from "@/lib/entrance";
import { instrumentInfo } from "../engine/instruments/index";
import { tracker } from "../engine/tracking/tracker";
import type { Story, StudioSession, View } from "../play/session";
import { AdaptiveButton } from "./adaptive-button";
import { CameraView } from "./camera-view";
import { Dock, type DockPanel } from "./dock";
import { HandCheckView } from "./hand-check-view";
import { HowItWorksModal } from "./how-it-works";
import { HandStatus, HowToPlay, MachineReadout, MouseKeys, Readout, stageWarning, Warning } from "./hud";
import { useLive, useSettings, useStudio } from "./hooks";
import { InstrumentCards } from "./instrument-picker";
import { InstrumentOptionsModal } from "./instrument-options";
import { CountIn, LessonPanel, LessonTip } from "./lesson-view";
import { LessonsView } from "./lessons-view";
import { PlayAlongModal } from "./play-along-modal";
import { ResultView } from "./result-view";
import { SettingsModal } from "./settings-modal";
import { Stage } from "./stage";
import { TakeModal } from "./take-modal";

/** Reset for the next visitor after this long with no hand in view and no input. */
const IDLE_RESET_MS = 90_000;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** How much of the camera shows through on each view. */
const VIDEO_OPACITY: Record<View, number> = {
  camera: 0.35,
  check: 0.85,
  pick: 0.3,
  play: 0.55,
  lessons: 0.2,
  lesson: 0.55,
  result: 0.2,
};

type Panel = DockPanel | "how" | null;

/** A full-screen layer over the stage (picker, lessons, results), scrolling on its own. */
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

/**
 * Everything after the intro: the full-bleed camera stage, and over it the
 * camera notices, the hand check, the instrument picker, the play HUD and
 * dock, the lessons and the results. All of it belongs to one visitor and is
 * dropped by Next player.
 */
export function StudioScreen({ session, onNextPlayer }: { session: StudioSession; onNextPlayer: () => void }) {
  const view = useStudio(session);
  const live = useLive(session);
  const leftHanded = useSettings((s) => s.tracking).leftHanded;
  const [panel, setPanel] = useState<Panel>(null);
  const [story, setStory] = useState<Story | null>(null);
  /** The take the visitor has already seen; a newer one opens its panel. */
  const [seenTake, setSeenTake] = useState(0);
  const playAreaRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nextPlayerRef = useRef(onNextPlayer);
  const simulated = view.mode === "mouse";
  const takeOpen = panel === "take" || (view.takeShown > seenTake && view.view === "play");

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

  // Each new view puts keyboard focus on its heading (views without one keep it where it is).
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

  /* ── Keyboard: simulated hands, and R to record ───────────────── */
  const modalOpen = panel !== null || takeOpen;
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
      if (e.key.toLowerCase() === "r" && !e.repeat && view.view === "play") {
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
  }, [session, simulated, view.view, modalOpen]);

  const warning = view.view === "play" ? stageWarning(view.mode, live) : null;
  const playing = view.view === "play" || view.view === "lesson";
  const problem = view.problem;

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
        <Stage session={session} simulated={simulated} videoOpacity={VIDEO_OPACITY[view.view]} playArea={playAreaRef} />

        {/* Play and lessons: the instrument fills the free area between the top panel and the dock. */}
        {playing ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-3 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(4.5rem+env(safe-area-inset-top))] sm:px-6 sm:pb-6">
            {view.view === "play" ? (
              <div className="flex flex-col gap-2">
                {/* Phones: status on the first line, the note readout centred on its own line below. */}
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <div className="min-w-0 justify-self-start">{simulated ? <MouseKeys /> : <HandStatus live={live} />}</div>
                  <div className="order-last w-full md:order-none md:w-auto">
                    <Readout text={live.readout} />
                  </div>
                  <div className="justify-self-end">
                    <MachineReadout mode={view.mode} live={live} />
                  </div>
                </div>
                <div className="flex h-9 justify-center">
                  {warning ? (
                    <Warning warning={warning} />
                  ) : view.instrument ? (
                    <div className="flex h-9 max-w-full items-center rounded-full bg-canvas/80 px-4 shadow-ring">
                      <HowToPlay instrument={view.instrument} leftHanded={leftHanded} simulated={simulated} />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <LessonPanel session={session} view={view} headingRef={headingRef} />
            )}
            <div ref={playAreaRef} className="min-h-0 flex-1" />
            <div className="flex justify-center">
              {view.view === "play" ? (
                <Dock session={session} view={view} onOpen={openPanel} onPractice={session.openLessons} />
              ) : view.lesson ? (
                <LessonTip text={view.lesson.lesson.tip} />
              ) : null}
            </div>
          </div>
        ) : null}

        {view.view === "lesson" || (view.view === "play" && view.rec.state === "waiting") ? <CountIn value={view.countIn} /> : null}

        {/* Camera: asking, loading, or what went wrong. */}
        {view.view === "camera" ? (
          <div className="absolute inset-0 z-20 grid place-items-center bg-canvas/70 px-4 pt-16">
            <CameraView state={view.tracker} onRetry={session.chooseCamera} onMouse={session.chooseMouse} />
          </div>
        ) : null}

        {/* The quick hand check. */}
        {view.view === "check" ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-8">
            <HandCheckView view={view} live={live} headingRef={headingRef} onMeasure={session.measureReach} onDone={session.finishCheck} />
          </div>
        ) : null}

        <AnimatePresence>
          {view.view === "pick" ? (
            <Layer key="pick" label="Choose an instrument">
              <div className="mx-auto flex w-full max-w-[69rem] flex-col gap-8 px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-10">
                <div className="flex flex-col gap-3">
                  <span className="type-label text-game">{simulated ? "Mouse play" : "Camera on"}</span>
                  <h1 ref={headingRef} tabIndex={-1} className="type-title-1 text-fg outline-none">
                    Choose an instrument
                  </h1>
                  <p className="type-body-lg max-w-[36rem] text-fg-muted">You can switch at any time from the bar at the bottom.</p>
                </div>
                <InstrumentCards current={view.instrument} loading={view.loading} onPick={(id) => void session.pickInstrument(id)} />
              </div>
            </Layer>
          ) : null}
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
                      Choose another
                    </Button>
                  </>
                }
              >
                <p>Its recordings didn&apos;t download. Check the connection, then try again. The drums, percussion and synth need no download.</p>
              </Notice>
            )}
          </div>
        ) : null}
      </div>

      <Modal open={panel === "instrument"} onOpenChange={(open) => (open ? openPanel("instrument") : closePanel())} title="Choose an instrument" size="lg">
        <InstrumentCards
          current={view.instrument}
          loading={view.loading}
          onPick={(id) => {
            if (id === view.instrument) {
              closePanel();
              return;
            }
            void session.pickInstrument(id).then((ok) => {
              if (ok) closePanel();
            });
          }}
          className="lg:grid-cols-3"
        />
      </Modal>
      <InstrumentOptionsModal instrument={view.instrument} open={panel === "options"} onOpenChange={(open) => (open ? openPanel("options") : closePanel())} />
      <PlayAlongModal session={session} view={view} open={panel === "play-along"} onOpenChange={(open) => (open ? openPanel("play-along") : closePanel())} />
      <TakeModal session={session} view={view} open={takeOpen} onOpenChange={(open) => (open ? openPanel("take") : closePanel())} />
      <SettingsModal open={panel === "settings"} onOpenChange={(open) => (open ? openPanel("settings") : closePanel())} />
      {story ? <HowItWorksModal story={story} open={panel === "how"} onOpenChange={(open) => (open ? setPanel("how") : closePanel())} /> : null}
    </GameShell>
  );
}
