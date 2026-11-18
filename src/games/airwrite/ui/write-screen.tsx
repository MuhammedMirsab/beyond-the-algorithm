"use client";

import { AnimatePresence, motion } from "motion/react";
import { Camera, CircleHelp, MousePointer2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CameraProblem, CameraWaiting, ModelLoading } from "@/components/game/camera-notice";
import { GameShell } from "@/components/game/game-shell";
import { NextPlayerButton } from "@/components/game/next-player";
import { Button } from "@/components/ui/button";
import { DEFAULT_SETTINGS, pinchThresholds, type PenSettings } from "../engine/airPen";
import { cssColor } from "../engine/canvasColor";
import { exportInk } from "../engine/exportImage";
import { letterAnatomy, segmentLetters } from "../engine/letters";
import { recognizeStrokes } from "../engine/recognition/recognize";
import { StrokeStore } from "../engine/strokes";
import { useHandTracking } from "../engine/useHandTracking";
import { forTheScreen } from "../engine/words";
import { AdaptiveButton } from "./adaptive-button";
import { CameraDock } from "./camera-dock";
import { HowItWorksModal, type ReadingStory } from "./how-it-works";
import { ResultPanel, type ReadPhase, type ReadRequest } from "./result-panel";
import { SettingsModal } from "./settings-modal";
import { CentringCountdown, Delayed, EmptyState, FIRST_WORD, TargetPill, type Target } from "./stage-overlays";
import { StatusChip } from "./status-chip";
import { Toast, type ToastMessage } from "./toast";
import { Toolbar } from "./toolbar";
import { WritingSurface } from "./writing-surface";
import { cn } from "@/lib/cn";

export type InputMode = "camera" | "pointer";

/** Reset for the next visitor after this long with no hand and no input. */
const IDLE_RESET_MS = 90_000;
const COUNTDOWN_FROM = 3;
const COUNTDOWN_STEP_MS = 900;
const TOAST_MS = 1900;
/** Reading takes a few milliseconds; hold the reading state this long so the split into letters can be seen. */
const READ_HOLD_MS = 900;

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Just under the floating header, clear of the notch. */
const BELOW_HEADER = "top-[calc(4.5rem+env(safe-area-inset-top))]";
/**
 * The writing board: everything between the status row and the toolbar, so
 * no ink ever lands under a control. On laptops, with the camera on, the
 * camera gets its own column on the left and the board starts after it.
 */
const BOARD = "absolute inset-x-3 top-[calc(7.5rem+env(safe-area-inset-top))] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:inset-x-6 lg:right-8 lg:left-8 lg:top-[7.75rem] lg:bottom-[7.25rem]";
const BOARD_BESIDE_DOCK = "lg:left-[18.5rem]";
/** Camera dock: top-left under the header on phones and tablets; its own column beside the board on laptops. */
const DOCK_SPOT = cn("absolute left-4 z-20 sm:left-6 lg:left-8 lg:top-[7.75rem]", BELOW_HEADER);
/** The camera switch when the camera is off: in the status row, left. */
const CAMERA_SWITCH = cn("absolute left-4 z-20 sm:left-6 lg:left-8", BELOW_HEADER);

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}

/**
 * The writing screen: a full-bleed writing area, the camera dock, the status
 * chip, the toolbar, and the result panel. Everything here belongs to one
 * visitor and is dropped when the screen unmounts (Next player, idle reset).
 */
