"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DEFAULTS, settings, type Settings } from "../engine/settings";
import { tracker } from "../engine/tracking/tracker";
import type { StudioSession, StudioView } from "../play/session";

/** The session's snapshot (changes on state changes, never per frame). */
export function useStudio(session: StudioSession): StudioView {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getServerSnapshot);
}

/** The visitor's settings, live. Select an existing part (a section), never build a new object. */
export function useSettings<T>(select: (s: Settings) => T): T {
  return useSyncExternalStore(
    settings.subscribe,
    () => select(settings.get()),
    () => select(DEFAULTS),
  );
}

export interface LiveHands {
  left: boolean;
  right: boolean;
  /** Average hand size (wrist to middle knuckle, frame heights), or null with no hands. */
  size: number | null;
  fps: number;
  brightness: number;
  detectRate: number;
  delegate: string | null;
  /** Milliseconds since a hand was last seen (0 while one is in view). */
  noHandsFor: number;
  readout: string;
}

const NONE: LiveHands = { left: false, right: false, size: null, fps: 0, brightness: 128, detectRate: 0, delegate: null, noHandsFor: 0, readout: "" };

const same = (a: LiveHands, b: LiveHands) =>
  a.left === b.left &&
  a.right === b.right &&
  a.size === b.size &&
  a.fps === b.fps &&
  a.brightness === b.brightness &&
  a.detectRate === b.detectRate &&
  a.delegate === b.delegate &&
  Math.floor(a.noHandsFor / 500) === Math.floor(b.noHandsFor / 500) &&
  a.readout === b.readout;

/**
 * Hands, tracking numbers and the instrument readout, sampled a few times a
 * second (the original app's useTrackerLive), so the interface never
 * re-renders per camera frame.
 */
export function useLive(session: StudioSession, hz = 6): LiveHands {
  const [live, setLive] = useState<LiveHands>(NONE);
  useEffect(() => {
    let lastSeen = performance.now();
    const sample = () => {
      const now = performance.now();
      const f = tracker.frame;
      const fresh = now - f.time < 400;
      const hands = fresh ? f.hands : [];
      if (hands.length) lastSeen = now;
      const sizes = hands.map((h) => h.size);
      const m = tracker.metrics;
      const next: LiveHands = {
        left: fresh && !!f.Left,
        right: fresh && !!f.Right,
        size: sizes.length ? Math.round((sizes.reduce((a, b) => a + b, 0) / sizes.length) * 1000) / 1000 : null,
        fps: Math.round(m.fps),
        brightness: Math.round(m.brightness),
        detectRate: Math.round(m.detectRate * 20) / 20,
        delegate: m.delegate,
        noHandsFor: hands.length ? 0 : now - lastSeen,
        readout: session.instrumentController?.readout() ?? "",
      };
      setLive((prev) => (same(prev, next) ? prev : next));
    };
    const timer = window.setInterval(sample, 1000 / hz);
    return () => window.clearInterval(timer);
  }, [session, hz]);
  return live;
}

const COARSE = "(pointer: coarse)";
const subscribeCoarse = (onChange: () => void) => {
  const q = window.matchMedia(COARSE);
  q.addEventListener("change", onChange);
  return () => q.removeEventListener("change", onChange);
};

/** True on touch-first devices, where the pretend hand follows a finger, not a mouse. */
export function useCoarsePointer() {
  return useSyncExternalStore(subscribeCoarse, () => window.matchMedia(COARSE).matches, () => false);
}
