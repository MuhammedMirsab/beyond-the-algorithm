"use client";

import { Hand, Move, ScanSearch, Sun, Wand } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ModelLoading } from "@/components/game/camera-notice";
import { cn } from "@/lib/cn";
import type { CVFrameResult, DetectedGesture, FrameQualityIssue, Gesture, HandLandmark } from "../engine/types";
import type { Beat } from "../match-controller";
import { analyzeFingerExtensions } from "../vision/gestureGeometry";
import type { HandTracker, ModelStatus } from "../vision/handTracker";
import { HINT_COPY, HintWindow } from "../vision/hints";
import { GESTURE_LABEL, HandGlyph } from "./gesture-icon";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** MediaPipe's 21 hand points: the palm, then each finger from knuckle to tip. */
const PALM: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, 5],
  [5, 9],
  [9, 13],
  [13, 17],
  [0, 17],
];
const FINGERS: ReadonlyArray<{ chain: readonly number[]; straight: (s: ReturnType<typeof analyzeFingerExtensions>) => boolean }> = [
  { chain: [1, 2, 3, 4], straight: (s) => s.thumbExtended },
  { chain: [5, 6, 7, 8], straight: (s) => s.indexExtended },
  { chain: [9, 10, 11, 12], straight: (s) => s.middleExtended },
  { chain: [13, 14, 15, 16], straight: (s) => s.ringExtended },
  { chain: [17, 18, 19, 20], straight: (s) => s.pinkyExtended },
];

/** The rock-paper-scissors yellow, for canvases that can't read oklch(). */
const GAME_HEX_FALLBACK = "#f9db38";
const BENT = "rgba(255, 255, 255, 0.55)";
const SHADOW = "rgba(0, 0, 0, 0.4)";

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

