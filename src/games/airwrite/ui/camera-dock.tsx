"use client";

import { LoaderCircle, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { IconButton } from "@/components/ui/button";
import type { PenFrame } from "../engine/airPen";
import type { PenIndicator, TrackingStatus } from "../engine/useHandTracking";
import { cn } from "@/lib/cn";

/** A relaxed pointing hand: thumb tip about this many palm-lengths from the index tip. The meter is empty here. */
const OPEN_RATIO = 1;

/**
 * The machine's number behind the pen: how close thumb and index tip are,
 * against the line where the pen lifts. Filled in the game colour once
 * past it. Read straight from tracking frames, never through React state.
 */
function PinchMeter({ frameRef, enter }: { frameRef: RefObject<PenFrame | null>; enter: number }) {
  const fill = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let shown = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const frame = frameRef.current;
      const ratio = frame?.handVisible ? frame.pinchRatio : null;
      const k = ratio === null ? 0 : Math.min(1, Math.max(0, (OPEN_RATIO - ratio) / (OPEN_RATIO - enter)));
      const rounded = Math.round(k * 50) / 50;
      if (rounded === shown || !fill.current) return;
      shown = rounded;
      fill.current.style.transform = `scaleX(${rounded})`;
      fill.current.dataset.on = rounded >= 1 ? "true" : "false";
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frameRef, enter]);

  return (
    <div aria-hidden className="flex items-center gap-2.5 px-3">
      <span className="type-label w-10 shrink-0 text-fg-subtle">Pinch</span>
      <span className="relative h-1.5 flex-1 rounded-full bg-fg/10">
        <span
          ref={fill}
          data-on="false"
          className="absolute inset-0 origin-left rounded-full bg-fg/45 transition-colors duration-150 data-[on=true]:bg-game"
          style={{ transform: "scaleX(0)" }}
        />
        <span className="absolute -inset-y-1 right-0 w-0.5 rounded-full bg-fg" />
      </span>
    </div>
  );
}

/**
 * The machine's view: the mirrored camera, the 21-point skeleton and the
 * dashed writing zone (drawn by useHandTracking into previewRef), and the
 * pinch meter that decides pen up or down.
 *
 * The video element always keeps a real, visible size while tracking runs:
 * "smaller" makes the whole dock smaller instead of hiding the video, because
 * a hidden or 2x2 px video can stop frame callbacks and freeze tracking.
 */
export function CameraDock({
  videoRef,
  previewRef,
  frameRef,
  pinchEnter,
  status,
  indicator,
  small,
  onToggleSmall,
  className,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  previewRef: RefObject<HTMLCanvasElement | null>;
  frameRef: RefObject<PenFrame | null>;
  /** Pinch ratio where the pen lifts, from the current settings. */
  pinchEnter: number;
  status: TrackingStatus;
  indicator: PenIndicator;
  small: boolean;
  onToggleSmall: () => void;
  className?: string;
}) {
  const [aspect, setAspect] = useState(16 / 9);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      if (video.videoWidth && video.videoHeight) setAspect(video.videoWidth / video.videoHeight);
    };
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("resize", update);
    return () => {
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("resize", update);
    };
  }, [videoRef]);

  const ready = status.phase === "ready";

  return (
    <section
      aria-label="Camera view"
      className={cn("overflow-hidden rounded-lg bg-surface shadow-ring", small ? "w-28" : "w-[7.5rem] sm:w-44 lg:w-60", className)}
    >
      <div className="relative bg-sunken" style={{ aspectRatio: aspect }}>
        <video ref={videoRef} playsInline muted aria-hidden className="absolute inset-0 size-full -scale-x-100 object-fill" />
        <canvas ref={previewRef} aria-hidden className="absolute inset-0 size-full" />
        {!ready ? (
          <div className="absolute inset-0 grid place-items-center bg-sunken/60">
            <LoaderCircle aria-hidden className="size-5 animate-spin text-fg" />
          </div>
        ) : null}
      </div>
      {ready && !small ? (
        <div className="hidden pt-3 lg:block">
          <PinchMeter frameRef={frameRef} enter={pinchEnter} />
        </div>
      ) : null}
      <div className="hidden h-10 items-center justify-between gap-2 pl-3 pr-0.5 lg:flex">
        <span className={cn("type-label truncate", ready && indicator.handVisible ? "text-fg" : "text-fg-subtle")}>
          {!ready ? "Starting" : indicator.handVisible ? "Hand · 21 points" : "No hand"}
        </span>
        <IconButton
          label={small ? "Make camera view bigger" : "Make camera view smaller"}
          icon={small ? <Maximize2 /> : <Minimize2 />}
          variant="ghost"
          size="sm"
          onClick={onToggleSmall}
        />
      </div>
    </section>
  );
}
