"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";

/** Short words that read well when written in the air. */
export const TARGET_WORDS = ["HI", "CAT", "EDEX", "2026"] as const;

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

export function TargetPicker({ target, onTarget }: { target: string | null; onTarget: (word: string | null) => void }) {
  const labelId = useId();
  return (
    <div className="flex flex-col items-center gap-3">
      <span id={labelId} className="type-label text-fg-subtle">
        Try writing
      </span>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap justify-center gap-2">
        {TARGET_WORDS.map((word) => (
          <ToggleChip key={word} pressed={target === word} onClick={() => onTarget(target === word ? null : word)} className="min-w-14 justify-center">
            {word}
          </ToggleChip>
        ))}
      </div>
    </div>
  );
}

/** Centre of the empty writing area: what to do, and words to try. */
export function EmptyState({
  camera,
  target,
  onTarget,
  className,
}: {
  camera: boolean;
  target: string | null;
  onTarget: (word: string | null) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex max-w-[30rem] flex-col items-center gap-7 text-center", className)}>
      <div className="flex flex-col gap-2">
        <p className="type-title-2 text-fg">{camera ? "Write big capitals in the air" : "Write here with your mouse or finger"}</p>
        <p className="type-body text-fg-muted">
          {camera
            ? "Pinch between letters, and leave a bigger gap between words. Then choose Read my writing."
            : "Big capitals, one letter at a time, read best. Then choose Read my writing."}
        </p>
      </div>
      <div className="pointer-events-auto">
        <TargetPicker target={target} onTarget={onTarget} />
      </div>
    </div>
  );
}

/** The chosen word, shown while writing so visitors remember what they're aiming for. */
export function TargetPill({ target, onClear }: { target: string; onClear: () => void }) {
  return (
    <div className="pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full bg-surface pl-4 pr-1 shadow-ring">
      <span className="type-label text-fg-subtle">Write</span>
      <span className="type-body font-semibold text-fg">{target}</span>
      <IconButton label="Clear the word to write" icon={<X />} variant="ghost" size="sm" onClick={onClear} className="size-8" />
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
