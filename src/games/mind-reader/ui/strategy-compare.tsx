"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/cn";
import { middleStrategySteps, numberRange } from "../engine/game-engine";
import type { GuessResult, HumanState } from "../engine/human";
import { formatNumber } from "../engine/ranges";
import { EASE_OUT } from "./motion";

interface Row {
  guess: number;
  low: number;
  high: number;
  result: GuessResult;
  before: number;
  after: number;
}

const count = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** A guess that crosses out between 35% and 65% of what was left counts as "about half". */
function aboutHalf(row: Row): boolean {
  if (row.result === "correct" || row.before <= 2) return true;
  const out = (row.before - row.after) / row.before;
  return out >= 0.35 && out <= 0.65;
}

/**
 * The visitor's guesses next to "always guess the middle", on the same
 * number line. Each row shows what was still possible before a guess, where
 * the guess landed, and the part it crossed out. The middle always crosses
 * out half; a guess far from the middle crosses out a lot or very little,
 * depending on luck.
 */
export function StrategyCompare({ human }: { human: HumanState }) {
  const { max, maxGuesses, label } = numberRange(human.range);
  const won = human.status === "won";
  const mine: Row[] = human.guesses.map((g) => ({ guess: g.value, low: g.low, high: g.high, result: g.result, before: g.before, after: g.after }));
  const middle: Row[] = middleStrategySteps(human.secret, 1, max).map((s) => ({
    guess: s.guess,
    low: s.low,
    high: s.high,
    result: s.result,
    before: s.before,
    after: s.after,
  }));
  const n = mine.length;
  const m = middle.length;
  const halves = mine.filter((r) => r.result !== "correct").filter(aboutHalf).length;
  const cuts = mine.filter((r) => r.result !== "correct").length;
  const never = `The middle never needs more than ${maxGuesses} for any number from ${label}.`;

  let summary: string;
  if (!won) summary = `Guessing the middle would have found ${formatNumber(human.secret)} in ${count(m, "guess", "guesses")}. ${never}`;
  else if (n < m) summary = `You beat the middle: ${n} against ${m}. Some of that was luck. ${never}`;
  else if (n === m) summary = `You matched the middle: ${count(n, "guess", "guesses")} each. ${never}`;
  else summary = `Guessing the middle would have found it in ${count(m, "guess", "guesses")}. ${never}`;

  return (
    <section aria-labelledby="mind-reader-compare" className="flex flex-col gap-6 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="mind-reader-compare" className="type-title-2 text-fg">
          Your guesses against the middle
        </h2>
        <p className="type-body max-w-[44rem] text-fg-muted">
          {summary}
          {cuts >= 2 ? ` ${halves} of your ${cuts} misses cut what was left about in half.` : ""}
        </p>
      </div>
      <div className="grid gap-8 md:grid-cols-2 md:gap-10">
        <Column title="You" rows={mine} max={max} secret={human.secret} />
        <Column title="Always the middle" rows={middle} max={max} secret={human.secret} />
      </div>
    </section>
  );
}

function Column({ title, rows, max, secret }: { title: string; rows: readonly Row[]; max: number; secret: number }) {
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduced = useReducedMotion() ?? false;
  const play = inView || reduced;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="type-label text-fg-subtle">{title}</h3>
      <ol ref={ref} className="flex flex-col gap-2.5">
        {rows.map((row, i) => (
          <StrategyRow key={i} row={row} max={max} secret={secret} play={play} delay={reduced ? 0 : 0.15 + i * 0.28} />
        ))}
      </ol>
    </div>
  );
}

function StrategyRow({ row, max, secret, play, delay }: { row: Row; max: number; secret: number; play: boolean; delay: number }) {
  const { guess, low, high, result } = row;
  const keptLow = result === "higher" ? Math.max(low, guess + 1) : result === "correct" ? guess : low;
  const keptHigh = result === "lower" ? Math.min(high, guess - 1) : result === "correct" ? guess : high;
  const pct = (v: number) => `${(v / max) * 100}%`;
  const out: [number, number][] = [];
  if (result === "higher" && guess >= low) out.push([low, Math.min(guess, high)]);
  if (result === "lower" && guess <= high) out.push([Math.max(guess, low), high]);
  if (result === "correct") {
    if (guess > low) out.push([low, guess - 1]);
    if (guess < high) out.push([guess + 1, high]);
  }
  const Icon = result === "higher" ? ArrowRight : result === "lower" ? ArrowLeft : Check;
  const half = aboutHalf(row);

  return (
    <motion.li
      className="grid grid-cols-[4.75rem_minmax(0,1fr)_4rem] items-center gap-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: play ? 1 : 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT, delay }}
    >
      <span
        className={cn(
          "inline-flex h-8 items-center justify-center gap-1 rounded-full px-2 text-[0.875rem] font-bold tabular-nums [&_svg]:size-3.5",
          result === "correct" ? "bg-game text-game-ink" : "bg-fg/[0.07] text-fg",
        )}
      >
        {result === "lower" ? <Icon strokeWidth={2.75} aria-hidden /> : null}
        {formatNumber(guess)}
        {result !== "lower" ? <Icon strokeWidth={2.75} aria-hidden /> : null}
        <span className="sr-only">{result === "correct" ? ", correct" : result === "higher" ? ", higher" : ", lower"}</span>
      </span>

      <span aria-hidden className="relative block h-4 rounded-full bg-fg/[0.06]">
        {/* What was still possible before this guess. */}
        <span className="absolute inset-y-0 rounded-full bg-game" style={{ left: pct(keptLow - 1), width: pct(Math.max(keptHigh - keptLow + 1, max / 120)) }} />
        {out.map(([a, b]) => (
          <motion.span
            key={a}
            className="absolute inset-y-0 rounded-full bg-game"
            style={{ left: pct(a - 1), width: pct(Math.max(b - a + 1, max / 160)) }}
            initial={{ opacity: 1 }}
            animate={{ opacity: play ? 0.18 : 1 }}
            transition={{ duration: 0.4, ease: EASE_OUT, delay: delay + 0.2 }}
          />
        ))}
        {/* The guess. */}
        <span className="absolute -inset-y-1 w-[3px] -translate-x-1/2 rounded-full bg-fg" style={{ left: pct(guess - 0.5) }} />
        {/* Where its number was. */}
        <span className="absolute -bottom-2 size-1.5 -translate-x-1/2 rounded-full bg-fg-muted" style={{ left: pct(secret - 0.5) }} />
      </span>

      <span className="text-right">
        <span className="type-small block font-semibold tabular-nums text-fg">{formatNumber(row.after)} left</span>
        {result === "correct" ? null : (
          <span className={cn("type-caption block", half ? "text-fg-subtle" : "text-fg-muted")}>{half ? "about half" : row.after < row.before / 2 ? "lucky cut" : "small cut"}</span>
        )}
      </span>
    </motion.li>
  );
}
