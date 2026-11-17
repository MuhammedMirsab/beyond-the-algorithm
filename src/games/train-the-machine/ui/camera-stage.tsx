"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/cn";

/**
 * The live camera, mirrored, with the skeleton canvas on top. The box takes
 * the stream's own shape, so the drawing lines up with the picture exactly,
 * and never grows taller than --stage-max.
 */
export function CameraStage({
  stream,
  videoRef,
  canvasRef,
  children,
  className,
}: {
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Overlays: countdown, recording bar, hints. */
  children?: ReactNode;
  className?: string;
}) {
  const [ratio, setRatio] = useState(4 / 3);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    // A muted stream may autoplay; a rejected play() only means it starts on the next frame.
    video.play().catch(() => {});
    return () => {
      video.srcObject = null;
    };
  }, [stream, videoRef]);

  const measure = (video: HTMLVideoElement) => {
    if (video.videoWidth && video.videoHeight) setRatio(video.videoWidth / video.videoHeight);
  };

  return (
    <div
      className={cn(
        "relative mx-auto overflow-hidden rounded-xl bg-sunken shadow-ring",
        "[--stage-max:56dvh] lg:[--stage-max:calc(100dvh_-_9rem)]",
        className,
      )}
      style={{ aspectRatio: ratio, width: `min(100%, calc(var(--stage-max) * ${ratio.toFixed(4)}))` }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-label="Your camera, mirrored"
        onLoadedMetadata={(e) => measure(e.currentTarget)}
        onResize={(e) => measure(e.currentTarget)}
        className="absolute inset-0 size-full -scale-x-100 object-cover"
      />
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
      {children}
    </div>
  );
}

/** A message over the bottom of the video, big enough to read from a couple of metres. */
export function StageBanner({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center sm:inset-x-5 sm:bottom-5">
      <p className="type-title-3 inline-flex max-w-full items-center gap-3 rounded-lg bg-black/75 px-4 py-3 text-white [&_svg]:size-6 [&_svg]:shrink-0">
        {icon}
        <span className="min-w-0">{children}</span>
      </p>
    </div>
  );
}

/** 3, 2, 1 in the scoreboard numerals. */
export function StageCountdown({ value }: { value: number | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      <AnimatePresence initial={false}>
        {value !== null ? (
          <motion.span
            key={value}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="type-score col-start-1 row-start-1 grid size-[clamp(6.5rem,20vw,10rem)] place-items-center rounded-full bg-black/55 pt-[0.08em] text-white tabular-nums"
          >
            {value}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** While a moving example records: a bar across the top and the word, not just a colour. */
export function StageRecording({ progress }: { progress: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-3">
      <div
        role="progressbar"
        aria-label="Recording"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 w-full bg-black/45"
      >
        <div className="h-full origin-left bg-game transition-transform duration-100 ease-linear" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <span className="type-small inline-flex items-center gap-2 rounded-full bg-black/75 px-3 py-1.5 font-semibold text-white">
        <span aria-hidden className="size-2.5 rounded-full bg-danger" />
        Recording
      </span>
    </div>
  );
}

/** A quick white flash: the example was taken. */
export function StageFlash({ id }: { id: number }) {
  if (id === 0) return null;
  return (
    <motion.div
      key={id}
      aria-hidden
      initial={{ opacity: 0.4 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none absolute inset-0 z-10 bg-white"
    />
  );
}
