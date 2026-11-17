import type { ReactNode } from "react";
import type { Gesture } from "../engine/types";

export const GESTURE_LABEL: Record<Gesture, string> = {
  rock: "Rock",
  paper: "Paper",
  scissors: "Scissors",
};

/** The keyboard key for each move. */
export const GESTURE_KEY: Record<Gesture, string> = {
  rock: "R",
  paper: "P",
  scissors: "S",
};

/**
 * Small hand icons for strips, buttons and chips: a fist, a flat hand and two
 * fingers. Drawn on lucide's 24px grid with a 2px stroke so they sit with the
 * rest of the icon set. The big cards use the illustration's hands instead.
 */
export function GestureIcon({ gesture, className }: { gesture: Gesture; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {PATHS[gesture]}
    </svg>
  );
}

const PATHS: Record<Gesture, ReactNode> = {
  // Four knuckles, the thumb folded across the front.
  rock: (
    <>
      <path d="M5.5 11V9a1.75 1.75 0 0 1 3.5 0v1" />
      <path d="M9 10V8.25a1.75 1.75 0 0 1 3.5 0V10" />
      <path d="M12.5 10V8.75a1.75 1.75 0 0 1 3.5 0V10.5" />
      <path d="M16 10.5V10a1.75 1.75 0 0 1 3.5 0v4.5a7 7 0 0 1-7 7h-1a6.5 6.5 0 0 1-6.5-6.5V13a2 2 0 0 1 2-2h4.25a2 2 0 0 1 0 4H9" />
    </>
  ),
  // Four fingers up, the thumb out to the side.
  paper: (
    <>
      <path d="M7 12V5.5a1.75 1.75 0 0 1 3.5 0V11" />
      <path d="M10.5 11V3.75a1.75 1.75 0 0 1 3.5 0V11" />
      <path d="M14 11V5a1.75 1.75 0 0 1 3.5 0v6.5" />
      <path d="M17.5 11.5V8a1.75 1.75 0 0 1 3.5 0v6.5A7.5 7.5 0 0 1 13.5 22h-1a7 7 0 0 1-5.3-2.4l-4-4.6a1.75 1.75 0 0 1 2.6-2.3L7 15" />
    </>
  ),
  // Two fingers in a V, the others folded.
  scissors: (
    <>
      <path d="M8.9 11 6.4 4.6a1.75 1.75 0 0 1 3.3-1.2L12.2 10" />
      <path d="m12.2 10 1.6-6.8a1.75 1.75 0 0 1 3.4.8L15.8 10.6" />
      <path d="M15.8 10.6V10a1.75 1.75 0 0 1 3.5 0v.5" />
      <path d="M19.3 11a1.75 1.75 0 0 1 3.5 0v3a7.5 7.5 0 0 1-7.5 7.5h-2.3a7 7 0 0 1-7-7V13a2 2 0 0 1 2-2h4.25a2 2 0 0 1 0 4H10" />
    </>
  ),
};
