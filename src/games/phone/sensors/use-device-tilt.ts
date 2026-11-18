"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { compassHeading, webkitHeading, type Euler } from "../engine/orientation";
import { createStepState, magnitude, movementKind, stepReducer, type MovementKind } from "../engine/steps";
import { LEVEL, tiltFromOrientation, type Tilt } from "../engine/tilt";
import { permissionRequester, type PermissionAnswer } from "./browser";
import type { SensorStatus } from "./status";

export interface MovementReading {
  steps: number;
  kind: MovementKind;
  /** The last second or so of total force, for the sparkline. */
  trace: number[];
}

/** Where the compass heading comes from: iPhone's own heading, or an orientation reading relative to north. */
export type CompassState = "waiting" | "live" | "none";

/** No readings within this long means the device has no motion sensor. */
const NO_SENSOR_AFTER_MS = 2500;
/** Tilt readings but no heading after this long: this browser doesn't share a compass. */
const NO_COMPASS_AFTER_MS = 2000;

const START_EULER: Euler = { alpha: 0, beta: 45, gamma: 0 };

type HeadingEvent = DeviceOrientationEvent & { webkitCompassHeading?: unknown };

/** Asks the iPhone permission prompt, if this browser has one. Must run inside a tap to show the prompt. */
export function requestMotionPermission(): Promise<PermissionAnswer | "prompt"> {
  const askOrientation = permissionRequester("DeviceOrientationEvent");
  const askMotion = permissionRequester("DeviceMotionEvent");
  if (!askOrientation && !askMotion) return Promise.resolve("granted");
  // Both are requested inside the same tap, before anything is awaited. A rejection means "needs a tap".
  const ask = (request: (() => Promise<PermissionAnswer>) | null): Promise<PermissionAnswer | "prompt"> =>
    request ? request().catch((): "prompt" => "prompt") : Promise.resolve("granted");
  return Promise.all([ask(askOrientation), ask(askMotion)]).then(([orientation]) => orientation);
}

/** True where turning on motion needs a tap and a permission prompt (iPhone and iPad). */
export function motionNeedsPermission(): boolean {
  return permissionRequester("DeviceOrientationEvent") != null;
}

/**
 * Real tilt and 3D orientation (DeviceOrientationEvent), the compass where the
 * browser shares one, and movement (DeviceMotionEvent).
 *
 * `start()` from a tap opens the iPhone permission prompt. `start({ quiet: true })`
 * works without a tap wherever no prompt is needed (Android, or an iPhone that
 * already said yes) and otherwise just waits for the button. Readings simply
 * pause while the page is hidden. Every listener goes on `stop` and on unmount.
 */
export function useDeviceTilt() {
  const [status, setStatus] = useState<SensorStatus>("idle");
  const [tilt, setTilt] = useState<Tilt>(LEVEL);
  const [euler, setEuler] = useState<Euler>(START_EULER);
  const [heading, setHeading] = useState<number | null>(null);
  const [compass, setCompass] = useState<CompassState>("waiting");
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
      let pending: { tilt: Tilt; euler: Euler } | null = null;
      let pendingHeading: number | null = null;
      let headingSeen = false;
      let steps = createStepState();

      const flush = () => {
        frame = 0;
        if (generation.current !== gen) return;
        if (pending) {
          setTilt(pending.tilt);
          setEuler(pending.euler);
          pending = null;
        }
        if (pendingHeading != null) {
          setHeading(pendingHeading);
          pendingHeading = null;
        }
        flushes += 1;
        if (flushes % 6 === 0 && steps.recent.length > 0) {
          setMovement({ steps: steps.steps, kind: movementKind(steps.recent), trace: steps.recent.slice(-60) });
        }
      };
      const schedule = () => {
        if (!frame) frame = window.requestAnimationFrame(flush);
      };
      const noteHeading = (value: number | null) => {
        if (value == null) return;
        pendingHeading = value;
        if (!headingSeen) {
          headingSeen = true;
          setCompass("live");
        }
      };
      const onOrientation = (event: DeviceOrientationEvent) => {
        if (event.beta == null || event.gamma == null) return;
        if (!received) {
          received = true;
          setStatus("live");
        }
        events += 1;
        const e: Euler = { alpha: event.alpha ?? 0, beta: event.beta, gamma: event.gamma };
        pending = { tilt: tiltFromOrientation(event.beta, event.gamma), euler: e };
        const ios = webkitHeading((event as HeadingEvent).webkitCompassHeading);
        if (ios != null) noteHeading(ios);
        else if (event.absolute && event.alpha != null) noteHeading(compassHeading(e));
        schedule();
      };
      // Chrome on Android: the same reading, relative to north, when the phone has a compass chip.
      const onAbsolute = (event: DeviceOrientationEvent) => {
        if (event.alpha == null || event.beta == null || event.gamma == null) return;
        noteHeading(compassHeading({ alpha: event.alpha, beta: event.beta, gamma: event.gamma }));
        schedule();
      };
      const onMotion = (event: DeviceMotionEvent) => {
        const a = event.accelerationIncludingGravity;
        if (!a || a.x == null || a.y == null || a.z == null) return;
        steps = stepReducer(steps, magnitude(a.x, a.y, a.z), event.timeStamp);
        schedule();
      };
      const noSensor = window.setTimeout(() => {
        if (!received && generation.current === gen) halt("unavailable");
      }, NO_SENSOR_AFTER_MS);
      const noCompass = window.setTimeout(() => {
        if (!headingSeen && generation.current === gen) setCompass("none");
      }, NO_SENSOR_AFTER_MS + NO_COMPASS_AFTER_MS);
      const perSecond = window.setInterval(() => {
        if (generation.current !== gen || !received) return;
        setRate(events);
        events = 0;
      }, 1000);

      window.addEventListener("deviceorientation", onOrientation);
      window.addEventListener("deviceorientationabsolute", onAbsolute as EventListener);
      window.addEventListener("devicemotion", onMotion);
      detach.current = () => {
        window.removeEventListener("deviceorientation", onOrientation);
        window.removeEventListener("deviceorientationabsolute", onAbsolute as EventListener);
        window.removeEventListener("devicemotion", onMotion);
        window.clearTimeout(noSensor);
        window.clearTimeout(noCompass);
        window.clearInterval(perSecond);
        if (frame) window.cancelAnimationFrame(frame);
      };
    },
    [halt],
  );

  const start = useCallback(
    (options?: { quiet?: boolean }) => {
      const quiet = options?.quiet === true;
      release();
      const gen = generation.current;
      if (!window.isSecureContext) {
        if (!quiet) setStatus("insecure");
        return;
      }
      if (!("DeviceOrientationEvent" in window)) {
        if (!quiet) setStatus("unavailable");
        return;
      }
      if (!quiet) setStatus("starting");
      setMovement(null);
      setCompass("waiting");
      void requestMotionPermission().then((answer) => {
        if (generation.current !== gen) return;
        if (answer === "granted") {
          if (quiet) setStatus("starting");
          attach(gen);
        } else if (quiet || answer === "prompt") {
          // Needs a tap: wait for the button, no error.
          setStatus("idle");
        } else setStatus("denied");
      });
    },
    [attach, release],
  );

  const stop = useCallback(() => halt("idle"), [halt]);

  useEffect(() => release, [release]);

  return { status, tilt, euler, heading, compass, movement, rate, start, stop };
}
