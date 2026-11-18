"use client";

import { useCallback, useSyncExternalStore } from "react";

/** True while a media query matches. False on the server. */
export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True on phones and tablets (no R, P and S keys there: the same mode plays with on-screen buttons). */
export function useTouchScreen(): boolean {
  return useMedia("(pointer: coarse)");
}

/** The booth laptop layout: you and the AI side by side. */
export function useWideLayout(): boolean {
  return useMedia("(min-width: 1024px)");
}

/** "Play with keys", or "Play with buttons" on a touch screen. */
export function withoutCameraLabel(touch: boolean): string {
  return touch ? "Play with buttons" : "Play with keys";
}
