"use client";

import { useEffect, useRef } from "react";
import { GameGlyph } from "@/components/art/game-glyph";
import { cn } from "@/lib/cn";
import type { FaceControlSession } from "../play/session";
import { useSettings } from "./hooks";

/** Mouth level shown at the right end of the jump meter; the jump line sits at level 1. */
const MOUTH_MAX = 1.5;
const JUMP_LINE = `${(100 / MOUTH_MAX).toFixed(2)}%`;
const FLASH_MS = 320;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Live steering and jump meters (ported from meters.ts). Updated straight
 * from tracking frames, never through React state.
 */
export function Meters({ session, className }: { session: FaceControlSession; className?: string }) {
  const { deadZone } = useSettings();
  const needle = useRef<HTMLSpanElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const mouth = useRef<HTMLSpanElement>(null);
  const jumpLabel = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let flashTimer = 0;
    const offFrame = session.onFrame((s) => {
      const raw = clamp(s.steerRaw, -1, 1);
      if (needle.current) needle.current.style.left = `${50 + raw * 50}%`;
      if (fill.current) fill.current.style.transform = `scaleX(${clamp(s.steer, -1, 1).toFixed(3)})`;
      if (mouth.current) {
        mouth.current.style.transform = `scaleX(${clamp(s.mouthLevel / MOUTH_MAX, 0, 1).toFixed(3)})`;
        mouth.current.dataset.open = s.mouthOpen ? "true" : "false";
      }
    });
    const offJump = session.onJump(() => {
      const label = jumpLabel.current;
      if (!label) return;
      label.dataset.on = "true";
      window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => {
        label.dataset.on = "false";
      }, FLASH_MS);
    });
    return () => {
      offFrame();
      offJump();
      window.clearTimeout(flashTimer);
    };
  }, [session]);

  return (
    <div aria-hidden className={cn("flex flex-col gap-2.5", className)}>
      <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-2">
        <span className="type-label text-fg-subtle">Steer</span>
        <span className="relative h-2 rounded-full bg-fg/10">
          <span className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full bg-fg/15" style={{ width: `${deadZone * 100}%` }} />
          <span ref={fill} className="absolute inset-y-0 left-1/2 w-1/2 origin-left rounded-full bg-game" style={{ transform: "scaleX(0)" }} />
          <span className="absolute -inset-y-1 left-1/2 w-px bg-fg/35" />
          <span
            ref={needle}
            className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg shadow-[0_1px_3px_oklch(0_0_0/0.5)]"
          />
        </span>
      </div>
      <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-2">
        <span ref={jumpLabel} data-on="false" className="type-label text-fg-subtle transition-colors duration-150 data-[on=true]:text-game">
          Jump
        </span>
        <span className="relative h-2 rounded-full bg-fg/10">
          <span
            ref={mouth}
            data-open="false"
            className="absolute inset-0 origin-left rounded-full bg-fg/40 transition-colors duration-150 data-[open=true]:bg-game"
            style={{ transform: "scaleX(0)" }}
          />
          <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-fg" style={{ left: JUMP_LINE }} />
        </span>
      </div>
    </div>
  );
}

/** "Open your mouth to continue": the face way to press a screen's main button, with a live meter. */
export function MouthPrompt({ session, label, className }: { session: FaceControlSession; label: string; className?: string }) {
  const fill = useRef<HTMLSpanElement>(null);

  useEffect(
    () =>
      session.onFrame((s) => {
        const el = fill.current;
        if (!el) return;
        el.style.transform = `scaleX(${clamp(s.mouthLevel / MOUTH_MAX, 0, 1).toFixed(3)})`;
        el.dataset.open = s.mouthOpen ? "true" : "false";
      }),
    [session],
  );

  return (
    <div className={cn("flex items-center gap-3 rounded-lg bg-game-soft px-4 py-3", className)}>
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-game text-game-ink">
        <GameGlyph slug="face-control" className="size-5" />
      </span>
      <span className="type-body min-w-0 flex-1 font-semibold text-fg">{label}</span>
      <span aria-hidden className="relative h-2 w-16 shrink-0 rounded-full bg-fg/15 sm:w-24">
        <span
          ref={fill}
          data-open="false"
          className="absolute inset-0 origin-left rounded-full bg-fg/45 transition-colors duration-150 data-[open=true]:bg-game"
          style={{ transform: "scaleX(0)" }}
        />
        <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-fg" style={{ left: JUMP_LINE }} />
      </span>
    </div>
  );
}
