"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SoundToggle } from "@/components/game/game-shell";
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
  const router = useRouter();

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
      );
    });
    return () => {
      cancelled = true;
      runtime?.dispose();
    };
  }, []);

  // Staff shortcut, unlisted like the rest of the arcade: B goes back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "b" || e.key === "B") router.push("/");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const cameraLive = status.camera === "ready" || status.camera === "loading-model";
  const hint = status.camera === "ready" && status.hand ? null : STATUS_TEXT[status.camera];

  return (
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

      {/* Top bar floats over the letterbox. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-3 sm:p-4">
        <Link
          href="/"
          className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-black/55 px-4 text-[0.9375rem] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <ArrowLeft className="size-[18px]" />
          Arcade
        </Link>
        <div className="pointer-events-auto rounded-full bg-black/55 text-white backdrop-blur-sm">
          <SoundToggle />
        </div>
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
