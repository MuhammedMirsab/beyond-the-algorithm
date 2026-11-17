"use client";

import { useEffect, useRef } from "react";

/** Where typing happens: shortcuts never fire there. */
const TYPING = "input, textarea, select, [contenteditable='true'], [role='tab'], [role='slider'], [role='switch']";
/** Enter and Space already click these. */
const ACTIVATES = "button, a[href], [role='button']";

type KeyMap = Partial<Record<string, () => void>>;

/**
 * Booth keyboard shortcuts. Keys are lower-case letters or KeyboardEvent.key
 * names ("ArrowLeft", "Enter"). Held keys don't repeat, and nothing fires
 * while the visitor is typing in a field.
 */
export function useKeys(map: KeyMap, enabled = true) {
  const latest = useRef(map);
  useEffect(() => {
    latest.current = map;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(TYPING)) return;
      if ((e.key === "Enter" || e.key === " ") && target?.closest(ACTIVATES)) return;
      const run = latest.current[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!run) return;
      e.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/**
 * A new screen starts at the top, with focus on its heading, so keyboard and
 * screen reader users land on the new content instead of the old button.
 * The heading needs tabIndex={-1}.
 */
export function useScreenFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}

/**
 * Same as useScreenFocus, for a wrapper whose heading comes from a shared
 * component (GameIntro, ResultPanel). Off for the first screen of a page
 * load, so arriving on the page never steals focus.
 */
export function useHeadingFocus<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!enabled) return;
    window.scrollTo({ top: 0 });
    const heading = ref.current?.querySelector<HTMLElement>("h1");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }, [enabled]);
  return ref;
}
