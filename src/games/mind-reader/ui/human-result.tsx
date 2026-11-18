"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { NextPlayerIcon } from "@/components/game/next-player";
import { HowItWorks, ResultPanel } from "@/components/game/panels";
import { NameEntry, Scoreboard } from "@/components/game/scoreboard";
import { Button } from "@/components/ui/button";
import { KeyHints } from "@/components/ui/key-hints";
import { Score, Stat } from "@/components/ui/score";
import { useLocalBoard } from "@/lib/leaderboard";
import { middleStrategySteps, numberRange, type ScoreBreakdown } from "../engine/game-engine";
import { elapsedSeconds, humanScore, type HumanState } from "../engine/human";
import { doublingSum, formatNumber } from "../engine/ranges";
import { useHeadingFocus, useKeys } from "./hooks";
import { CapacityGrid, ClueSplits, HalvingBars, MiddleSplit } from "./how-visuals";
import { StrategyCompare } from "./strategy-compare";

const count = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** End of "Find its number": the verdict, the score (wins only), the board, and how to always win. */
export function HumanResult({
  human,
  onPlayAgain,
  onSwitchMode,
  onNextPlayer,
}: {
  human: HumanState;
  onPlayAgain: () => void;
  onSwitchMode: () => void;
  onNextPlayer: () => void;
}) {
  const wrapper = useHeadingFocus<HTMLDivElement>();
  const range = numberRange(human.range);
  const score = humanScore(human);
  const won = score != null;
  const guesses = human.guesses.length;
  const seconds = elapsedSeconds(human);
  useKeys({ r: onPlayAgain });

  return (
    <div ref={wrapper} className="contents [&_h1]:outline-none">
      <ResultPanel
        label={won ? `Found in ${guesses} of ${range.maxGuesses} guesses` : "Out of guesses"}
        title={won ? `You found ${formatNumber(human.secret)} in ${count(guesses, "guess", "guesses")}.` : `Its number was ${formatNumber(human.secret)}.`}
        score={
          won ? (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", duration: 0.5, bounce: 0.25 }}>
              <Score value={score.finalScore} label="Score" tone="game" />
            </motion.div>
          ) : (
            <Score value={human.secret} label="Its number" />
          )
        }
        stats={
          <>
            <Stat value={`${guesses} of ${range.maxGuesses}`} label="Guesses" />
            <Stat value={`${human.clues.length} of ${range.maxSuggestions}`} label="Clues" />
            <Stat value={`${seconds} s`} label="Time" />
          </>
        }
        actions={
          <>
            <Button variant="game" size="lg" arrow onClick={onPlayAgain}>
              Play again
            </Button>
            <Button variant="secondary" size="lg" onClick={onSwitchMode}>
              Let it read my mind
            </Button>
            <Button variant="ghost" size="lg" icon={<NextPlayerIcon />} onClick={onNextPlayer}>
              Next player
            </Button>
            <KeyHints className="hidden basis-full pt-1 pointer-fine:flex" items={[{ keys: ["R"], label: "Play again" }]} />
          </>
        }
      >
        {won ? <ScoreAndBoard human={human} score={score} /> : null}
        <StrategyCompare human={human} />
        <MiddleStrategy human={human} />
        {won ? null : <BoardOnly />}
      </ResultPanel>
    </div>
  );
}

