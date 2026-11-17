"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FEATURE_COUNT, averageShape } from "../engine/features";
import type { Sounds } from "../engine/sound";
import { ExampleThumb, PoseFigure } from "./figures";
import type { Examples, Move, Example } from "./model";

/** How long the examples take to fold into one pattern on screen. Training itself is instant. */
const SHOW_MS = 1100;
const EASE_MOVE = [0.77, 0, 0.175, 1] as const;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * Training, shown honestly: the maths (one average per move) already ran in a
 * few milliseconds; this shows the same thing at human speed: each move's
 * examples fold into one averaged skeleton.
 */
export function TrainStep({
  moves,
  examples,
  trainMs,
  onTest,
  onAddMore,
  sounds,
}: {
  moves: readonly [Move, Move];
  examples: Examples;
  /** Measured time the training took. */
  trainMs: number;
  onTest: () => void;
  onAddMore: () => void;
  sounds: () => Sounds | null;
}) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDone(true);
      sounds()?.success();
    }, SHOW_MS);
    return () => clearTimeout(timer);
  }, [sounds]);

  const legs = moves.some((m) => examples[m.id].some((e) => e.shape?.slice(9).some((p) => p.visible)));
  const total = examples.a.length + examples.b.length;
  const ms = trainMs < 1 ? "under 1 ms" : `${Math.round(trainMs)} ms`;

  return (
    <section className="mx-auto flex w-full max-w-[69rem] flex-col gap-8 px-4 pb-12 pt-4 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3">
        <span className="type-label text-game">{done ? `Trained in ${ms}` : "Training"}</span>
        <h1 data-step-focus tabIndex={-1} className="type-display-2 text-fg outline-none">
          It averaged each move into one pattern
        </h1>
        <p className="type-body-lg max-w-[40rem] text-fg-muted">
          Your {total} examples became {total} lists of {FEATURE_COUNT} numbers. For each move it worked out the average,
          and it keeps every example to compare with.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {moves.map((move) => (
          <PatternCard key={move.id} move={move} examples={examples[move.id]} legs={legs} done={done} />
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="game" size="lg" arrow onClick={onTest}>
          Test it
        </Button>
        <Button variant="secondary" size="lg" onClick={onAddMore}>
          Add more examples
        </Button>
      </div>
    </section>
  );
}

const COLS = 5;
/** Thumbnail size and gap, as a share of the 4:3 panel (so thumbnails stay 4:3 too). */
const CELL = 16;
const GAP = 2;

function PatternCard({ move, examples, legs, done }: { move: Move; examples: Example[]; legs: boolean; done: boolean }) {
  const reduce = useReducedMotion();
  const n = examples.length;
  const rows = Math.ceil(n / COLS);
  const top0 = (100 - (rows * CELL + (rows - 1) * GAP)) / 2;
  const left0 = (100 - (COLS * CELL + (COLS - 1) * GAP)) / 2;
  const average = averageShape(examples.map((e) => e.shape));

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-ring">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="type-title-2 text-fg">{move.name}</h2>
        <span className="type-label tabular-nums text-fg-subtle">
          {n} examples, {done ? "1 pattern" : "averaging"}
        </span>
      </div>
      <div className="dot-field relative aspect-[4/3] overflow-hidden rounded-md bg-sunken">
        {examples.map((example, i) => {
          const left = left0 + (i % COLS) * (CELL + GAP);
          const top = top0 + Math.floor(i / COLS) * (CELL + GAP);
          // Distance to the centre, in thumbnail widths (percent of the element itself).
          const dx = ((50 - (left + CELL / 2)) / CELL) * 100;
          const dy = ((50 - (top + CELL / 2)) / CELL) * 100;
          return (
            <motion.div
              key={example.id}
              aria-hidden
              className="absolute overflow-hidden rounded-sm"
              style={{ left: `${left}%`, top: `${top}%`, width: `${CELL}%`, height: `${CELL}%` }}
              initial={{ x: "0%", y: "0%", scale: 1, opacity: 1 }}
              animate={reduce ? { opacity: 0 } : { x: `${dx}%`, y: `${dy}%`, scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.55, delay: 0.25 + Math.min(i, 4) * 0.04, ease: EASE_MOVE }}
            >
              <ExampleThumb thumbnail={example.thumbnail} keypoints={example.keypoints} ratio={example.ratio} />
            </motion.div>
          );
        })}
        <motion.div
          className="absolute inset-0 p-[5%]"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, duration: 0.4, ease: EASE_OUT }}
        >
          <PoseFigure shape={average} legs={legs} label={`The average ${move.name} pose of ${n} examples`} className="size-full" />
        </motion.div>
      </div>
    </div>
  );
}
