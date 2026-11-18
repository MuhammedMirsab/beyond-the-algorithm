"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { Check, X } from "lucide-react";
import { useMemo, useRef } from "react";
import { cn } from "@/lib/cn";
import type { AnsweredStep } from "../engine/machine";
import { getCandidatesForMax, binaryQuestionText } from "../engine/prediction-engine";
import { formatNumber, RANGE_MAX, type RangeId } from "../engine/ranges";
import { AnswerChip } from "./bits";
import { EASE_OUT } from "./motion";

/** Up to this many numbers a row shows every number in its own labelled cell. */
const LABELLED = 12;
/** Each row starts this long after the one above it (seconds). */
const ROW_BEAT = 0.32;

interface Row {
  question: AnsweredStep["question"];
  answer: boolean;
  before: readonly number[];
  kept: ReadonlySet<number>;
}

/**
 * The visitor's own search, replayed one answer per row. Each row is the list
 * of numbers that were still possible before that answer, stretched to the
 * same width, so every row reads as "this list, cut in half". The half the
 * answer crossed out dims; the next row zooms in on the half that was kept.
 *
 * `pin` marks one number in every row it was still in: the found number, or
 * the number the visitor says they were thinking of.
 */
export function SearchReplay({
  range,
  steps,
  pin,
  highlight = null,
  className,
}: {
  range: RangeId;
  steps: readonly AnsweredStep[];
  pin: number | null;
  /** A row to pick out: the first answer that didn't fit. */
  highlight?: number | null;
  className?: string;
}) {
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.25 });
  const reduced = useReducedMotion() ?? false;
  const play = inView || reduced;

  const rows = useMemo<Row[]>(() => {
    const all = getCandidatesForMax(RANGE_MAX[range]);
    return steps.map((step, i) => ({
      question: step.question,
      answer: step.answer,
      before: i === 0 ? all : steps[i - 1].candidates,
      kept: new Set(step.candidates),
    }));
  }, [range, steps]);

  return (
    <ol ref={ref} className={cn("flex flex-col gap-4 sm:gap-3", className)}>
      {rows.map((row, i) => (
        <ReplayRow key={i} index={i} row={row} pin={pin} play={play} reduced={reduced} highlight={i === highlight} />
      ))}
    </ol>
  );
}

function ReplayRow({
  index,
  row,
  pin,
  play,
  reduced,
  highlight,
}: {
  index: number;
  row: Row;
  pin: number | null;
  play: boolean;
  reduced: boolean;
  highlight: boolean;
}) {
  const { before, kept } = row;
  const after = kept.size;
  const pinIndex = pin === null ? -1 : before.indexOf(pin);
  const pinKept = pin !== null && kept.has(pin);
  const delay = reduced ? 0 : 0.15 + index * ROW_BEAT;

  return (
    <motion.li
      className={cn(
        "grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-md md:grid-cols-[1.25rem_minmax(0,19rem)_minmax(0,1fr)_4.5rem]",
        highlight && "-mx-3 bg-game-soft px-3 py-3 ring-2 ring-game",
      )}
      initial={{ opacity: 0 }}
      animate={play ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT, delay }}
    >
      <span aria-hidden className="type-label tabular-nums text-fg-subtle">
        {index + 1}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="type-body min-w-0 text-fg">{binaryQuestionText(row.question)}</span>
        <AnswerChip yes={row.answer} />
        {pinIndex >= 0 && pin !== null ? (
          <span className="sr-only">{pinKept ? `Fits ${formatNumber(pin)}.` : `Doesn't fit ${formatNumber(pin)}.`}</span>
        ) : null}
      </span>
      <span className="type-body text-right font-semibold tabular-nums text-fg md:order-last">
        {formatNumber(after)}
        <span className="type-caption ml-1 font-medium text-fg-subtle">left</span>
      </span>
      <div className="col-span-3 min-w-0 md:col-span-1 md:col-start-3 md:row-start-1">
        <Strip before={before} kept={kept} pinIndex={pinIndex} pinKept={pinKept} play={play} delay={delay + 0.18} />
      </div>
    </motion.li>
  );
}

/**
 * One row's list as a strip of cells. Small lists get a labelled cell per
 * number; long ones are drawn as thin bars, and stretches of every other
 * number blend into a half-tone band.
 */
