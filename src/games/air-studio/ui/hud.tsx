"use client";

import { AnimatePresence, motion } from "motion/react";
import { MousePointer2, TriangleAlert } from "lucide-react";
import { Kbd } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { instrumentInfo } from "../engine/instruments/index";
import { guitarRoles } from "../engine/instruments/guitar";
import type { InstrumentId } from "../engine/settings";
import type { InputMode } from "../play/session";
import { useCoarsePointer, type LiveHands } from "./hooks";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

function HandDot({ label, seen }: { label: string; seen: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={cn("size-2.5 rounded-full transition-colors duration-150", seen ? "bg-game" : "bg-fg-faint")} />
      <span className={cn("type-small font-semibold", seen ? "text-fg" : "text-fg-subtle")}>
        {label}
        <span className="sr-only">{seen ? " in view" : " not in view"}</span>
      </span>
    </span>
  );
}

/** What the camera sees, in words, so a missing hand is obvious. */
export function HandStatus({ live }: { live: LiveHands }) {
  return (
    <div className="pointer-events-auto inline-flex h-10 items-center gap-4 rounded-full bg-canvas/85 px-4 shadow-ring">
      <HandDot label="Left" seen={live.left} />
      <HandDot label="Right" seen={live.right} />
    </div>
  );
}

/** Mouse mode: which keys stand in for the hands. */
export function MouseKeys() {
  const touch = useCoarsePointer();
  return (
    // Never wraps: the key hints only appear where the row has room for them beside the note readout.
    <div className="pointer-events-auto inline-flex h-10 max-w-full items-center gap-3 whitespace-nowrap rounded-full bg-canvas/85 pl-3.5 pr-4 shadow-ring">
      <MousePointer2 aria-hidden className="size-4 shrink-0 text-game" />
      <span className="type-small truncate font-semibold text-fg">{touch ? "Drag a finger: it's the right hand" : "Your mouse is the right hand"}</span>
      <span className="hidden shrink-0 items-center gap-1.5 xl:inline-flex">
        <span aria-hidden className="h-4 w-px bg-line-strong" />
        <Kbd>Space</Kbd>
        <span className="type-small text-fg-muted">fist</span>
        <Kbd className="ml-1.5">1</Kbd>
        <span className="type-small text-fg-muted">to</span>
        <Kbd>6</Kbd>
        <span className="type-small text-fg-muted">left hand</span>
      </span>
      <span className="hidden shrink-0 items-center gap-1.5 2xl:inline-flex">
        <Kbd className="ml-1.5">0</Kbd>
        <span className="type-small text-fg-muted">hides it</span>
      </span>
    </div>
  );
}

/** The note or chord sounding now, big enough to read from the queue. */
export function Readout({ text }: { text: string }) {
  return (
    <div aria-hidden className="flex h-12 items-center justify-center">
      <AnimatePresence mode="popLayout" initial={false}>
        {text ? (
          <motion.span
            key={text}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.12, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            className="type-title-2 whitespace-nowrap rounded-full bg-canvas/85 px-5 py-1.5 tabular-nums text-fg shadow-ring"
          >
            {text}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** The three ways to play the current instrument, in one line. */
export function HowToPlay({ instrument, leftHanded, simulated }: { instrument: InstrumentId; leftHanded: boolean; simulated: boolean }) {
  const info = instrumentInfo(instrument);
  let how = info.how;
  if (instrument === "guitar") {
    const fret = guitarRoles(leftHanded).fret.toLowerCase();
    const pick = !simulated
      ? `Raise or lower your ${fret} hand to pick a chord.`
      : fret === "left"
        ? "Press 1 to 6 to move your left hand and pick a chord."
        : "Move the mouse up or down to pick a chord.";
    how = [pick, how[1], how[2]];
  }
  // One line, always: if this row grew or shrank, the instrument under the visitor's hands would move.
  return (
    <ol className="type-small flex min-w-0 flex-nowrap items-center justify-center gap-x-4 overflow-hidden text-fg-muted">
      {how.map((line, i) => (
        <li key={line} className={cn("min-w-0 items-baseline gap-2", i === 0 ? "flex" : "hidden shrink-0 xl:flex")}>
          <span aria-hidden className="font-mono text-[0.75rem] font-semibold text-game">
            {i + 1}
          </span>
          <span className="truncate">{line}</span>
        </li>
      ))}
    </ol>
  );
}

export type StageWarning = "dark" | "unsteady" | "no-hands" | null;

/** A camera problem worth saying out loud, from the camera's own numbers. */
export function stageWarning(mode: InputMode | null, live: LiveHands): StageWarning {
  if (mode !== "camera" || !live.fps) return null;
  if (live.brightness < 55) return "dark";
  if ((live.left || live.right) && (live.detectRate < 0.6 || live.fps < 14)) return "unsteady";
  if (live.noHandsFor > 2500) return "no-hands";
  return null;
}

const WARNING_COPY: Record<Exclude<StageWarning, null>, string> = {
  dark: "It's too dark for the camera to see your hands. Face a light.",
  unsteady: "Tracking is unsteady. More light, or a plain background behind you, helps.",
  "no-hands": "Raise your hands so the camera can see them.",
};

export function Warning({ warning }: { warning: Exclude<StageWarning, null> }) {
  return (
    <p role="status" className="type-small inline-flex h-9 max-w-full items-center gap-2 rounded-full bg-canvas/90 px-4 font-semibold text-warning shadow-ring">
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      <span className="truncate">{WARNING_COPY[warning]}</span>
    </p>
  );
}

/** The machine's own numbers: hands found, frames a second, where it runs. */
export function MachineReadout({ mode, live }: { mode: InputMode | null; live: LiveHands }) {
  const hands = (live.left ? 1 : 0) + (live.right ? 1 : 0);
  const text =
    mode === "mouse"
      ? `Simulated hand · ${live.fps || 60} fps`
      : live.fps
        ? `${hands} ${hands === 1 ? "hand" : "hands"} · ${live.fps} fps · ${live.delegate ?? "GPU"}`
        : "Starting";
  return <span className="type-label hidden rounded-full bg-canvas/85 px-3 py-1.5 tabular-nums text-fg-subtle shadow-ring md:inline-flex">{text}</span>;
}
