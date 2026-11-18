"use client";

import { useInView, useReducedMotion } from "motion/react";
import type { RefObject } from "react";

/**
 * Small helpers for the How it works motion graphics: one rAF loop per
 * picture, writing a few SVG attributes per frame and only when they change.
 * Loops run only while the picture is on screen; under reduced motion they
 * hold one meaningful still frame instead.
 */

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Progress of `t` through [a, b], clamped to 0..1. */
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 4);
export const easeInOut = (x: number) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2);
/** Overshoots a little, for things that pop into place. */
export const easeOutBack = (x: number) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;
export const r1 = (n: number) => Math.round(n * 10) / 10;

/** Writes an attribute only when its value changes. */
export function setAttr(el: Element | null | undefined, name: string, value: string | number) {
  if (!el) return;
  const v = String(value);
  if (el.getAttribute(name) !== v) el.setAttribute(name, v);
}

/** True while the picture should animate: on screen and motion allowed. */
export function usePlaying(ref: RefObject<Element | null>) {
  const inView = useInView(ref, { amount: 0.25 });
  const reduce = useReducedMotion();
  return inView && !reduce;
}

/**
 * Calls `apply(t)` every frame with t looping over `seconds`, starting at
 * `still`; or once with `still` when not playing. Returns the cleanup.
 */
export function runLoop(apply: (t: number) => void, opts: { seconds: number; still: number; playing: boolean }) {
  if (!opts.playing) {
    apply(opts.still);
    return () => {};
  }
  let raf = 0;
  const start = performance.now() - opts.still * 1000;
  const frame = (now: number) => {
    apply(((now - start) / 1000) % opts.seconds);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
