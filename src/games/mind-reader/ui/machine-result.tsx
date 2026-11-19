"use client";

import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { NextPlayerIcon } from "@/components/game/next-player";
import { HowItWorks, ResultPanel } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { KeyHints } from "@/components/ui/key-hints";
import { Score, Stat } from "@/components/ui/score";
import { cn } from "@/lib/cn";
import { machineGuess, type MachineAction, type MachineState } from "../engine/machine";
import { binaryFact, binaryQuestionText, findContradiction } from "../engine/prediction-engine";
import { doublingSum, formatNumber, halvingsFor, parseWholeNumber, RANGE_MAX, rangeLabel, type RangeId } from "../engine/ranges";
import { useHeadingFocus, useKeys } from "./hooks";
import { CapacityGrid, ParityComb, RaceBars, SlipRows } from "./how-visuals";
import { SearchReplay } from "./search-replay";

interface ResultProps {
  machine: MachineState;
  dispatch: (action: MachineAction) => void;
  onPlayAgain: () => void;
  /** Play again on another range ("Try 1 to 1,000"). */
  onPlayRange: (range: RangeId) => void;
  onSwitchMode: () => void;
  onNextPlayer: () => void;
}

const count = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** 100, 50, 25, 13, 7, 4, 2, 1: the list after each halving, worst case. */
function halvingChain(start: number): string {
  const chain = [start];
  while (chain[chain.length - 1] > 1) chain.push(Math.ceil(chain[chain.length - 1] / 2));
  return chain.map(formatNumber).join(", ");
}

const NEXT_RANGE: Partial<Record<RangeId, RangeId>> = { "10": "100", "100": "1000" };

function Actions({ onPlayAgain, second, onNextPlayer }: { onPlayAgain: () => void; second?: ReactNode; onNextPlayer: () => void }) {
  useKeys({ r: onPlayAgain });
  return (
    <>
      <Button variant="game" size="lg" arrow onClick={onPlayAgain}>
        Play again
      </Button>
      {second}
      <Button variant="ghost" size="lg" icon={<NextPlayerIcon />} onClick={onNextPlayer}>
        Next player
      </Button>
      <KeyHints className="hidden basis-full pt-1 pointer-fine:flex" items={[{ keys: ["R"], label: "Play again" }]} />
    </>
  );
}

/** The cards under every machine result. `slipFirst` leads with what one wrong answer does. */
function WhyItWorks({ machine, pin, slipFirst, onPlayRange }: { machine: MachineState; pin: number; slipFirst: boolean; onPlayRange: (range: RangeId) => void }) {
  const max = RANGE_MAX[machine.range];
  const enough = halvingsFor(max);
  const next = NEXT_RANGE[machine.range];
  const parityAt = machine.steps.findIndex((s) => s.question.kind === "even");
  const parity = parityAt > 0 ? machine.steps[parityAt] : null;
  const parityBefore = parityAt > 0 ? machine.steps[parityAt - 1].candidates : null;

  const capacity = {
    title: `${enough} questions are always enough`,
    visual: <CapacityGrid max={max} pin={pin} />,
    text: (
      <span className="flex flex-col items-start gap-3">
        <span>
          Halving {formatNumber(max)} goes {halvingChain(max)}. That&apos;s {enough} cuts, whatever your number: {doublingSum(enough)}, more than {formatNumber(max)}.
        </span>
        {next ? (
          <Button variant="secondary" size="sm" icon={<ArrowRight />} onClick={() => onPlayRange(next)}>
            Try {rangeLabel(next)}
          </Button>
        ) : null}
      </span>
    ),
  };
  const race = {
    title: "Halving beats one at a time",
    visual: <RaceBars max={max} />,
    text: `Asking “Is it 1? Is it 2?” could take ${formatNumber(max - 1)} questions. Halving needs ${enough}, and it barely grows: ${halvingsFor(10)} questions for 10 numbers, ${halvingsFor(100)} for 100, ${halvingsFor(1000)} for 1,000, ${halvingsFor(1_000_000)} for a million.`,
  };
  const even =
    parity && parityBefore
      ? {
          title: "Even or odd is a half too",
          visual: <ParityComb before={parityBefore} keepEven={parity.answer} />,
          text: `Question ${parityAt + 1} didn't ask bigger or smaller, yet it still crossed out half the list. Any question that splits the numbers in half works.`,
        }
      : null;
  const slip = {
    title: "It believes every answer",
    visual: <SlipRows />,
    text: "It never hears your number, only your answers, and one wrong answer crosses your number out for good. That's why it checks at the end: say no, type your number, and it tests every answer against it to find the one that didn't fit.",
  };

  const steps = slipFirst ? [slip, capacity, ...(even ? [even] : []), race] : [capacity, race, ...(even ? [even] : []), slip];
  return (
    <HowItWorks
      title="Why it always works"
      intro="This is binary search, the way a computer finds one word in a sorted list of millions."
      steps={steps}
    />
  );
}

