"use client";

import { LEVELS } from "../engine/game/levels";
import { LEVEL_COUNT, type MachineState } from "../play/machine";

/** One sentence per state change, read politely by screen readers. */
function message(m: MachineState): string {
  const level = LEVELS[m.levelIndex];
  switch (m.phase) {
    case "calibrate":
      return "Face check. Look straight at the screen for a second.";
    case "practice":
      return "Practice. Try each move. You can’t lose lives here.";
    case "level-intro":
      return m.levelReady ? `Level ${m.levelIndex + 1} of ${LEVEL_COUNT}: ${level.name}. It starts in a moment.` : "";
    case "playing":
      return `Level ${m.levelIndex + 1} started.`;
    case "paused":
      return "Paused.";
    case "face-lost":
      return "Can’t see your face. The game is paused until the camera finds you.";
    case "level-complete":
      return `Level ${m.levelIndex + 1} complete.`;
    case "game-over":
      return "Out of lives.";
    case "victory":
      return "All three levels complete.";
    default:
      return "";
  }
}

export function Announcer({ machine }: { machine: MachineState }) {
  return (
    <p aria-live="polite" className="sr-only">
      {message(machine)}
    </p>
  );
}
