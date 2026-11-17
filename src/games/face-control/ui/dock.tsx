"use client";

import { Camera } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/surface";
import type { FaceControlSession } from "../play/session";
import { CameraSlot } from "./camera-slot";
import { Meters } from "./meters";

const READOUT_MS = 500;

/**
 * Bottom-right during play: the camera with the points the model found, the
 * two meters it controls, and a readout of what the model is doing right now
 * ("478 points · 30 fps · GPU"), all from real values.
 */
export function FaceDock({ session }: { session: FaceControlSession }) {
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
    <aside
      aria-label="Camera"
      className="absolute bottom-3 right-3 z-20 flex w-[min(44vw,11.5rem)] flex-col gap-2.5 rounded-lg bg-surface p-2 pb-2.5 shadow-ring sm:bottom-4 sm:right-4 sm:w-[clamp(13rem,19vw,18rem)]"
    >
      <CameraSlot session={session} className="aspect-[4/3] w-full rounded-[12px]" />
      <Meters session={session} className="px-1" />
      <p ref={readout} aria-hidden className="type-label truncate px-1 text-fg-subtle">
        Starting
      </p>
    </aside>
  );
}

/** Keyboard play on a laptop: which keys do what, and a way to switch to the face. */
export function KeysDock({ session, canUseCamera }: { session: FaceControlSession; canUseCamera: boolean }) {
  return (
    <aside
      aria-label="Keyboard controls"
      className="absolute bottom-4 right-4 z-20 hidden w-60 flex-col gap-4 rounded-lg bg-surface p-4 shadow-ring md:flex"
    >
      <dl className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <dt className="type-small text-fg-muted">Roll</dt>
          <dd className="flex gap-1">
            <Kbd>←</Kbd>
            <Kbd>→</Kbd>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="type-small text-fg-muted">Jump</dt>
          <dd>
            <Kbd>Space</Kbd>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="type-small text-fg-muted">Pause</dt>
          <dd>
            <Kbd>P</Kbd>
          </dd>
        </div>
      </dl>
      {canUseCamera ? (
        <Button variant="secondary" size="md" icon={<Camera />} onClick={() => session.act({ type: "choose-camera" })}>
          Use the camera
        </Button>
      ) : null}
    </aside>
  );
}
