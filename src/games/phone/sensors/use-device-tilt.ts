"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LEVEL, tiltFromOrientation, type Tilt } from "../engine/tilt";
import { createStepState, magnitude, movementKind, stepReducer, type MovementKind } from "../engine/steps";
import { permissionRequester, type PermissionAnswer } from "./browser";
import type { SensorStatus } from "./status";

export interface MovementReading {
  steps: number;
  kind: MovementKind;
  /** The last second or so of total force, for the sparkline. */
  trace: number[];
}

/** No readings within this long means the device has no motion sensor. */
const NO_SENSOR_AFTER_MS = 2500;

/**
 * Real tilt (DeviceOrientationEvent) and movement (DeviceMotionEvent).
 * `start` must be called straight from a tap: on iPhone it opens the
 * permission prompt, which Safari only allows inside a user gesture. Every
 * listener is removed on `stop`, when the page is hidden and on unmount.
 */
export function useDeviceTilt() {
  const [status, setStatus] = useState<SensorStatus>("idle");
  const [tilt, setTilt] = useState<Tilt>(LEVEL);
  const [movement, setMovement] = useState<MovementReading | null>(null);
  /** Tilt readings the browser delivered in the last second. */
  const [rate, setRate] = useState<number | null>(null);
  const generation = useRef(0);
  const detach = useRef<(() => void) | null>(null);

  /** Removes every listener and invalidates pending permission answers. */
  const release = useCallback(() => {
    generation.current += 1;
    detach.current?.();
    detach.current = null;
  }, []);

  const halt = useCallback(
    (next: SensorStatus) => {
      release();
      setStatus(next);
    },
    [release],
  );

  const attach = useCallback(
    (gen: number) => {
      let received = false;
      let frame = 0;
      let flushes = 0;
      let events = 0;
      let pending: Tilt | null = null;
      let steps = createStepState();

      const flush = () => {
        frame = 0;
        if (generation.current !== gen) return;
        if (pending) {
          setTilt(pending);
          pending = null;
        }
        flushes += 1;
        if (flushes % 6 === 0 && steps.recent.length > 0) {
          setMovement({ steps: steps.steps, kind: movementKind(steps.recent), trace: steps.recent.slice(-60) });
        }
      };
      const schedule = () => {
        if (!frame) frame = window.requestAnimationFrame(flush);
      };
      const onOrientation = (event: DeviceOrientationEvent) => {
        if (event.beta == null || event.gamma == null) return;
        if (!received) {
          received = true;
          setStatus("live");
        }
        events += 1;
        pending = tiltFromOrientation(event.beta, event.gamma);
        schedule();
      };
      const onMotion = (event: DeviceMotionEvent) => {
        const a = event.accelerationIncludingGravity;
        if (!a || a.x == null || a.y == null || a.z == null) return;
        steps = stepReducer(steps, magnitude(a.x, a.y, a.z), event.timeStamp);
        schedule();
      };
      const onVisibility = () => {
        if (document.hidden) halt("idle");
      };
      const noSensor = window.setTimeout(() => {
        if (!received && generation.current === gen) halt("unavailable");
      }, NO_SENSOR_AFTER_MS);
      const perSecond = window.setInterval(() => {
        if (generation.current !== gen || !received) return;
        setRate(events);
        events = 0;
      }, 1000);

      window.addEventListener("deviceorientation", onOrientation);
      window.addEventListener("devicemotion", onMotion);
      document.addEventListener("visibilitychange", onVisibility);
      detach.current = () => {
        window.removeEventListener("deviceorientation", onOrientation);
        window.removeEventListener("devicemotion", onMotion);
        document.removeEventListener("visibilitychange", onVisibility);
        window.clearTimeout(noSensor);
        window.clearInterval(perSecond);
        if (frame) window.cancelAnimationFrame(frame);
      };
    },
    [halt],
  );

  const start = useCallback(() => {
    release();
    const gen = generation.current;
    if (!window.isSecureContext) {
      setStatus("insecure");
      return;
    }
    if (!("DeviceOrientationEvent" in window)) {
      setStatus("unavailable");
      return;
    }
    setStatus("starting");
    setMovement(null);
    const askOrientation = permissionRequester("DeviceOrientationEvent");
    const askMotion = permissionRequester("DeviceMotionEvent");
    if (!askOrientation && !askMotion) {
      attach(gen);
      return;
    }
    // Both prompts are requested inside this tap, before anything is awaited.
    const ask = (request: (() => Promise<PermissionAnswer>) | null): Promise<PermissionAnswer> =>
      request ? request().catch((): PermissionAnswer => "denied") : Promise.resolve("granted");
    void Promise.all([ask(askOrientation), ask(askMotion)]).then(([orientation]) => {
      if (generation.current !== gen) return;
      if (orientation !== "granted") {
        setStatus("denied");
        return;
      }
      attach(gen);
    });
  }, [attach, release]);

  const stop = useCallback(() => halt("idle"), [halt]);

  useEffect(() => release, [release]);

  return { status, tilt, movement, rate, start, stop };
}
