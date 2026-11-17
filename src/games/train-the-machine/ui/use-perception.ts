"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { WINDOW_INTERVAL_MS, WINDOW_SIZE } from "../engine/features";
import { shouldersInView } from "../engine/quality";
import { CameraSensors, lightStatus, type LightStatus } from "../engine/sensors";
import type { PerceptionResult } from "../engine/types";
import { analyzeFrame, drawSkeleton, type VisionModels } from "../engine/vision";

/**
 * The one frame loop (the original ran two at once, and restarted this one on
 * every render because of an inline callback). It reads a frame at most every
 * 33 ms, keeps a 1.5 s window of samples every 60 ms, draws the skeleton, and
 * updates React state at most every 150 ms. The callback lives in a ref, so
 * changing it never restarts the loop.
 */

const ANALYSIS_MS = 33;
const UI_MS = 150;
const SENSOR_MS = 150;
/** About two seconds of failures in a row means the model is broken, not one bad frame. */
const MAX_ERRORS = 60;
/** Canvas fallback for browsers that can't paint oklch() (the --game token, mint). */
const FALLBACK_COLOR = "#56ecb5";

export interface PerceptionStatus {
  hasPerson: boolean;
  hasHands: boolean;
  shouldersVisible: boolean;
  light: LightStatus | null;
  /** Frames read per second, measured. */
  rate: number;
}

const INITIAL: PerceptionStatus = { hasPerson: false, hasHands: false, shouldersVisible: false, light: null, rate: 0 };

export type FrameHandler = (result: PerceptionResult, window: readonly PerceptionResult[], now: number) => void;

function sameStatus(a: PerceptionStatus, b: PerceptionStatus) {
  return (
    a.hasPerson === b.hasPerson &&
    a.hasHands === b.hasHands &&
    a.shouldersVisible === b.shouldersVisible &&
    a.light === b.light &&
    a.rate === b.rate
  );
}

/** The game colour as the canvas can paint it. */
function strokeColor(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): string {
  const token = getComputedStyle(canvas).getPropertyValue("--game").trim();
  if (!token) return FALLBACK_COLOR;
  ctx.strokeStyle = "#010203";
  ctx.strokeStyle = token;
  return ctx.strokeStyle === "#010203" ? FALLBACK_COLOR : token;
}

export function usePerception({
  models,
  videoRef,
  canvasRef,
  enabled,
  onFrame,
}: {
  models: VisionModels | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  enabled: boolean;
  onFrame?: FrameHandler;
}) {
  const latestRef = useRef<PerceptionResult | null>(null);
  const windowRef = useRef<PerceptionResult[]>([]);
  /** Samples added to the window so far: a recording waits for 25 new ones. */
  const samplesRef = useRef(0);
  /** performance.now() when someone was last in view (for the booth reset). */
  const lastSeenRef = useRef(0);
  const sensorsRef = useRef<CameraSensors | null>(null);
  const onFrameRef = useRef<FrameHandler | undefined>(onFrame);
  const [status, setStatus] = useState<PerceptionStatus>(INITIAL);
  const [failedModels, setFailedModels] = useState<VisionModels | null>(null);

  useEffect(() => {
    onFrameRef.current = onFrame;
  });

  useEffect(() => {
    if (!enabled || !models) return;
    let raf = 0;
    let lastAnalysis = 0;
    let lastSample = 0;
    let lastUi = 0;
    let lastSensors = 0;
    let lastVideoTime = -1;
    let errors = 0;
    let light: LightStatus | null = null;
    let counted = 0;
    let rate = 0;
    let rateSince = performance.now();
    let paint: { canvas: HTMLCanvasElement; color: string } | null = null;
    const sensors = (sensorsRef.current ??= new CameraSensors());
    // Start from fresh frames: whatever was seen before a pause (training, results) is stale.
    latestRef.current = null;
    windowRef.current = [];

    const draw = (result: PerceptionResult) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.round(canvas.clientWidth * dpr);
      const height = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      if (paint?.canvas !== canvas) paint = { canvas, color: strokeColor(ctx, canvas) };
      ctx.clearRect(0, 0, width, height);
      const size = Math.min(1.4, Math.max(0.6, canvas.clientWidth / 640));
      drawSkeleton(ctx, result, width, height, { color: paint.color, joint: "white", scale: dpr * size, mirror: true });
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - lastAnalysis < ANALYSIS_MS) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || video.currentTime === lastVideoTime) return;
      lastAnalysis = now;
      lastVideoTime = video.currentTime;

      let result: PerceptionResult | null = null;
      try {
        result = analyzeFrame(models, video, now);
        errors = 0;
      } catch {
        errors += 1;
        if (errors === MAX_ERRORS) setFailedModels(models);
        return;
      }
      if (!result) return;

      latestRef.current = result;
      if (result.hasPerson) lastSeenRef.current = now;
      if (now - lastSample >= WINDOW_INTERVAL_MS) {
        lastSample = now;
        const samples = windowRef.current;
        samples.push(result);
        if (samples.length > WINDOW_SIZE) samples.shift();
        samplesRef.current += 1;
      }
      draw(result);
      onFrameRef.current?.(result, windowRef.current, now);

      counted += 1;
      if (now - rateSince >= 1000) {
        rate = Math.round((counted * 1000) / (now - rateSince));
        counted = 0;
        rateSince = now;
      }
      if (now - lastSensors >= SENSOR_MS) {
        lastSensors = now;
        const reading = sensors.read(video);
        light = reading ? lightStatus(reading.light) : null;
      }
      if (now - lastUi >= UI_MS) {
        lastUi = now;
        const next: PerceptionStatus = {
          hasPerson: result.hasPerson,
          hasHands: result.hasHands,
          shouldersVisible: shouldersInView(result),
          light,
          rate,
        };
        setStatus((prev) => (sameStatus(prev, next) ? prev : next));
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      // Wipe the last skeleton drawn, so a stopped camera never shows a frozen one.
      const drawn = paint?.canvas;
      drawn?.getContext("2d")?.clearRect(0, 0, drawn.width, drawn.height);
    };
  }, [enabled, models, videoRef, canvasRef]);

  /** Forget everything seen so far (Next player). */
  const reset = useCallback(() => {
    latestRef.current = null;
    windowRef.current = [];
    samplesRef.current = 0;
    lastSeenRef.current = 0;
    sensorsRef.current?.reset();
    sensorsRef.current = null;
    setStatus(INITIAL);
  }, []);

  return {
    latestRef,
    windowRef,
    samplesRef,
    lastSeenRef,
    status,
    /** The model kept failing on these models: show the model problem. */
    failed: failedModels !== null && failedModels === models,
    reset,
  };
}