function MiddleStrategy({ human }: { human: HumanState }) {
  const { min, max, maxGuesses, label } = numberRange(human.range);
  const first = Math.floor((min + max) / 2);
  const upper = Math.floor((first + 1 + max) / 2);
  const lower = Math.floor((min + first - 1) / 2);
  const path = middleStrategySteps(human.secret, min, max);
  const clues = human.clues.map((c) => ({ question: c.question, before: c.before, after: c.after }));

  const steps = [
    {
      title: "Guess the middle",
      visual: <MiddleSplit max={max} />,
      text: `Start with ${formatNumber(first)}. Higher or lower, about half of the numbers are gone in one guess.`,
    },
    {
      title: "Then the middle of what's left",
      visual: <HalvingBars start={max} />,
      text: `Higher? Guess ${formatNumber(upper)}. Lower? Guess ${formatNumber(lower)}. For ${formatNumber(human.secret)} that's ${path.map((s) => formatNumber(s.guess)).join(", ")}.`,
    },
    {
      title: `${maxGuesses} guesses are always enough`,
      visual: <CapacityGrid max={max} pin={human.secret} />,
      text: `${doublingSum(maxGuesses)}, more than ${formatNumber(max)}. That's binary search, the way a computer finds a word in a sorted list.`,
    },
    ...(clues.length > 0
      ? [
          {
            title: "The best clues cut in half",
            visual: <ClueSplits clues={clues} />,
            text: "A yes or no answer can cross out at most half of what's left, so a clue that splits the numbers evenly is worth the most.",
          },
        ]
      : []),
  ];

  return (
    <HowItWorks
      title="How to always find it"
      intro={`Guessing the middle finds any number from ${label} in ${maxGuesses} guesses or fewer.`}
      steps={steps}
    />
  );
}

/** A win: how the score was made, then a name for today's board. */
function ScoreAndBoard({ human, score }: { human: HumanState; score: ScoreBreakdown }) {
  const range = numberRange(human.range);
  const board = useLocalBoard("mind-reader");
  const [ownId, setOwnId] = useState<string | null>(null);
  const [named, setNamed] = useState(false);
  const seconds = elapsedSeconds(human);
  const clues = human.clues.length;

  const addToBoard = (name: string) => {
    const { id } = board.add({
      name,
      score: score.finalScore,
      detail: `${range.label} · ${count(score.guessesUsed, "guess", "guesses")} · ${count(clues, "clue", "clues")} · ${seconds} s`,
      tiebreak: seconds,
    });
    setOwnId(id);
    setNamed(true);
  };

  const factor = (n: number) => `× ${n.toFixed(2)}`;
  const rows: [string, string][] = [
    [`Points for ${range.label}`, formatNumber(score.basePoints)],
    [`Guesses: ${score.guessesUsed} of ${score.maxGuessesAllowed}`, factor(score.guessEfficiency / 100)],
    [score.zeroHintBonus ? "No clues used" : `Clues: ${clues} of ${range.maxSuggestions}`, factor(score.hintMultiplier)],
    [`Time: ${seconds} s`, factor(1 + score.timeBonus / 100)],
  ];
  if (score.firstTryBonus) rows.push(["First try", factor(1.5)]);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section aria-labelledby="mind-reader-breakdown" className="flex flex-col gap-5 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
        <h2 id="mind-reader-breakdown" className="type-title-2 text-fg">
          How your score adds up
        </h2>
        <dl className="flex flex-col">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-line py-3">
              <dt className="type-body text-fg-muted">{label}</dt>
              <dd className="type-body font-semibold tabular-nums text-fg">{value}</dd>
            </div>
          ))}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 pt-4">
            <dt className="type-body font-semibold text-fg">Score</dt>
            <dd className="type-title-3 tabular-nums text-game">{formatNumber(score.finalScore)}</dd>
          </div>
        </dl>
        <p className="type-small text-fg-subtle">Fewer guesses and fewer clues score more. Finishing in under 45 seconds adds up to 10%.</p>
      </section>

      <div className="flex flex-col gap-6">
        {named ? null : (
          <div className="rounded-xl bg-surface p-5 shadow-ring sm:p-6">
            <NameEntry onSubmit={addToBoard} onSkip={() => setNamed(true)} />
          </div>
        )}
        <Scoreboard entries={board.entries} highlightId={ownId} />
      </div>
    </div>
  );
}

function BoardOnly() {
  const board = useLocalBoard("mind-reader");
  return <Scoreboard entries={board.entries} title="Today's board" />;
}
