"use client";

import { Camera } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { KeyHints, type KeyHint } from "@/components/ui/key-hints";
import { cn } from "@/lib/cn";
import type { FaceControlSession } from "../play/session";
import { CameraSlot } from "./camera-slot";
import { Meters } from "./meters";

const READOUT_MS = 500;

/** The keys, as everywhere else in the arcade: glyphs on key caps. */
export const PLAY_KEYS: KeyHint[] = [
  { keys: ["←", "→"], label: "Roll" },
  { keys: ["Space"], label: "Jump" },
  { keys: ["P"], label: "Pause" },
];

/**
 * The machine's view during play: your camera with the points the model
 * found, the two meters your face drives, and a readout of what the model is
 * doing right now ("478 points · 30 fps · GPU"), all real values. It sits in
 * the sky, top right, where it never hides the platforms ahead.
 */
export function FaceDock({ session, compact = false, className }: { session: FaceControlSession; compact?: boolean; className?: string }) {
  const readout = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let last = 0;
    return session.onFrame((s) => {
      if (s.t - last < READOUT_MS || !readout.current) return;
      last = s.t;
      const points = s.landmarks ? `${s.landmarks.length} points` : "No face";
      const fps = s.fps ? `${Math.round(s.fps)} fps` : "";
      const text = [points, fps, session.delegateLabel].filter(Boolean).join(" · ");
      if (readout.current.textContent !== text) readout.current.textContent = text;
    });
  }, [session]);

  return (
    <aside aria-label="Camera" className={cn("pointer-events-auto flex flex-col gap-2 rounded-lg bg-surface/95 p-1.5 pb-2 shadow-ring", className)}>
      <CameraSlot session={session} className="aspect-[4/3] w-full rounded-[10px]" />
      {compact ? null : <Meters session={session} className="px-1.5" />}
      <p ref={readout} aria-hidden className="type-label truncate px-1.5 text-fg-subtle">
        Starting
      </p>
    </aside>
  );
}

/** Keyboard play on a laptop: which keys do what, and a way to switch to the face. */
export function KeysDock({ session, canUseCamera, className }: { session: FaceControlSession; canUseCamera: boolean; className?: string }) {
  return (
    <aside aria-label="Keyboard controls" className={cn("pointer-events-auto flex w-56 flex-col gap-4 rounded-lg bg-surface/95 p-4 shadow-ring", className)}>
      <KeyHints items={PLAY_KEYS} layout="list" />
      {canUseCamera ? (
        <Button variant="secondary" size="md" icon={<Camera />} onClick={() => session.act({ type: "choose-camera" })}>
          Use your face
        </Button>
      ) : null}
    </aside>
  );
}
