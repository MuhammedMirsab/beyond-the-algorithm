"use client";

import { ArrowRight, Lock } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { GESTURES } from "../engine/aiPredictor";
import { isMixedGuess, METHOD_NAME, topMove, transitionCounts } from "../engine/explain";
import type { Insight } from "../engine/insights";
import type { Gesture, PredictionBreakdown, RoundRecord } from "../engine/types";
import { LEAD_IN_MS, STEP_MS, TO_SHOOT_MS } from "../match-controller";
import { GESTURE_LABEL, HandGlyph } from "./gesture-icon";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** How long each round's move sat locked before the throw was read. Shoot never comes sooner than TO_SHOOT_MS. */
function lockWaits(rounds: readonly RoundRecord[]): number[] {
  return rounds.map((r) => r.playerDetectedAtMs - r.aiLockedAtMs).filter((ms) => ms >= TO_SHOOT_MS - 50 && ms < 60_000);
}

/** Plays once, the first time the picture scrolls into view. */
function useReveal<T extends Element>() {
  const ref = useRef<T>(null);
  const shown = useInView(ref, { once: true, amount: 0.4 });
  return [ref, shown] as const;
}

/* ── 1. Your throws: everything it knows about you ──────────────── */

function ThrowTape({ history }: { history: readonly RoundRecord[] }) {
  const [ref, shown] = useReveal<HTMLDivElement>();
  const tape = history.slice(-20);
  const counts = { rock: 0, paper: 0, scissors: 0 } as Record<Gesture, number>;
  for (const r of history) counts[r.playerMove] += 1;
  const top = topMove(counts);
  return (
    <div ref={ref} className="flex min-h-[13rem] flex-col justify-between gap-5 p-4 sm:p-5">
      <ol aria-label="Your throws, oldest first" className="flex flex-wrap gap-2">
        {tape.map((round, i) => (
          <motion.li
            key={round.id}
            initial={{ opacity: 0, y: 10 }}
            animate={shown ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.25, ease: EASE_OUT, delay: i * 0.035 }}
            className="grid size-11 place-items-center rounded-md bg-fg"
          >
            <HandGlyph gesture={round.playerMove} paper="white" ink="var(--color-canvas)" weight={6} className="size-7" />
            <span className="sr-only">{GESTURE_LABEL[round.playerMove]}</span>
          </motion.li>
        ))}
      </ol>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        {GESTURES.map((g) => (
          <span key={g} className={cn("inline-flex items-center gap-1.5 tabular-nums", g === top ? "text-fg" : "text-fg-muted")}>
            <HandGlyph gesture={g} ink="var(--color-sunken)" className={cn("size-6", g === top ? "text-game" : "text-fg-muted")} />
            <span className="type-title-3">{counts[g]}</span>
            <span className="type-small">{GESTURE_LABEL[g].toLowerCase()}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── 2. What comes next: the after-this, that table ─────────────── */

function TransitionGrid({ history, habit }: { history: readonly RoundRecord[]; habit: Insight | null }) {
  const [ref, shown] = useReveal<HTMLDivElement>();
  const counts = transitionCounts(history);
  const strongest = habit ? { from: habit.moves[0], to: habit.moves[1] } : null;
  return (
    <div ref={ref} className="flex min-h-[13rem] items-center justify-center p-4 sm:p-5">
      <table className="border-separate border-spacing-1.5">
        <caption className="sr-only">How often each move followed each move</caption>
        <thead>
          <tr>
            <th scope="col" className="type-label pr-2 text-left font-normal text-fg-subtle">
              After
            </th>
            {GESTURES.map((to) => (
              <th key={to} scope="col" className="pb-1 font-normal">
                <span className="flex flex-col items-center gap-0.5">
                  <span className="type-label text-fg-subtle">next</span>
                  <HandGlyph gesture={to} ink="var(--color-sunken)" className="size-6 text-fg-muted" />
                  <span className="sr-only">{GESTURE_LABEL[to]}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GESTURES.map((from, row) => {
            const total = counts[from].rock + counts[from].paper + counts[from].scissors;
            return (
              <tr key={from}>
                <th scope="row" className="pr-2 font-normal">
                  <HandGlyph gesture={from} ink="var(--color-sunken)" className="size-6 text-fg-muted" />
                  <span className="sr-only">After {GESTURE_LABEL[from]}</span>
                </th>
                {GESTURES.map((to) => {
                  const n = counts[from][to];
                  const share = total ? n / total : 0;
                  const hot = strongest !== null && strongest.from === from && strongest.to === to;
                  return (
                    <td key={to} className="p-0">
                      <motion.span
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={shown ? { opacity: 1, scale: 1 } : undefined}
                        transition={{ type: "spring", duration: 0.45, bounce: 0.25, delay: 0.1 + row * 0.12 }}
                        className={cn(
                          "relative grid size-11 place-items-center overflow-hidden rounded-md font-semibold tabular-nums sm:size-12",
                          hot ? "bg-game text-game-ink" : n === 0 ? "bg-fg/[0.06] text-fg-subtle" : "bg-fg/[0.06] text-fg",
                        )}
                      >
                        {!hot && n > 0 ? (
                          <span aria-hidden className="absolute inset-x-0 bottom-0 bg-game/35" style={{ height: `${Math.round(share * 100)}%` }} />
                        ) : null}
                        <span className="relative">{n}</span>
                      </motion.span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── 3. Five clues, mixed into odds, then the counter move ──────── */

function CluesToOdds({ guess, round }: { guess: PredictionBreakdown; round: RoundRecord }) {
  const [ref, shown] = useReveal<HTMLDivElement>();
  const clues = guess.methodContributions;
  const maxWeight = Math.max(0.0001, ...clues.map((c) => c.weight));
  return (
    <div ref={ref} className="flex min-h-[13rem] flex-col gap-4 p-4 sm:p-5">
      <ul className="flex flex-col gap-1.5">
        {clues.map((clue, i) => {
          const points = topMove(clue.probabilities);
          return (
            <li key={clue.method} className="grid grid-cols-[minmax(0,1fr)_4.5rem_1.5rem] items-center gap-2.5">
              <span className="type-small leading-snug text-fg-muted">{METHOD_NAME[clue.method]}</span>
              <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-fg/10">
                <motion.span
                  className="block h-full origin-left rounded-full bg-fg/60"
                  initial={{ scaleX: 0 }}
                  animate={shown ? { scaleX: clue.weight / maxWeight } : undefined}
                  transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.05 + i * 0.06 }}
                />
              </span>
              <HandGlyph gesture={points} ink="var(--color-sunken)" className="size-5 text-fg-muted" />
              <span className="sr-only">
                counted {pct(clue.weight, 1)}%, pointed to {GESTURE_LABEL[points]}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
        <span className="type-label text-fg-subtle">Odds</span>
        {GESTURES.map((g) => {
          const on = g === round.predictedPlayerMove;
          return (
            <motion.span
              key={g}
              initial={{ opacity: 0 }}
              animate={shown ? { opacity: 1 } : undefined}
              transition={{ duration: 0.3, delay: 0.45 }}
              className={cn("inline-flex items-center gap-1 tabular-nums", on ? "text-game" : "text-fg-muted")}
            >
              <HandGlyph gesture={g} ink="var(--color-sunken)" className="size-5" />
              <span className="type-small font-semibold">{pct(guess.probabilities[g], 1)}%</span>
            </motion.span>
          );
        })}
        <ArrowRight aria-hidden className="size-4 text-fg-subtle" />
        <motion.span
          initial={{ opacity: 0, scale: 0.85 }}
          animate={shown ? { opacity: 1, scale: 1 } : undefined}
          transition={{ type: "spring", duration: 0.45, bounce: 0.3, delay: 0.7 }}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-game pl-1.5 pr-3 text-[0.8125rem] font-semibold text-game-ink"
        >
          <span className="grid size-6 place-items-center rounded-full bg-game-ink/10">
            <Lock className="size-3.5" strokeWidth={2.5} aria-hidden />
          </span>
          Played {round.aiCounterMove}
        </motion.span>
      </div>
    </div>
  );
}

/* ── 4. Locked before the chant; its guesses against your throws ── */

/** The chant's beats, in ms after the lock. */
const BEATS = [LEAD_IN_MS, LEAD_IN_MS + STEP_MS, LEAD_IN_MS + STEP_MS * 2];

function LockTimeline({ rounds }: { rounds: readonly RoundRecord[] }) {
  const [ref, shown] = useReveal<HTMLDivElement>();
  const waits = lockWaits(rounds);
  const average = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : TO_SHOOT_MS;
  const end = Math.max(average, TO_SHOOT_MS + 300);
  const x = (ms: number) => `${(ms / end) * 100}%`;
  const recent = rounds.slice(-12);
  return (
    <div ref={ref} className="flex min-h-[13rem] flex-col gap-5 p-4 sm:p-5">
      {/* The chant's caption above the track, the lock and your throw below it: nothing collides. */}
      <div className="relative mx-3 h-[4.5rem]">
        <span
          className="type-label absolute top-0 -translate-x-1/2 whitespace-nowrap text-fg-subtle"
          style={{ left: x((BEATS[0] + TO_SHOOT_MS) / 2) }}
        >
          Rock, paper, scissors, shoot
        </span>
        <span aria-hidden className="absolute inset-x-0 top-[1.9375rem] h-0.5 rounded-full bg-fg/15" />
        <motion.span
          aria-hidden
          className="absolute left-0 top-[1.9375rem] h-0.5 w-full origin-left rounded-full bg-game"
          initial={{ scaleX: 0 }}
          animate={shown ? { scaleX: 1 } : undefined}
          transition={{ duration: 1.4, ease: [0.77, 0, 0.175, 1], delay: 0.2 }}
        />
        {[...BEATS, TO_SHOOT_MS].map((at) => (
          <span
            key={at}
            aria-hidden
            className={cn(
              "absolute -translate-x-1/2 rounded-full",
              at === TO_SHOOT_MS ? "top-6 size-4 bg-fg" : "top-[1.625rem] size-3 bg-fg/70",
            )}
            style={{ left: x(at) }}
          />
        ))}
        <span className="absolute left-0 top-5 flex -translate-x-3 flex-col items-start gap-1.5">
          <span className="grid size-6 place-items-center rounded-full bg-game text-game-ink">
            <Lock className="size-3.5" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="type-label whitespace-nowrap text-game">Locked</span>
        </span>
        <span className="absolute right-0 top-5 flex translate-x-3 flex-col items-end gap-1.5">
          <span className="grid size-6 place-items-center rounded-full bg-fg">
            <HandGlyph gesture="paper" paper="var(--color-canvas)" ink="var(--color-fg)" className="size-4" />
          </span>
          <span className="type-label whitespace-nowrap text-fg-subtle">Your throw, {seconds(average)}</span>
        </span>
      </div>
      <div className="no-scrollbar flex min-w-0 flex-col gap-1.5 overflow-x-auto">
        <div className="flex items-center gap-2.5">
          <span className="type-label w-[4.75rem] shrink-0 text-game">Its guess</span>
          <ol aria-hidden className="flex gap-1">
            {recent.map((r) => (
              <li key={r.id} className={cn("grid size-7 place-items-center rounded-sm", r.wasPredictionCorrect ? "bg-game/20" : "bg-fg/[0.05]")}>
                <HandGlyph gesture={r.predictedPlayerMove} ink="var(--color-sunken)" className="size-5 text-game" />
              </li>
            ))}
          </ol>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="type-label w-[4.75rem] shrink-0 text-fg-subtle">You threw</span>
          <ol aria-hidden className="flex gap-1">
            {recent.map((r) => (
              <li key={r.id} className={cn("grid size-7 place-items-center rounded-sm", r.wasPredictionCorrect ? "bg-game/20" : "bg-fg/[0.05]")}>
                <HandGlyph gesture={r.playerMove} ink="var(--color-sunken)" className="size-5 text-fg" />
              </li>
            ))}
          </ol>
        </div>
        <p className="sr-only">
          {recent.map((r) => `It guessed ${r.predictedPlayerMove}, you threw ${r.playerMove}.`).join(" ")}
        </p>
      </div>
    </div>
  );
}

/* ── The section ────────────────────────────────────────────────── */

interface Step {
  title: string;
  text: ReactNode;
  visual: ReactNode;
}

/**
 * How the AI did it, with this visitor's own throws: what goes in, what it
 * counts, how it turns counts into a move, and why locking first is fair.
 * Same look as the arcade's HowItWorks, in two columns so the pictures are big
 * enough to read from a step back.
 */
export function RpsHowItWorks({
  history,
  guesses,
  rounds,
  insights,
}: {
  /** Everything it has seen of this visitor, across rematches. */
  history: readonly RoundRecord[];
  guesses: readonly PredictionBreakdown[];
  /** This match. */
  rounds: readonly RoundRecord[];
  /** The habits that stood out (describeHabits), strongest first. */
  insights: readonly Insight[];
}) {
  const lastIndex = history.length - 1;
  const lastRound = history[lastIndex];
  const lastGuess = guesses[lastIndex];
  const correct = rounds.filter((r) => r.wasPredictionCorrect).length;
  const waits = lockWaits(rounds);
  const average = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : TO_SHOOT_MS;
  const habit = insights.find((i) => i.id === "transition" && i.moves.length === 2) ?? null;

  const steps: Step[] = [
    {
      title: "It writes down every throw",
      text: (
        <>
          Your {history.length} throws are all it knows about you: no picture, no name. The camera only turns your hand into one
          word.
        </>
      ),
      visual: <ThrowTape history={history} />,
    },
    {
      title: "It counts what you do next",
      text: habit ? (
        <>
          {habit.text} {habit.random} The highlighted square is that habit.
        </>
      ) : (
        <>
          Each square counts what you threw right after a move. None stood out from the 1 in 3 that random play gives, which made
          you harder to read.
        </>
      ),
      visual: <TransitionGrid history={history} habit={habit} />,
    },
    {
      title: "It mixes five clues into odds",
      text:
        lastRound && lastGuess && lastGuess.methodContributions.length > 0 ? (
          isMixedGuess(lastGuess) ? (
            <>
              Each clue points at a move; the longer bar counted more. Before your last round the odds favoured{" "}
              {topMove(lastGuess.probabilities)} {pct(lastGuess.probabilities[topMove(lastGuess.probabilities)], 1)}%, but now and then it
              bets on a less likely move so it can&apos;t be read. This time it bet on {lastRound.predictedPlayerMove} and locked{" "}
              {lastRound.aiCounterMove}.
            </>
          ) : (
            <>
              Each clue points at a move; the longer bar counted more. Before your last round the odds said{" "}
              {lastRound.predictedPlayerMove} {pct(lastGuess.probabilities[lastRound.predictedPlayerMove], 1)}%, so it locked{" "}
              {lastRound.aiCounterMove}, the move that beats it.
            </>
          )
        ) : (
          <>It turns your counts into odds for each move, then plays the move that beats the likeliest one.</>
        ),
      visual:
        lastRound && lastGuess && lastGuess.methodContributions.length > 0 ? <CluesToOdds guess={lastGuess} round={lastRound} /> : null,
    },
    {
      title: "It locks its move before you throw",
      text: (
        <>
          Its move is set before the chant, {seconds(average)} before your throw was read on average, so it can&apos;t react to your
          hand. It only wins by reading your habits: it guessed right {correct} of {rounds.length} times this match. Random guessing gets
          about 33%.
        </>
      ),
      visual: <LockTimeline rounds={rounds} />,
    },
  ];

  return (
    <section aria-labelledby="rps-how" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="rps-how" className="type-title-1 text-fg">
          How the AI did it
        </h2>
        <p className="type-body-lg max-w-[40rem] text-fg-muted">
          It never sees your hand before it decides. It only counts what you did in earlier rounds.
        </p>
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
        {steps.map((step, i) => (
          <li key={step.title} className="row-span-4 grid grid-rows-subgrid content-start gap-3 rounded-lg bg-surface p-5 shadow-ring">
            <span className="type-label text-game">Step {i + 1}</span>
            {step.visual ? (
              <div className="dot-field flex flex-col justify-center overflow-hidden rounded-md bg-sunken">{step.visual}</div>
            ) : (
              <div aria-hidden />
            )}
            <h3 className="type-title-3 text-fg">{step.title}</h3>
            <div className="type-body text-fg-muted">{step.text}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
