"use client";

import { motion } from "motion/react";
import type { AnsweredStep } from "../engine/machine";
import { binaryQuestionText } from "../engine/prediction-engine";
import { formatNumber } from "../engine/ranges";
import { AnswerChip } from "./bits";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Bars never vanish: one number out of 1,000 still gets a visible sliver. */
const share = (count: number, start: number) => Math.max(count / start, 0.012);

/**
 * The visitor's own path: every question, their answer and how many numbers
 * were left after it, as bars that shrink by about half each time
 * (100, 50, 25, 13, 7, 4, 2, 1). Each bar grows from the one above it.
 */
export function PathBars({ start, steps, found }: { start: number; steps: readonly AnsweredStep[]; found: number }) {
  return (
    <section aria-labelledby="mind-reader-path" className="flex flex-col gap-6 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="mind-reader-path" className="type-title-2 text-fg">
          Your answers
        </h2>
        <p className="type-body max-w-[40rem] text-fg-muted">Each bar shows how many numbers could still be yours after that answer.</p>
      </div>

      <ol className="flex flex-col gap-4">
        <Row index={0} label="At the start" from={1} to={1} count={start} />
        {steps.map((step, i) => (
          <Row
            key={i}
            index={i + 1}
            label={binaryQuestionText(step.question)}
            answer={step.answer}
            from={share(step.before, start)}
            to={share(step.candidates.length, start)}
            count={step.candidates.length}
          />
        ))}
      </ol>

      <p className="type-body text-fg">
        Only <span className="font-semibold text-game">{formatNumber(found)}</span> fit every answer.
      </p>
    </section>
  );
}

function Row({
  index,
  label,
  answer,
  from,
  to,
  count,
}: {
  index: number;
  label: string;
  answer?: boolean;
  from: number;
  to: number;
  count: number;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-4 gap-y-2 md:grid-cols-[minmax(0,23rem)_minmax(0,1fr)_3.5rem]">
      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 md:col-span-1">
        <span aria-hidden className="type-label w-5 shrink-0 tabular-nums text-fg-subtle">
          {index === 0 ? "" : index}
        </span>
        <span className="type-body min-w-0 text-fg">{label}</span>
        {answer === undefined ? null : <AnswerChip yes={answer} />}
      </div>
      <span aria-hidden className="block h-3 overflow-hidden rounded-full bg-fg/10">
        <motion.span
          className="block h-full origin-left rounded-full bg-game"
          initial={{ scaleX: from }}
          animate={{ scaleX: to }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.15 + Math.min(index, 4) * 0.04 }}
        />
      </span>
      <span className="type-body text-right font-semibold tabular-nums text-fg">
        {formatNumber(count)}
        <span className="sr-only"> {count === 1 ? "number" : "numbers"} left</span>
      </span>
    </li>
  );
}