export function WriteScreen({ initialMode, onNextPlayer }: { initialMode: InputMode; onNextPlayer: () => void }) {
  const [store] = useState(() => new StrokeStore());
  const [settings, setSettings] = useState<PenSettings>(DEFAULT_SETTINGS);
  // Every visitor starts with one small, concrete task; the chips offer other words.
  const [target, setTarget] = useState<Target | null>({ word: FIRST_WORD, chosen: false });
  const [phase, setPhase] = useState<ReadPhase | null>(null);
  const [story, setStory] = useState<(ReadingStory & { usedCamera: boolean; fps: number | null }) | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [how, setHow] = useState<{ open: boolean; fps: number | null }>({ open: false, fps: null });
  const [countdown, setCountdown] = useState<number | null>(null);
  const [ink, setInk] = useState({ canUndo: false, empty: true });
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [shake, setShake] = useState(0);
  const [dockSmall, setDockSmall] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 1, height: 1 });
  const readButtonRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const readCount = useRef(0);
  const resultCount = useRef(0);
  const lastActivity = useRef(0);
  const nextPlayerRef = useRef(onNextPlayer);

  const paused = settingsOpen || how.open;
  const tracking = useHandTracking({
    store,
    settings,
    enabled: !phase && !paused && countdown === null,
    initialOn: initialMode === "camera",
    videoRef,
    previewRef,
    surfaceSize: sizeRef,
  });
  const { frameRef, statsRef, fingertip, start: startCamera, stop: stopCamera } = tracking;
  const status = tracking.status;
  const cameraOn = tracking.on;
  const ready = cameraOn && status.phase === "ready";
  const live = cameraOn && (status.phase === "loading" || status.phase === "ready");

  useEffect(() => {
    nextPlayerRef.current = onNextPlayer;
  });

  const touch = useCallback(() => {
    lastActivity.current = performance.now();
  }, []);

  useEffect(
    () =>
      store.subscribe(() => {
        setInk({ canUndo: store.canUndo, empty: store.isEmpty });
        touch();
      }),
    [store, touch],
  );

  /* ── Toast ─────────────────────────────────────────────────────── */
  const showToast = useCallback((text: string, tone: ToastMessage["tone"] = "info") => {
    setToast({ id: performance.now(), text, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* ── Reading (on this device) ──────────────────────────────────── */
  const read = useCallback(async (request: Omit<ReadRequest, "id">) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    readCount.current += 1;
    const req: ReadRequest = { ...request, id: readCount.current };
    // Reading takes milliseconds, so it happens first; the hold that follows
    // shows the ink being split into letters before the answer appears.
    let story: ReadingStory;
    try {
      const { result, hidden } = forTheScreen(recognizeStrokes(req.strokes));
      const readable = result.kind === "text" && !hidden;
      const { boxes, words } = segmentLetters(req.strokes, readable ? result.text : null, req.ink);
      story = {
        ink: req.ink,
        result,
        hidden,
        boxes,
        words,
        strokes: req.strokes,
        anatomy: readable ? letterAnatomy(req.strokes, result.text) : null,
      };
    } catch (error) {
      console.error("[airwrite] recognition failed", error);
      setPhase({ kind: "error", ...req });
      return;
    }
    setPhase({ kind: "reading", boxes: story.boxes.map((b) => ({ ...b, char: null })), ...req });
    await new Promise((resolve) => window.setTimeout(resolve, READ_HOLD_MS));
    if (controller.signal.aborted) return;
    const first = resultCount.current === 0;
    resultCount.current += 1;
    setStory({ ...story, usedCamera: req.usedCamera, fps: req.fps });
    setPhase({ kind: "result", story, first, ...req });
  }, []);

  const onRead = useCallback(() => {
    if (phase || countdown !== null) return;
    touch();
    if (store.current) store.end();
    const surface = sizeRef.current;
    // The picture shows the ink as it looked on screen: fg on the dark machine-view panel.
    const image = exportInk(store.strokes, surface, cssColor(document.documentElement, "--color-fg", "#f7f8fa"));
    if (!image) {
      setShake((n) => n + 1);
      showToast("Write something first");
      return;
    }
    // The recogniser wants points in one consistent unit with equal x and y scale: surface pixels.
    const strokes = store.strokes.map((s) => s.points.map((p): [number, number] => [p.x * surface.width, p.y * surface.height]));
    const usedCamera = store.strokes.some((s) => s.source === "air");
    void read({
      ink: image,
      strokes,
      target: target?.word ?? null,
      targetChosen: target?.chosen ?? false,
      usedCamera,
      fps: usedCamera && statsRef.current.fps ? statsRef.current.fps : null,
    });
  }, [phase, countdown, touch, store, showToast, read, target, statsRef]);

  const closePanel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase(null);
    // Give keyboard focus back to the main action once the panel has gone.
    window.requestAnimationFrame(() => readButtonRef.current?.focus({ preventScroll: true }));
  }, []);

  const onTryAgain = useCallback(() => {
    closePanel();
    store.clear();
  }, [closePanel, store]);

  const onRetry = useCallback(() => {
    if (phase?.kind !== "error") return;
    const { ink: image, strokes, target: word, targetChosen, usedCamera, fps } = phase;
    void read({ ink: image, strokes, target: word, targetChosen, usedCamera, fps });
  }, [phase, read]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /* ── Centring countdown ────────────────────────────────────────── */
  const startCentring = useCallback(() => {
    setSettingsOpen(false);
    setCountdown(COUNTDOWN_FROM);
  }, []);

  useEffect(() => {
    if (countdown === null) return;
    const timer = window.setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1);
        return;
      }
      const tip = fingertip();
      if (tip) {
        setSettings((s) => ({ ...s, center: tip }));
        showToast("Writing area centred", "success");
      } else {
        showToast("No hand found. Try again.");
      }
      setCountdown(null);
    }, COUNTDOWN_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [countdown, fingertip, showToast]);

  /* ── Keyboard ──────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || paused) return;
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      if (countdown !== null) {
        if (e.key === "Escape") setCountdown(null);
        return;
      }
      if (phase) {
        if (e.key === "Escape") closePanel();
        return;
      }
      if (e.altKey || e.metaKey || (e.ctrlKey && e.key.toLowerCase() !== "z")) return;
      const onControl = !!el?.closest("button, a, [role=button]");
      const key = e.key.toLowerCase();
      if ((e.key === "Enter" || e.key === " ") && !onControl) {
        e.preventDefault();
        onRead();
      } else if (key === "z") {
        e.preventDefault();
        store.undo();
      } else if (key === "c" || e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        store.clear();
      } else if (key === "f") {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, countdown, phase, closePanel, onRead, store]);

  /* ── Booth: reset for the next visitor after 90 s with no hand and no input ── */
  useEffect(() => {
    lastActivity.current = performance.now();
    const onInput = () => {
      lastActivity.current = performance.now();
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    for (const name of events) window.addEventListener(name, onInput, { passive: true });
    const timer = window.setInterval(() => {
      if (frameRef.current?.handVisible) lastActivity.current = performance.now();
      if (performance.now() - lastActivity.current > IDLE_RESET_MS) nextPlayerRef.current();
    }, 3000);
    return () => {
      window.clearInterval(timer);
      for (const name of events) window.removeEventListener(name, onInput);
    };
  }, [frameRef]);

  /* ── What sits in the middle of the writing area ───────────────── */
  let centre: { key: string; node: ReactNode; interactive: boolean } | null = null;
  if (cameraOn && status.phase === "waiting") {
    centre = {
      key: "waiting",
      node: (
        <Delayed>
          <CameraWaiting />
        </Delayed>
      ),
      interactive: false,
    };
  } else if (cameraOn && status.phase === "loading") {
    centre = {
      key: "loading",
      node: (
        <Delayed>
          <ModelLoading label="Loading hand tracking" detail="21-point hand model" progress={status.progress} />
        </Delayed>
      ),
      interactive: false,
    };
  } else if (cameraOn && status.phase === "error") {
    centre = {
      key: `error-${status.issue}`,
      node: (
        <CameraProblem
          issue={status.issue}
          onRetry={startCamera}
          alternative={
            <Button variant="ghost" size="lg" icon={<MousePointer2 />} onClick={stopCamera}>
              Write with mouse or touch
            </Button>
          }
        />
      ),
      interactive: true,
    };
  } else if (ink.empty) {
    centre = {
      key: ready ? "empty-camera" : "empty-pointer",
      node: <EmptyState camera={ready} handVisible={tracking.indicator.handVisible} target={target} onTarget={setTarget} />,
      interactive: false,
    };
  }

  const panelOpen = phase !== null;

  return (
    <GameShell
      slug="airwrite"
      immersive
      actions={
        <>
          <AdaptiveButton
            icon={<CircleHelp />}
            label="How it works"
            onClick={() => setHow({ open: true, fps: cameraOn && statsRef.current.fps ? statsRef.current.fps : null })}
          />
          <NextPlayerButton onClick={onNextPlayer} />
        </>
      }
    >
      <div className="relative flex-1 overflow-hidden" onPointerDown={touch}>
        <div className={cn(BOARD, live && BOARD_BESIDE_DOCK, "overflow-hidden rounded-xl bg-sunken shadow-ring")}>
          <WritingSurface
            store={store}
            frameRef={frameRef}
            sizeRef={sizeRef}
            pointerEnabled={!panelOpen && countdown === null}
            onActivity={touch}
          />
        </div>

        {/* Everything under the result panel and the countdown goes inert while they are open. */}
        <div inert={panelOpen || countdown !== null} className="contents">
          <div
            className={cn(
              centre?.interactive ? "absolute inset-0 z-10 bg-canvas/80 pt-16" : cn(BOARD, live && BOARD_BESIDE_DOCK, "z-10"),
              "grid place-items-center px-4 sm:px-6",
              centre?.interactive ? "pointer-events-auto" : "pointer-events-none",
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              {centre ? (
                <motion.div
                  key={centre.key}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } }}
                  exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
                  className="flex w-full justify-center"
                >
                  {centre.node}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 z-20 flex flex-col items-end gap-2 px-4 sm:px-6 md:flex-row md:items-center md:justify-center lg:right-8 lg:px-0",
              live ? "lg:left-[18.5rem]" : "lg:left-8",
              BELOW_HEADER,
            )}
          >
            {ready && countdown === null ? <StatusChip indicator={tracking.indicator} /> : null}
            {target && !ink.empty ? <TargetPill target={target.word} onClear={() => setTarget(null)} /> : null}
          </div>

          {/* Mounted always (the video element must exist before the camera starts); shown while the camera is live. */}
          <div className={cn(DOCK_SPOT, !live && "hidden")}>
            <CameraDock
              videoRef={videoRef}
              previewRef={previewRef}
              frameRef={frameRef}
              pinchEnter={pinchThresholds(settings.pinch).enter}
              status={status}
              indicator={tracking.indicator}
              small={dockSmall}
              onToggleSmall={() => setDockSmall((s) => !s)}
            />
          </div>
          {!cameraOn ? (
            <div className={CAMERA_SWITCH}>
              <AdaptiveButton icon={<Camera />} label="Turn on camera" variant="secondary" onClick={startCamera} />
            </div>
          ) : null}

          <div
            className={cn(
              "absolute inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 flex justify-center sm:inset-x-6 lg:bottom-6 lg:right-8",
              live ? "lg:left-[18.5rem]" : "lg:left-8",
            )}
          >
            <Toolbar
              canUndo={ink.canUndo}
              canClear={!ink.empty}
              shake={shake}
              readRef={readButtonRef}
              onUndo={() => store.undo()}
              onClear={() => store.clear()}
              onSettings={() => setSettingsOpen(true)}
              onRead={onRead}
            />
          </div>
        </div>

        <Toast toast={toast} className="absolute inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[26] lg:bottom-[8.25rem]" />

        <AnimatePresence>
          {countdown !== null ? (
            <motion.div
              key="countdown"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } }}
              exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
              className="absolute inset-0 z-[25]"
            >
              <CentringCountdown count={countdown} onCancel={() => setCountdown(null)} className="size-full" />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {phase ? (
            <ResultPanel
              key="result"
              phase={phase}
              onTryAgain={onTryAgain}
              onKeepWriting={closePanel}
              onRetry={onRetry}
              className="absolute inset-0 z-[25]"
            />
          ) : null}
        </AnimatePresence>
      </div>

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSettings={setSettings}
        cameraReady={ready}
        readStats={() => statsRef.current}
        onCentre={startCentring}
      />
      <HowItWorksModal
        open={how.open}
        onOpenChange={(open) => setHow((h) => ({ ...h, open }))}
        story={story}
        fps={story ? story.fps : how.fps}
        usedCamera={story ? story.usedCamera : cameraOn}
      />
    </GameShell>
  );
}