/** It guessed right: the verdict, the visitor's own search replayed, and why it works. */
export function MachineRight({ machine, onPlayAgain, onPlayRange, onSwitchMode, onNextPlayer }: ResultProps) {
  const wrapper = useHeadingFocus<HTMLDivElement>();
  const start = RANGE_MAX[machine.range];
  const found = machineGuess(machine);
  const asked = machine.steps.length;

  return (
    <div ref={wrapper} className="contents [&_h1]:outline-none">
      <ResultPanel
        label={`${rangeLabel(machine.range)} · binary search`}
        title={`It found ${formatNumber(found)} in ${count(asked, "question", "questions")}.`}
        score={<Score value={found} label="Your number" tone="game" />}
        stats={
          <>
            <Stat value={asked} label="Yes or no answers" />
            <Stat value={formatNumber(start - 1)} label="Numbers crossed out" />
          </>
        }
        actions={
          <Actions
            onPlayAgain={onPlayAgain}
            onNextPlayer={onNextPlayer}
            second={
              <Button variant="secondary" size="lg" onClick={onSwitchMode}>
                Find its number
              </Button>
            }
          />
        }
      >
        <section aria-labelledby="mind-reader-replay" className="flex flex-col gap-6 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
          <div className="flex flex-col gap-1.5">
            <h2 id="mind-reader-replay" className="type-title-2 text-fg">
              How it found {formatNumber(found)}
            </h2>
            <p className="type-body max-w-[42rem] text-fg-muted">
              Each row is the list it still had. Your answer kept one half and crossed out the other, and {formatNumber(found)} stayed in every time.
            </p>
          </div>
          <SearchReplay range={machine.range} steps={machine.steps} pin={found} />
        </section>
        <WhyItWorks machine={machine} pin={found} slipFirst={false} onPlayRange={onPlayRange} />
      </ResultPanel>
    </div>
  );
}

/** It guessed wrong: find the answer that didn't fit, then explain why one slip is enough. */
export function MachineWrong({ machine, dispatch, onPlayAgain, onPlayRange, onNextPlayer }: ResultProps) {
  const wrapper = useHeadingFocus<HTMLDivElement>();
  const guess = machineGuess(machine);
  const [checked, setChecked] = useState<number | null>(null);

  return (
    <div ref={wrapper} className="contents [&_h1]:outline-none">
      <ResultPanel
        label={`It guessed ${formatNumber(guess)}`}
        title="One of your answers didn't match your number."
        score={<Score value={guess} label="Its guess" />}
        actions={<Actions onPlayAgain={onPlayAgain} onNextPlayer={onNextPlayer} />}
      >
        <AnswerChecker
          machine={machine}
          checked={checked}
          onCheck={setChecked}
          onPlayAgain={onPlayAgain}
          onItWasRight={() => dispatch({ type: "confirm", correct: true })}
        />
        <WhyItWorks machine={machine} pin={checked ?? guess} slipFirst onPlayRange={onPlayRange} />
      </ResultPanel>
    </div>
  );
}

/** Type your real number: the replay marks it in every row, and the first answer that didn't fit is named. */
function AnswerChecker({
  machine,
  checked,
  onCheck,
  onPlayAgain,
  onItWasRight,
}: {
  machine: MachineState;
  checked: number | null;
  onCheck: (n: number | null) => void;
  onPlayAgain: () => void;
  onItWasRight: () => void;
}) {
  const id = useId();
  const max = RANGE_MAX[machine.range];
  const guess = machineGuess(machine);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const first = checked == null ? -1 : findContradiction(machine.steps, checked);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = parseWholeNumber(value, max);
    if (n === null) {
      setError(`Type a whole number from ${rangeLabel(machine.range)}.`);
      onCheck(null);
      return;
    }
    setError(null);
    onCheck(n);
  };

  let verdict: { title: string; text: string } | null = null;
  if (checked != null) {
    const num = formatNumber(checked);
    if (first >= 0) {
      const step = machine.steps[first];
      verdict = {
        title: `Answer ${first + 1} didn't fit ${num}.`,
        text: `You said ${step.answer ? "yes" : "no"} to “${binaryQuestionText(step.question)}”, but ${binaryFact(step.question, checked)}. From that answer on, ${num} was crossed out, so it could never be found.`,
      };
    } else if (checked === guess) {
      verdict = { title: `${num} is the number it guessed.`, text: "All your answers fit it. Maybe a finger slipped on No." };
    } else {
      verdict = {
        title: `All your answers fit ${num} too.`,
        text: `It still had more than one number left and picked ${formatNumber(guess)}.`,
      };
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-6 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
      <p aria-live="polite" className="sr-only">
        {verdict ? `${verdict.title} ${verdict.text}` : ""}
      </p>

      <div className="flex flex-col gap-1.5">
        <h2 id={`${id}-title`} className="type-title-2 text-fg">
          Find the answer that didn&apos;t fit
        </h2>
        <p className="type-body max-w-[40rem] text-fg-muted">Type the number you were thinking of. It stays on this screen.</p>
      </div>

      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <label htmlFor={`${id}-number`} className="type-body font-semibold text-fg">
          Your number
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id={`${id}-number`}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            enterKeyHint="go"
            placeholder={`1 to ${formatNumber(max)}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cn(
              "type-title-3 h-14 min-w-0 rounded-full bg-sunken px-6 tabular-nums text-fg shadow-ring outline-none placeholder:text-fg-faint sm:w-56",
              "transition-shadow duration-150 focus:shadow-[0_0_0_2px_var(--color-fg)]",
              error && "shadow-[0_0_0_2px_var(--color-danger)]",
            )}
          />
          <Button type="submit" variant="secondary" size="lg">
            Check my answers
          </Button>
        </div>
        {error ? (
          <p id={`${id}-error`} className="type-small pl-6 text-danger">
            {error}
          </p>
        ) : null}
      </form>

      {verdict ? (
        <div className="flex flex-col gap-3 rounded-lg bg-sunken p-4 sm:p-5">
          <p className="type-title-3 text-fg">{verdict.title}</p>
          <p className="type-body max-w-[42rem] text-fg-muted">{verdict.text}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            {first < 0 && checked === guess ? (
              <Button variant="secondary" size="lg" icon={<Check />} onClick={onItWasRight}>
                Show how it found it
              </Button>
            ) : (
              <Button variant="secondary" size="lg" icon={<RotateCcw />} onClick={onPlayAgain}>
                Play again
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <SearchReplay range={machine.range} steps={machine.steps} pin={checked} highlight={first >= 0 ? first : null} />
    </section>
  );
}
