"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/cn";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * The live camera, mirrored, with the skeleton canvas on top. The box takes
 * the stream's own shape, so the drawing lines up with the picture exactly,
 * and never grows taller than --stage-max.
 *
 * Overlays only ever sit at the edges (a plate top left, a timer top right,
 * a message at the bottom), so the middle, where the visitor stands, stays clear.
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
  /** Overlays: plates, the countdown, the recording bar, messages. */
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

/**
 * The plate in the top left corner: what the machine is doing right now, in
 * words big enough to read from where the visitor stands.
 */
export function StagePlate({ children, tone = "dark", className }: { children: ReactNode; tone?: "dark" | "game"; className?: string }) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] sm:left-4 sm:top-4 sm:max-w-[min(26rem,calc(100%-2rem))]">
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg py-2.5 pl-2.5 pr-4 transition-colors duration-150 ease-out",
          tone === "game" ? "bg-game text-game-ink" : "bg-black/75 text-white",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Five pips: examples taken of the five needed. The newest one pops in. */
export function Pips({ count, of, tone = "light", className }: { count: number; of: number; tone?: "light" | "ink"; className?: string }) {
  return (
    <span aria-hidden className={cn("flex items-center gap-1.5", className)}>
      {Array.from({ length: of }, (_, i) => {
        const on = i < count;
        return (
          <span
            key={i}
            className={cn(
              "relative block size-2.5 rounded-full",
              tone === "light" ? "bg-white/25" : "bg-game-ink/20",
            )}
          >
            <AnimatePresence initial={false}>
              {on ? (
                <motion.span
                  key="on"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", duration: 0.35, bounce: 0.3 }}
                  className={cn("absolute inset-0 rounded-full", tone === "light" ? "bg-game" : "bg-game-ink")}
                />
              ) : null}
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}

/** A message along the bottom edge, big enough to read from a couple of metres. */
export function StageBanner({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center sm:inset-x-5 sm:bottom-5">
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE_OUT }}
        className="type-title-3 inline-flex max-w-full items-center gap-3 rounded-lg bg-black/75 px-4 py-3 text-white [&_svg]:size-6 [&_svg]:shrink-0"
      >
        {icon}
        <span className="min-w-0">{children}</span>
      </motion.p>
    </div>
  );
}

/** 3, 2, 1 in the scoreboard numerals, in the top right corner (never over the person). */
export function StageCountdown({ value }: { value: number | null }) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 sm:right-4 sm:top-4">
      <AnimatePresence initial={false}>
        {value !== null ? (
          <motion.span
            key={value}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className="type-score absolute right-0 top-0 grid size-[clamp(5rem,12vw,7.5rem)] place-items-center rounded-xl bg-black/75 pt-[0.08em] text-white tabular-nums"
          >
            {value}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** While a moving example records: a thin bar along the top edge. */
export function StageRecording({ progress }: { progress: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <div
      role="progressbar"
      aria-label="Recording"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1.5 bg-black/45"
    >
      <div className="h-full origin-left bg-game transition-transform duration-100 ease-linear" style={{ transform: `scaleX(${pct / 100})` }} />
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
      initial={{ opacity: 0.35 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className="pointer-events-none absolute inset-0 z-10 bg-white"
    />
  );
}
