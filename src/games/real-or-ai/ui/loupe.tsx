"use client";

import { useMemo, useRef, useSyncExternalStore } from "react";
import { loupeBackground, type Size } from "../engine/geometry";
import type { Side } from "../engine/types";
import { cn } from "@/lib/cn";

/**
 * The hover magnifier. With a mouse, moving over either photo shows a round
 * lens under the pointer, and a twin lens at the same spot on the other
 * photo, so the same detail can be compared side by side. It reads the
 * original files (the round shows resized copies, which smooth away the very
 * grain the hard rounds are about).
 *
 * Everything moves by writing styles directly: no React render per mouse move.
 */

/** How much bigger than drawn the lens shows the photo. */
const ZOOM = 2.5;

interface Target {
  slot: HTMLElement;
  lens: HTMLElement;
  glass: HTMLElement;
  image: Size;
  src: string;
  /** The resized copy already on screen, shown until the original arrives. */
  fallback: () => string | undefined;
}

export interface LoupeApi {
  register: (side: Side, target: Target | null) => void;
  /** Pointer at (clientX, clientY) over `side`'s photo. */
  move: (side: Side, clientX: number, clientY: number) => void;
  hide: () => void;
}

export function useLoupe(): LoupeApi {
  const targets = useRef<Partial<Record<Side, Target>>>({});
  const shown = useRef(false);

  return useMemo<LoupeApi>(() => {
    const place = (t: Target, fx: number, fy: number, active: boolean) => {
      const box = t.slot.getBoundingClientRect();
      const d = Math.round(Math.min(230, Math.max(140, box.width * 0.34)));
      const px = fx * box.width;
      const py = fy * box.height;
      const bg = loupeBackground(box, t.image, px, py, ZOOM, d);
      const fallback = t.fallback();
      const image = fallback ? `url("${t.src}"), url("${fallback}")` : `url("${t.src}")`;
      if (t.glass.style.backgroundImage !== image) t.glass.style.backgroundImage = image;
      t.lens.style.width = `${d}px`;
      t.lens.style.height = `${d}px`;
      t.lens.style.transform = `translate3d(${px - d / 2}px, ${py - d / 2}px, 0)`;
      t.glass.style.backgroundSize = `${bg.sizeX}px ${bg.sizeY}px`;
      t.glass.style.backgroundPosition = `${bg.posX}px ${bg.posY}px`;
      t.lens.dataset.active = active ? "true" : "false";
      t.lens.dataset.on = "true";
    };

    return {
      register(side, target) {
        if (target) targets.current[side] = target;
        else delete targets.current[side];
      },
      move(side, clientX, clientY) {
        const here = targets.current[side];
        if (!here) return;
        const box = here.slot.getBoundingClientRect();
        const fx = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
        const fy = Math.min(1, Math.max(0, (clientY - box.top) / box.height));
        for (const s of ["A", "B"] as const) {
          const t = targets.current[s];
          if (t) place(t, fx, fy, s === side);
        }
        shown.current = true;
      },
      hide() {
        if (!shown.current) return;
        shown.current = false;
        for (const s of ["A", "B"] as const) {
          const t = targets.current[s];
          if (t) t.lens.dataset.on = "false";
        }
      },
    };
  }, []);
}

const finePointer = "(hover: hover) and (pointer: fine)";

/** True on a device with a mouse or trackpad (the lens follows a hovering pointer, which touch doesn't have). */
export function useFinePointer(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(finePointer);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(finePointer).matches,
    () => false,
  );
}

/** Starts downloading a photo's original file, so the lens and the closer look open sharp. */
export function preloadOriginal(src: string) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
}

/**
 * One lens, positioned by the controller. `active` is the one under the
 * pointer (a small mark at its centre); the twin on the other photo is lighter.
 */
export function Lens({ lensRef, glassRef }: { lensRef: (el: HTMLDivElement | null) => void; glassRef: (el: HTMLDivElement | null) => void }) {
  return (
    <div
      ref={lensRef}
      aria-hidden
      data-on="false"
      data-active="false"
      className={cn(
        "group/lens pointer-events-none absolute left-0 top-0 z-[5] rounded-full",
        "opacity-0 scale-[0.85] transition-[opacity,scale] duration-200 ease-out motion-reduce:transition-opacity",
        "data-[on=true]:scale-100 data-[on=true]:opacity-100",
      )}
    >
      <div
        ref={glassRef}
        className={cn(
          "size-full rounded-full bg-sunken bg-no-repeat shadow-float",
          "ring-[3px] ring-fg group-data-[active=false]/lens:ring-2 group-data-[active=false]/lens:ring-fg/60",
        )}
      />
      <span className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_1.5px_oklch(1_0_0/0.85),0_0_0_3px_oklch(0_0_0/0.35)] group-data-[active=false]/lens:hidden" />
    </div>
  );
}
