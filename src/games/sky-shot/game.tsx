"use client";

import { useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/game/game-shell";
import { track } from "@/lib/play-tracker";
import { readJSON, storageKey, writeJSON } from "@/lib/storage";
import { cn } from "@/lib/cn";
import type { Runtime, RuntimeStatus } from "./engine/runtime";

const BEST_KEY = storageKey("sky-shot", "best");

const STATUS_TEXT: Record<RuntimeStatus["camera"], string> = {
  starting: "Starting the camera",
  "loading-model": "Loading hand tracking",
  ready: "Show one hand to the camera",
  "no-camera": "No camera: aim with the mouse, click to fire",
  "no-tracking": "Hand tracking could not start: use the mouse",
};

/**
 * Sky Shot: a pixel-art bird shooter played with a finger gun.
 * Point with the index finger, drop the thumb to fire.
 */
export function SkyShotGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<RuntimeStatus>({ camera: "starting", hand: false });

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
          onGameOver: (score, round) => track.end({ score, label: `out on round ${round}` }),
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
    <GameShell slug="sky-shot" immersive sound>
    <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-[#0d0c12] select-none">
      {/* 16:9 stage, as big as the screen allows. */}
      <div className="relative aspect-video w-full max-w-[calc(100dvh*16/9)]">
        <canvas
          ref={canvasRef}
          aria-label="Sky Shot game screen"
          className="absolute inset-0 size-full [image-rendering:pixelated]"
        />
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
    </GameShell>
  );
}