function strokePath(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], color: string, width: number): void {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.lineWidth = width * 2.1;
  ctx.strokeStyle = SHADOW;
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

/**
 * The hand as the model sees it: 21 points. Straight fingers in the game
 * colour, bent ones faded, because "which fingers are straight" is what
 * turns the points into rock, paper or scissors.
 */
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
  const at = (i: number) => ({ x: landmarks[i].x * w, y: landmarks[i].y * h });
  const line = Math.max(2, w / 190);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const [a, b] of PALM) strokePath(ctx, [at(a), at(b)], "rgba(255, 255, 255, 0.4)", line * 0.8);

  const state = analyzeFingerExtensions(landmarks);
  const tips: { x: number; y: number; straight: boolean }[] = [];
  for (const finger of FINGERS) {
    const straight = finger.straight(state);
    const points = finger.chain.map(at);
    strokePath(ctx, points, straight ? color : BENT, straight ? line * 1.25 : line * 0.85);
    tips.push({ ...points[points.length - 1], straight });
  }

  // Every point, small; fingertips bigger, filled when the finger is straight.
  for (let i = 0; i < 21; i++) {
    const p = at(i);
    ctx.beginPath();
    ctx.arc(p.x, p.y, line * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fill();
  }
  for (const tip of tips) {
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, (tip.straight ? 2.3 : 1.6) * line, 0, Math.PI * 2);
    ctx.fillStyle = tip.straight ? color : "rgba(255, 255, 255, 0.75)";
    ctx.fill();
    ctx.lineWidth = Math.max(1, line * 0.5);
    ctx.strokeStyle = SHADOW;
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

const CHIP = "type-small inline-flex h-9 items-center gap-2 rounded-full pl-1.5 pr-3.5 font-semibold tabular-nums";

/** What the model reads right now, top left: always visible, never over the middle of the picture. */
function ReadingChip({ readout }: { readout: Readout }) {
  const g = readout.gesture;
  const known = g === "rock" || g === "paper" || g === "scissors";
  return (
    <span className={cn(CHIP, "bg-black/70 text-white")}>
      <span className="grid size-6 place-items-center rounded-full bg-white/10">
        {known ? (
          <HandGlyph gesture={g} paper="var(--game)" ink="black" className="size-5" />
        ) : (
          <span aria-hidden className={cn("size-2 rounded-full", g === "uncertain" ? "bg-white/70" : "bg-white/35")} />
        )}
      </span>
      {known ? (
        <>
          {GESTURE_LABEL[g]}
          <span className="font-normal text-white/70">{readout.confidence}%</span>
        </>
      ) : g === "uncertain" ? (
        "Not sure yet"
      ) : (
        "No hand"
      )}
    </span>
  );
}

/**
 * The visitor's camera, mirrored like a selfie, with the hand points the model
 * found drawn on top. Nothing covers the middle of the picture: the chant is
 * shown above it, its beats flash the frame, and a hint appears at the bottom
 * only for a problem that lasts.
 */
export function CameraView({
  tracker,
  model,
  throwing,
  beat,
  thrown,
  className,
  boxClassName,
}: {
  tracker: HandTracker;
  model: ModelStatus;
  /** A throw is expected now (the chant or Shoot): also hint about a missing or unclear hand. */
  throwing: boolean;
  beat: Beat | null;
  /** The move it read at the last reveal, until the next round starts. */
  thrown: Gesture | null;
  className?: string;
  /** Size of the picture itself. */
  boxClassName?: string;
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
  const chant = beat === "rock" || beat === "paper" || beat === "scissors";

  return (
    <figure className={cn("flex min-w-0 flex-col gap-2.5", className)}>
      <div className={cn("relative w-full overflow-hidden rounded-xl bg-sunken shadow-ring", boxClassName)}>
        {/* Video and skeleton are mirrored together, like a mirror. */}
        <div className="absolute inset-0 -scale-x-100">
          <div ref={hostRef} className="absolute inset-0" />
          <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full object-cover" />
        </div>

        {/* The chant's beats flash the frame; at Shoot it stays lit until your throw is read. */}
        {chant ? (
          <motion.div
            key={beat}
            aria-hidden
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
            className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_3px_var(--game)]"
          />
        ) : null}
        <AnimatePresence>
          {beat === "shoot" ? (
            <motion.div
              key="shoot"
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ duration: 0.12 }}
              className="pointer-events-none absolute inset-0 rounded-xl shadow-[inset_0_0_0_5px_var(--game)]"
            />
          ) : null}
        </AnimatePresence>

        {!loading ? (
          <div className="absolute left-3 top-3 sm:left-4 sm:top-4">
            <AnimatePresence mode="popLayout" initial={false}>
              {thrown ? (
                <motion.span
                  key={`thrown-${thrown}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  transition={{ type: "spring", duration: 0.4, bounce: 0.3 }}
                  className={cn(CHIP, "bg-game text-game-ink")}
                >
                  <span className="grid size-6 place-items-center rounded-full bg-game-ink/10">
                    <HandGlyph gesture={thrown} paper="white" ink="var(--game-ink)" className="size-5" />
                  </span>
                  You threw {thrown}
                </motion.span>
              ) : (
                <motion.span key="reading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <ReadingChip readout={readout} />
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        ) : null}

        <AnimatePresence>
          {!loading && readout.hint ? (
            <motion.div
              key={readout.hint}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className="absolute inset-x-3 bottom-3 flex justify-center sm:inset-x-4 sm:bottom-4"
            >
              <p className="type-small inline-flex min-h-10 items-center gap-2 rounded-lg bg-black/75 px-4 py-2 font-semibold text-white [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-warning">
                {HINT_ICON[readout.hint]}
                {HINT_COPY[readout.hint]}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {loading ? (
          <div className="absolute inset-0 grid place-items-center bg-canvas/80 px-4">
            <ModelLoading label="Loading the hand model" detail="Runs on this device" progress={null} />
          </div>
        ) : null}
      </div>
      <figcaption className="type-small flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-subtle">
        <span>It reads your hand as 21 points and checks which fingers are straight.</span>
        <span className="inline-flex items-center gap-3" aria-hidden>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1 w-4 rounded-full bg-game" />
            Straight
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1 w-4 rounded-full bg-fg/50" />
            Bent
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
