"use client";

import { Hand, Move, ScanSearch, Sun, Wand } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ModelLoading } from "@/components/game/camera-notice";
import { cn } from "@/lib/cn";
import type { CVFrameResult, DetectedGesture, FrameQualityIssue, HandLandmark } from "../engine/types";
import type { HandTracker, ModelStatus } from "../vision/handTracker";
import { HINT_COPY, HintWindow } from "../vision/hints";
import { GESTURE_LABEL, GestureIcon } from "./gesture-icon";

/** MediaPipe's 21 hand points, joined into fingers. */
const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
const FINGERTIPS = new Set([4, 8, 12, 16, 20]);

/** The rock-paper-scissors yellow, for canvases that can't read oklch(). */
const GAME_HEX_FALLBACK = "#f9db38";

interface Readout {
  gesture: DetectedGesture;
  /** 0-100, in steps of 5 so the chip doesn't flicker. */
  confidence: number;
  hint: FrameQualityIssue | null;
}

const EMPTY_READOUT: Readout = { gesture: "none", confidence: 0, hint: null };

/** The game colour as the canvas understands it. */
function skeletonColor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): string {
  const css = getComputedStyle(canvas).getPropertyValue("--game").trim();
  if (!css) return GAME_HEX_FALLBACK;
  ctx.fillStyle = "#000000";
  ctx.fillStyle = css;
  // Browsers ignore colours they can't parse, leaving the previous value.
  return ctx.fillStyle === "#000000" ? GAME_HEX_FALLBACK : css;
}

function drawHand(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number } | null,
  landmarks: HandLandmark[] | null,
  color: string,
): void {
  if (size && (canvas.width !== size.width || canvas.height !== size.height)) {
    canvas.width = size.width;
    canvas.height = size.height;
  }
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!landmarks || landmarks.length < 21) return;

  // Raw camera coordinates: the canvas is mirrored with CSS together with the video.
  const line = Math.max(2, w / 170);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
    ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
  }
  // A dark under-stroke keeps the yellow readable against bright rooms.
  ctx.lineWidth = line * 2.2;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.stroke();
  ctx.lineWidth = line;
  ctx.strokeStyle = color;
  ctx.stroke();

  for (let i = 0; i < landmarks.length; i++) {
    const pt = landmarks[i];
    const r = (FINGERTIPS.has(i) ? 2.4 : 1.6) * line;
    ctx.beginPath();
    ctx.arc(pt.x * w, pt.y * h, r, 0, Math.PI * 2);
    ctx.fillStyle = FINGERTIPS.has(i) ? "#ffffff" : color;
    ctx.fill();
    ctx.lineWidth = Math.max(1, line * 0.45);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
    ctx.stroke();
  }
}

const HINT_ICON: Record<FrameQualityIssue, ReactNode> = {
  low_light: <Sun />,
  multiple_hands: <Hand />,
  too_close: <Move />,
  too_far: <Move />,
  edge_clipped: <ScanSearch />,
  low_confidence: <Wand />,
  motion_blur: <Hand />,
  no_hand: <Hand />,
};

/**
 * The visitor's camera, mirrored like a selfie, with the 21 hand points the
 * model found drawn on top. A chip says what it reads and how sure it is; a
 * hint appears only for a problem that lasts.
 */
export function CameraView({
  tracker,
  model,
  throwing,
  className,
}: {
  tracker: HandTracker;
  model: ModelStatus;
  /** A throw is expected now (countdown or Shoot): also hint about a missing or unclear hand. */
  throwing: boolean;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const throwingRef = useRef(throwing);
  const [readout, setReadout] = useState<Readout>(EMPTY_READOUT);

  useEffect(() => {
    throwingRef.current = throwing;
  });

  // Borrow the game's one <video> while this view is on screen.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    return tracker.attachView(host);
  }, [tracker]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const color = skeletonColor(canvas, ctx);
    const hints = new HintWindow();
    const unsubscribe = tracker.onFrame((frame: CVFrameResult) => {
      drawHand(canvas, ctx, tracker.getVideoSize(), frame.landmarks, color);
      hints.push(frame.qualityIssues);
      const next: Readout = {
        gesture: frame.handCount > 0 ? frame.gesture : "none",
        confidence: Math.round((frame.confidence * 100) / 5) * 5,
        hint: hints.pick(throwingRef.current),
      };
      setReadout((prev) =>
        prev.gesture === next.gesture && prev.confidence === next.confidence && prev.hint === next.hint ? prev : next,
      );
    });
    return () => {
      unsubscribe();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [tracker]);

  const loading = model === "loading" || model === "idle";
  const gesture = readout.gesture;
  const known = gesture === "rock" || gesture === "paper" || gesture === "scissors";

  return (
    <figure className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-sunken shadow-ring">
        {/* Video and skeleton are mirrored together, like a mirror. */}
        <div className="absolute inset-0 -scale-x-100">
          <div ref={hostRef} className="absolute inset-0" />
          <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full object-cover" />
        </div>

        {!loading ? (
          <div className="absolute left-3 top-3 sm:left-4 sm:top-4">
            <span
              className={cn(
                "type-label inline-flex h-8 items-center gap-2 rounded-full bg-black/75 pl-2.5 pr-3 text-white tabular-nums",
                "[&_svg]:size-4",
              )}
            >
              {known ? (
                <>
                  <GestureIcon gesture={gesture} className="text-game" />
                  {GESTURE_LABEL[gesture]} {readout.confidence}%
                </>
              ) : gesture === "uncertain" ? (
                <>
                  <span aria-hidden className="size-2 rounded-full bg-white/60" />
                  Not sure {readout.confidence}%
                </>
              ) : (
                <>
                  <span aria-hidden className="size-2 rounded-full bg-white/40" />
                  No hand
                </>
              )}
            </span>
          </div>
        ) : null}

        {!loading && readout.hint ? (
          <div className="absolute inset-x-3 bottom-3 flex justify-center sm:inset-x-4 sm:bottom-4">
            <p className="type-small inline-flex min-h-10 items-center gap-2 rounded-lg bg-black/75 px-4 py-2 font-semibold text-white [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-warning">
              {HINT_ICON[readout.hint]}
              {HINT_COPY[readout.hint]}
            </p>
          </div>
        ) : null}

        {loading ? (
          <div className="absolute inset-0 grid place-items-center bg-canvas/80 px-4">
            <ModelLoading label="Loading the hand model" detail="Runs on this device" progress={null} />
          </div>
        ) : null}
      </div>
      <figcaption className="type-small text-fg-subtle">
        It turns your hand into 21 points, then reads the shape from how straight each finger is.
      </figcaption>
    </figure>
  );
}
