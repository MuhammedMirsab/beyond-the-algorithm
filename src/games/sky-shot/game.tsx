"use client";

import { Camera, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameArt } from "@/components/art/game-art";
import { PRIVACY_LINE } from "@/components/game/camera-notice";
import { GameIntro } from "@/components/game/game-intro";
import { GameShell } from "@/components/game/game-shell";
import { NextPlayerButton } from "@/components/game/next-player";
import { cn } from "@/lib/cn";
import { useIdle } from "@/lib/idle";
import { track } from "@/lib/play-tracker";
import { readJSON, storageKey, writeJSON } from "@/lib/storage";
import type { Runtime, RunSummary, RuntimeStatus } from "./engine/runtime";
import { MAX_ROUNDS } from "./engine/world";
import { ResultsScreen } from "./ui/results-screen";

const BEST_KEY = storageKey("sky-shot", "best");

const STATUS_TEXT: Record<RuntimeStatus["camera"], string> = {
  starting: "Starting the camera",
  "loading-model": "Loading hand tracking",
  ready: "Show one hand to the camera",
  "no-camera": "No camera: aim with the mouse, click to fire",
  "no-tracking": "Hand tracking could not start: use the mouse",
};

const STEPS = [
  { title: "Make a finger gun", text: "Point your index finger at the screen, thumb up. A yellow dot shows where you aim." },
  { title: "Drop your thumb to fire", text: "Three shots for every two birds. Hit enough birds to clear the round." },
  { title: `${MAX_ROUNDS} rounds`, text: "The birds get faster in round 2. Then see your score and put your name on the board." },
];

type Screen = { kind: "intro" } | { kind: "play"; run: number } | { kind: "result"; run: RunSummary };

/** Where typing happens: Space is a letter there, not a shortcut. */
const TYPING = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/**
 * Sky Shot: a pixel-art bird shooter played with a finger gun.
 * Intro, then two rounds on the camera, then the results with the board.
 */
export function SkyShotGame() {
  const [screen, setScreen] = useState<Screen>({ kind: "intro" });
  const runs = useRef(0);

  const play = useCallback(() => {
    runs.current += 1;
    setScreen({ kind: "play", run: runs.current });
    window.scrollTo({ top: 0 });
  }, []);

  /** Next player: the camera goes off and the next visitor starts at the intro. */
  const nextPlayer = useCallback(() => {
    track.nextPlayer();
    setScreen({ kind: "intro" });
    window.scrollTo({ top: 0 });
  }, []);

  const finish = useCallback((run: RunSummary) => {
    track.end({ score: run.score, won: run.cleared, label: run.cleared ? "cleared both rounds" : `out on round ${run.round}` });
    setScreen({ kind: "result", run });
    window.scrollTo({ top: 0 });
  }, []);

  // Space starts from the intro and plays again from the results.
  useEffect(() => {
    if (screen.kind === "play") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest(TYPING)) return;
      e.preventDefault();
      play();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen.kind, play]);

  // An abandoned results screen resets for the next visitor.
  useIdle(nextPlayer, { enabled: screen.kind === "result" });

  return (
    <GameShell
      slug="sky-shot"
      immersive={screen.kind === "play"}
      sound
      actions={screen.kind === "play" ? <NextPlayerButton onClick={nextPlayer} /> : null}
    >
      {screen.kind === "intro" ? (
        <GameIntro
          slug="sky-shot"
          art={<GameArt slug="sky-shot" mode="intro" />}
          steps={STEPS}
          primary={{ label: "Turn on camera", icon: <Camera />, onClick: play }}
          footnote={
            <span className="flex items-start gap-1.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              {PRIVACY_LINE}
            </span>
          }
          keys={[{ keys: ["Space"], label: "Start" }]}
        />
      ) : screen.kind === "play" ? (
        <PlayView key={screen.run} onFinish={finish} />
      ) : (
        <ResultsScreen run={screen.run} onPlayAgain={play} onNextPlayer={nextPlayer} />
      )}
    </GameShell>
  );
}

/** The game itself: canvas, laser overlay and camera preview. Mounting it turns the camera on; unmounting turns it off. */
function PlayView({ onFinish }: { onFinish: (run: RunSummary) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<RuntimeStatus>({ camera: "starting", hand: false });
  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !overlay || !video) return;
    let runtime: Runtime | null = null;
    let cancelled = false;
    // The engine touches canvas, camera and Web Audio: load it on the client only.
    void import("./engine/runtime").then(({ Runtime }) => {
      if (cancelled) return;
      runtime = new Runtime(
        canvas,
        overlay,
        video,
        setStatus,
        () => readJSON<number>(BEST_KEY, 0),
        (n) => writeJSON(BEST_KEY, n),
        {
          onStart: () => track.start(runtime?.inputMode() ?? "hand"),
          onRound: (round) => track.step("round", round),
          onGameOver: (run) => finishRef.current(run),
        },
      );
    });
    return () => {
      cancelled = true;
      runtime?.dispose();
    };
  }, []);

  const cameraLive = status.camera === "ready" || status.camera === "loading-model";
  const hint = status.camera === "ready" && status.hand ? null : STATUS_TEXT[status.camera];

  return (
    <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-[#0d0c12] select-none">
      {/* 16:9 stage, as big as the screen allows. */}
      <div className="relative aspect-video w-full max-w-[calc(100dvh*16/9)]">
        <canvas ref={canvasRef} aria-label="Sky Shot game screen" className="absolute inset-0 size-full [image-rendering:pixelated]" />
        <canvas ref={overlayRef} className="absolute inset-0 size-full cursor-none touch-none" />
      </div>

      {/* Camera preview: the player sees that the game sees their hand. */}
      <div
        className={cn(
          "pointer-events-none absolute right-3 bottom-3 w-[clamp(120px,14vw,220px)] overflow-hidden rounded-lg border-2 bg-black transition-colors sm:right-4 sm:bottom-4",
          status.hand ? "border-[#ffd60a]" : "border-white/25",
          !cameraLive && "hidden",
        )}
      >
        <video ref={videoRef} muted playsInline className="block aspect-[4/3] w-full -scale-x-100 object-cover" />
      </div>

      {hint ? (
        <div
          role="status"
          className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-center text-[0.9375rem] font-semibold text-white"
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}
