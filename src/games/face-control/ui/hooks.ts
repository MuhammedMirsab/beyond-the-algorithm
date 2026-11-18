"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { RunState } from "../engine/game/bridge";
import { DEFAULT_SETTINGS, settings, type Settings } from "../engine/state/settings";
import type { FaceControlSession } from "../play/session";

/** The current visitor's settings, live. */
export function useSettings(): Settings {
  return useSyncExternalStore(settings.subscribe, settings.get, () => DEFAULT_SETTINGS);
}

export interface RunValues {
  levelIndex: number;
  score: number;
  sparks: number;
  sparksTotal: number;
  lives: number;
  /** Level time in seconds, to a tenth. */
  levelTime: number;
}

function readRun(run: RunState): RunValues {
  return {
    levelIndex: run.levelIndex,
    score: run.score,
    sparks: run.sparks,
    sparksTotal: run.sparksTotal,
    lives: run.lives,
    levelTime: Math.floor(run.levelTime * 10) / 10,
  };
}

const sameRun = (a: RunValues, b: RunValues) =>
  a.levelIndex === b.levelIndex &&
  a.score === b.score &&
  a.sparks === b.sparks &&
  a.sparksTotal === b.sparksTotal &&
  a.lives === b.lives &&
  a.levelTime === b.levelTime;

/**
 * The run as the Phaser world updates it, sampled once per animation frame and
 * re-rendered only when a shown value changes (at most ten times a second,
 * for the timer).
 */
export function useRunValues(session: FaceControlSession): RunValues {
  const [values, setValues] = useState<RunValues>(() => readRun(session.run));
  useEffect(() => {
    let raf = 0;
    let last = readRun(session.run);
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const next = readRun(session.run);
      if (!sameRun(next, last)) {
        last = next;
        setValues(next);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [session]);
  return values;
}

function useMedia(query: string, server: boolean) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => server,
  );
}

/** True on touch-first devices (phones, tablets), where keys are replaced by on-screen buttons. */
export function useCoarsePointer() {
  return useMedia("(pointer: coarse)", false);
}

/**
 * Tablet width and up (Tailwind's md). The camera dock sits top right there and
 * bottom right on phones; it is rendered once, in one place, because the live
 * camera moves into whichever camera slot mounted last.
 */
export function useWide() {
  return useMedia("(min-width: 768px)", true);
}