function Strip({
  before,
  kept,
  pinIndex,
  pinKept,
  play,
  delay,
}: {
  before: readonly number[];
  kept: ReadonlySet<number>;
  pinIndex: number;
  pinKept: boolean;
  play: boolean;
  delay: number;
}) {
  const n = before.length;
  const first = before[0] ?? 0;
  const last = before[n - 1] ?? 0;
  const dim = { opacity: play ? 0.16 : 1 };
  const dimTransition = { duration: 0.45, ease: EASE_OUT, delay };

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        {n <= LABELLED ? (
          <div aria-hidden className="flex h-8 gap-1">
            {before.map((v, i) => {
              const stays = kept.has(v);
              return (
                <span key={v} className="relative flex-1">
                  <motion.span
                    className="absolute inset-0 grid place-items-center rounded-[6px] bg-game text-[0.75rem] font-semibold tabular-nums text-game-ink"
                    initial={{ opacity: 1 }}
                    animate={stays ? { opacity: 1 } : dim}
                    transition={dimTransition}
                  >
                    {formatNumber(v)}
                  </motion.span>
                  {i === pinIndex ? <PinRing kept={pinKept} /> : null}
                </span>
              );
            })}
          </div>
        ) : (
          <svg aria-hidden viewBox={`0 0 ${n} 10`} preserveAspectRatio="none" className="block h-8 w-full overflow-visible">
            <motion.g initial={{ opacity: 1 }} animate={dim} transition={dimTransition}>
              {segments(before, (v) => !kept.has(v)).map(([start, length]) => (
                <rect key={`o${start}`} x={start} y={0} width={length - (n <= 200 ? 0.22 : 0)} height={10} className="fill-game" />
              ))}
            </motion.g>
            {segments(before, (v) => kept.has(v)).map(([start, length]) => (
              <rect key={`k${start}`} x={start} y={0} width={length - (n <= 200 ? 0.22 : 0)} height={10} className="fill-game" />
            ))}
          </svg>
        )}
        {n > LABELLED && pinIndex >= 0 ? <PinTick at={(pinIndex + 0.5) / n} kept={pinKept} /> : null}
      </div>
      <div aria-hidden className="flex justify-between">
        <span className="type-caption tabular-nums text-fg-subtle">{formatNumber(first)}</span>
        <span className="type-caption tabular-nums text-fg-subtle">{formatNumber(last)}</span>
      </div>
    </div>
  );
}

/**
 * Index runs of a list where `test` holds, as [start, length]. Runs of single
 * cells (every other number) stay separate, so stripes stay stripes.
 */
function segments(list: readonly number[], test: (v: number) => boolean): [number, number][] {
  const runs: [number, number][] = [];
  list.forEach((v, i) => {
    if (!test(v)) return;
    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun[0] + lastRun[1] === i) lastRun[1] += 1;
    else runs.push([i, 1]);
  });
  return runs;
}

/** The visitor's number in a labelled row: a ring, or a cross where an answer ruled it out. */
function PinRing({ kept }: { kept: boolean }) {
  return (
    <span aria-hidden className="pointer-events-none absolute -inset-[3px] rounded-[8px] ring-2 ring-fg">
      <span className="absolute -right-2 -top-2.5 grid size-5 place-items-center rounded-full bg-fg text-canvas [&_svg]:size-3">
        {kept ? <Check strokeWidth={3.5} /> : <X strokeWidth={3.5} />}
      </span>
    </span>
  );
}

/** The visitor's number in a long row: a marker above its place on the strip. */
function PinTick({ at, kept }: { at: number; kept: boolean }) {
  return (
    <span aria-hidden className="pointer-events-none absolute -top-1 bottom-[-4px] w-0" style={{ left: `${at * 100}%` }}>
      <span className="absolute inset-y-0 -left-px w-0.5 rounded-full bg-fg" />
      <span className="absolute -top-2.5 left-0 grid size-5 -translate-x-1/2 place-items-center rounded-full bg-fg text-canvas [&_svg]:size-3">
        {kept ? <Check strokeWidth={3.5} /> : <X strokeWidth={3.5} />}
      </span>
    </span>
  );
}
