"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SensorStatus } from "./status";

/**
 * What this game keeps from a location fix. Latitude and longitude are never
 * stored, shown or sent: only how sure the phone is, and its speed.
 */
export interface LocationFix {
  /** Radius of the circle the phone is sure you're in, in metres. */
  accuracy: number;
  /** Metres per second, or null when the phone doesn't know. */
  speed: number | null;
}

/**
 * navigator.geolocation.watchPosition, from a tap. The watch is cleared on
 * `stop`, when the page is hidden and on unmount.
 */
export function useGeolocation() {
  const [status, setStatus] = useState<SensorStatus>("idle");
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [fixes, setFixes] = useState(0);
  const watch = useRef<number | null>(null);
  const onVisibility = useRef<(() => void) | null>(null);
  const generation = useRef(0);

  const release = useCallback(() => {
    generation.current += 1;
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    if (onVisibility.current) document.removeEventListener("visibilitychange", onVisibility.current);
    onVisibility.current = null;
  }, []);

  const halt = useCallback(
    (next: SensorStatus) => {
      release();
      setStatus(next);
    },
    [release],
  );

  const start = useCallback(() => {
    release();
    const gen = generation.current;
    if (!window.isSecureContext) {
      setStatus("insecure");
      return;
    }
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }
    setStatus("starting");
    setFix(null);
    setFixes(0);
    let found = false;
    const hide = () => {
      if (document.hidden) halt("idle");
    };
    onVisibility.current = hide;
    document.addEventListener("visibilitychange", hide);
    watch.current = navigator.geolocation.watchPosition(
      (position) => {
        if (generation.current !== gen) return;
        found = true;
        const { accuracy, speed } = position.coords;
        setFix({ accuracy, speed: speed != null && Number.isFinite(speed) ? speed : null });
        setFixes((n) => n + 1);
        setStatus("live");
      },
      (error) => {
        if (generation.current !== gen) return;
        if (error.code === error.PERMISSION_DENIED) halt("denied");
        else if (!found) halt(error.code === error.TIMEOUT ? "timeout" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  }, [halt, release]);

  const stop = useCallback(() => halt("idle"), [halt]);

  useEffect(() => release, [release]);

  return { status, fix, fixes, start, stop };
}
