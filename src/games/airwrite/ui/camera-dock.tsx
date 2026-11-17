"use client";

import { LoaderCircle, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { IconButton } from "@/components/ui/button";
import type { PenIndicator, TrackingStatus } from "../engine/useHandTracking";
import { cn } from "@/lib/cn";

/**
 * The machine's view: the mirrored camera, the 21-point skeleton and the
 * dashed writing zone (drawn by useHandTracking into previewRef).
 *
 * The video element always keeps a real, visible size while tracking runs:
 * "smaller" makes the whole dock smaller instead of hiding the video, because
 * a hidden or 2x2 px video can stop frame callbacks and freeze tracking.
 */
export function CameraDock({
  videoRef,
  previewRef,
  status,
  indicator,
  small,
  onToggleSmall,
  className,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  previewRef: RefObject<HTMLCanvasElement | null>;
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
      className={cn(
        "overflow-hidden rounded-lg bg-surface shadow-ring",
        small ? "w-28" : "w-[7.5rem] sm:w-44 lg:w-56 xl:w-64",
        className,
      )}
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
