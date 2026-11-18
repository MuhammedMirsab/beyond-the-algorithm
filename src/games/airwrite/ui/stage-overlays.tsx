"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";

/**
 * Short words that read well when written in the air. Shown in sentence case
 * like all copy (EDEX is the exhibition's own name); the instructions ask for
 * big capitals, and matching ignores case.
 */
export const TARGET_WORDS = ["Hi", "Cat", "EDEX", "2026"] as const;
/** What a new visitor is asked to write: two letters, the quickest first success. */
export const FIRST_WORD = TARGET_WORDS[0];

export interface Target {
  word: string;
  /** The visitor picked it (a suggested word never says "not quite"). */
  chosen: boolean;
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Fades content in after a short delay, so states that pass quickly never flash. */
export function Delayed({ children, delay = 0.35, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: EASE_OUT, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function TargetPicker({ target, onTarget }: { target: Target | null; onTarget: (target: Target | null) => void }) {
  const labelId = useId();
  return (
    <div className="flex flex-col items-center gap-3">
      <span id={labelId} className="type-label text-fg-subtle">
        Or pick a word
      </span>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap justify-center gap-2">
        {TARGET_WORDS.map((word) => {
          const on = target?.word === word;
          return (
            <ToggleChip key={word} pressed={on} onClick={() => onTarget(on ? null : { word, chosen: true })} className="min-w-14 justify-center">
              {word}
            </ToggleChip>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Centre of the empty writing area: one concrete thing to do ("Write Hi"),
 * and other words for people who want them. It goes as soon as there is ink.
 */
export function EmptyState({
  camera,
  handVisible,
  target,
  onTarget,
  className,
}: {
  camera: boolean;
  /** The camera sees a hand right now. */
  handVisible: boolean;
  target: Target | null;
  onTarget: (target: Target | null) => void;
  className?: string;
}) {
  const word = target?.word;
  const where = camera ? "in the air" : "here";
  const waiting = camera && !handVisible;
  // Also the key that swaps the heading when it changes.
  const title = waiting ? "Raise one hand to start" : word ? `Write ${word} ${where}` : `Write a word ${where}`;
  const text = camera
    ? handVisible
      ? "Big capitals. Pinch thumb and finger to lift the pen between letters."
      : "Point with your index finger. Its tip is the pen."
    : "Use your mouse or a finger. Big capitals, one letter at a time.";
  return (
    <div className={cn("flex max-w-[32rem] flex-col items-center gap-7 text-center", className)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={title}
          className="flex flex-col gap-2"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          <p className="type-display-2 text-fg">
            {!waiting && word ? (
              <>
                Write <span className="text-game">{word}</span> {where}
              </>
            ) : (
              title
            )}
          </p>
          <p className="type-body-lg text-fg-muted">{text}</p>
        </motion.div>
      </AnimatePresence>
      <div className="pointer-events-auto">
        <TargetPicker target={target} onTarget={onTarget} />
      </div>
    </div>
  );
}

/** The word being written, shown while writing so visitors remember what they're aiming for. */
export function TargetPill({ target, onClear }: { target: string; onClear: () => void }) {
  return (
    <div className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-surface pl-4 pr-1 shadow-ring">
      <span className="type-label text-fg-subtle">Write</span>
      <span className="type-body font-semibold text-fg">{target}</span>
      <IconButton label="Write any word instead" icon={<X />} variant="ghost" size="sm" onClick={onClear} className="size-9" />
    </div>
  );
}

/** 3, 2, 1: wherever the fingertip is at the end becomes the middle of the writing area. */
export function CentringCountdown({ count, onCancel, className }: { count: number; onCancel: () => void; className?: string }) {
  return (
    <div className={cn("grid place-items-center bg-canvas/70 px-4", className)}>
      <div role="status" aria-live="polite" className="flex w-full max-w-[24rem] flex-col items-center gap-4 rounded-xl bg-surface p-8 text-center shadow-ring">
        <span className="type-label text-game">Centring the writing area</span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={count}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="type-score text-fg"
          >
            {Math.max(count, 1)}
          </motion.span>
        </AnimatePresence>
        <p className="type-body text-fg-muted">Hold your fingertip where the middle of the writing area should be.</p>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
