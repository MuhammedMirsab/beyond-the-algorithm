"use client";

import { useEffect, useRef } from "react";

/**
 * Booth helper: calls `onIdle` after `ms` without any pointer, key, touch or
 * wheel input. Use it on intro and result screens so an abandoned game resets
 * for the next visitor. Never enable it while someone is playing with only a
 * camera (face or hand games send no input events).
 */
export function useIdle(onIdle: () => void, { ms = 90_000, enabled = true }: { ms?: number; enabled?: boolean } = {}) {
  const callback = useRef(onIdle);
  useEffect(() => {
    callback.current = onIdle;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer = window.setTimeout(() => callback.current(), ms);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback.current(), ms);
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [ms, enabled]);
}
