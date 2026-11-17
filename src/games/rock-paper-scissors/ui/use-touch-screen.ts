"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getTouch = () => window.matchMedia(QUERY).matches;
const getServerTouch = () => false;

/** True on phones and tablets (no R, P and S keys there: the same mode plays with on-screen buttons). */
export function useTouchScreen(): boolean {
  return useSyncExternalStore(subscribe, getTouch, getServerTouch);
}

/** "Play with keys", or "Play with buttons" on a touch screen. */
export function withoutCameraLabel(touch: boolean): string {
  return touch ? "Play with buttons" : "Play with keys";
}
