"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readJSON, storageKey, subscribeKey, writeJSON } from "./storage";

/**
 * One sound switch for the whole arcade. Every game's audio engine should
 * check `isSoundOn()` before playing, and the shell's sound button flips it.
 */
const KEY = storageKey("arcade", "sound");

export function isSoundOn(): boolean {
  return readJSON<boolean>(KEY, true);
}

export function setSoundOn(on: boolean) {
  writeJSON(KEY, on);
}

export function subscribeSound(onChange: () => void) {
  return subscribeKey(KEY, onChange);
}

export function useSoundOn(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribeSound, isSoundOn, () => true);
  const set = useCallback((next: boolean) => setSoundOn(next), []);
  return [on, set];
}
