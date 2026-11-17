"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { batteryGetter, hasMediaDevices, networkInformation } from "./browser";

/**
 * Device facts for layout and for choosing live sensors or simulations. All
 * of them return a safe default on the server (null or false), and the
 * screens that depend on them only render after the visitor has tapped.
 */

export function useMediaQuery(query: string): boolean | null {
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
    () => null,
  );
}

/** Wide and tall enough to draw a phone beside its controls: the booth laptop, a tablet. */
export const FRAMED_QUERY = "(min-width: 768px) and (min-height: 560px)";

const subscribeResize = (onChange: () => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};

export function useViewportHeight(): number {
  return useSyncExternalStore(
    subscribeResize,
    () => window.innerHeight,
    () => 0,
  );
}

export function useViewportWidth(): number {
  return useSyncExternalStore(
    subscribeResize,
    () => window.innerWidth,
    () => 0,
  );
}

export interface Capabilities {
  /** A touch-first device: a phone or tablet. */
  touch: boolean;
  secure: boolean;
  /** Real tilt sensors are worth trying (touch devices only: laptops report nothing). */
  motion: boolean;
  /** Real location is worth trying (touch devices only: the booth laptop's location isn't the visitor's). */
  location: boolean;
  /** getUserMedia exists: camera and microphone can be tried. */
  media: boolean;
  battery: boolean;
  connection: boolean;
}

const NO_CAPABILITIES: Capabilities = {
  touch: false,
  secure: false,
  motion: false,
  location: false,
  media: false,
  battery: false,
  connection: false,
};

let cached: Capabilities | null = null;

function detect(): Capabilities {
  if (cached) return cached;
  const touch = window.matchMedia("(pointer: coarse)").matches;
  cached = {
    touch,
    secure: window.isSecureContext,
    motion: touch && "DeviceOrientationEvent" in window,
    location: touch && "geolocation" in navigator,
    media: hasMediaDevices(),
    battery: batteryGetter() !== null,
    connection: networkInformation() !== null,
  };
  return cached;
}

const subscribeNever = () => () => {};

export function useCapabilities(): Capabilities {
  return useSyncExternalStore(subscribeNever, detect, () => NO_CAPABILITIES);
}

/**
 * The latest value, released at most once every `ms`. For aria-live text and
 * other things people can't take in at sensor speed.
 */
export function useThrottled<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value);
  const lastAt = useRef(0);
  useEffect(() => {
    const wait = Math.max(0, lastAt.current + ms - performance.now());
    const id = window.setTimeout(() => {
      lastAt.current = performance.now();
      setShown(value);
    }, wait);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return shown;
}
