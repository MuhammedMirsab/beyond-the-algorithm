"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { HowItWorks, ResultPanel } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { Score, Stat } from "@/components/ui/score";
import { cn } from "@/lib/cn";
import { evaluateClue } from "../engine/clues";
import { machineGuess, type MachineAction, type MachineState } from "../engine/machine";
import { binaryFact, binaryQuestionText, findContradiction } from "../engine/prediction-engine";
import { doublingSum, formatNumber, halvingsFor, RANGE_MAX, rangeLabel } from "../engine/ranges";
import { AnswerChip } from "./bits";
import { useHeadingFocus } from "./hooks";
import { PathBars } from "./path-bars";

interface ResultProps {
  machine: MachineState;
  dispatch: (action: MachineAction) => void;
  onPlayAgain: () => void;
  onSwitchMode: () => void;
  onNextPlayer: () => void;
}

const count = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

const SPLIT_STEP = {
  title: "Each answer crossed out about half",
  text: "Every question splits the list into two halves. Your yes or no told it which half to cross out.",
};

/** It guessed right: the verdict, the visitor's own path, and the reveal. */
export function MachineRight({ machine, onPlayAgain, onSwitchMode, onNextPlayer }: ResultProps) {
  const wrapper = useHeadingFocus<HTMLDivElement>();
  const start = RANGE_MAX[machine.range];
  const found = machineGuess(machine);
  const asked = machine.steps.length;
  const enough = halvingsFor(start);

  return (
    <div ref={wrapper} className="contents [&_h1]:outline-none">
      <ResultPanel
        label={`${rangeLabel(machine.range)} · binary search`}
        title={`It found your number in ${count(asked, "question", "questions")}.`}
        score={<Score value={found} label="Your number" tone="game" />}
        stats={
          <>
            <Stat value={asked} label="Yes or no answers" />
            <Stat value={`${formatNumber(start)} to 1`} label="Possible numbers" />
          </>
        }
        actions={
          <>
            <Button variant="game" size="lg" arrow onClick={onPlayAgain}>
              Play again
            </Button>
            <Button variant="secondary" size="lg" onClick={onSwitchMode}>
              Find its number
            </Button>
            <Button variant="ghost" size="lg" onClick={onNextPlayer}>
              Next player
            </Button>
          </>
        }
      >
        <PathBars start={start} steps={machine.steps} found={found} />
        <HowItWorks
          title="How it found your number"
          intro={`You answered ${count(asked, "question", "questions")}. Each one cut the possible numbers roughly in half. That's binary search, the same trick a computer uses to find one name among millions.`}
          steps={[
            {
              title: `It started with ${formatNumber(start)} numbers`,
              text: "Your number could have been any of them, so it kept every one of them on a list.",
            },
            SPLIT_STEP,
            {
              title: `${enough} questions are always enough`,
              text: `${doublingSum(enough)}, more than ${formatNumber(start)}. So ${enough} yes or no answers can pick out any number from ${rangeLabel(machine.range)}.`,
            },
          ]}
        />
      </ResultPanel>
    </div>
  );
}

/** It guessed wrong: find the answer that didn't fit, then explain why one slip is enough. */
export function MachineWrong({ machine, dispatch, onPlayAgain, onNextPlayer }: ResultProps) {
  const wrapper = useHeadingFocus<HTMLDivElement>();
  const start = RANGE_MAX[machine.range];
  const guess = machineGuess(machine);

  return (
    <div ref={wrapper} className="contents [&_h1]:outline-none">
      <ResultPanel
        label={`It guessed ${formatNumber(guess)}`}
        title="One of your answers didn't match your number."
        score={<Score value={guess} label="Its guess" />}
        actions={
          <>
            <Button variant="game" size="lg" arrow onClick={onPlayAgain}>
              Play again
            </Button>
            <Button variant="ghost" size="lg" onClick={onNextPlayer}>
              Next player
            </Button>
          </>
        }
      >
        <AnswerChecker
          machine={machine}
          onPlayAgain={onPlayAgain}
          onItWasRight={() => dispatch({ type: "confirm", correct: true })}
        />
        <HowItWorks
          title={`How it picked ${formatNumber(guess)}`}
          intro={`It never saw your number. It only had your ${count(machine.steps.length, "answer", "answers")}, and ${formatNumber(guess)} was the one number that fit all of them.`}
          steps={[
            { title: "It kept a list", text: `At the start, all ${formatNumber(start)} numbers were possible.` },
            SPLIT_STEP,
            {
              title: "One slip sends it the wrong way",
              text: "If one answer is wrong, your number gets crossed out, and every question after it searches the wrong half. A computer can only be as right as the answers it gets.",
            },
          ]}
        />
      </ResultPanel>
    </div>
  );
}

/** Type your real number; the first answer that doesn't fit it is highlighted. */
function AnswerChecker({
  machine,
  onPlayAgain,
  onItWasRight,
}: {
  machine: MachineState;
  onPlayAgain: () => void;
  onItWasRight: () => void;
}) {
  const id = useId();
  const max = RANGE_MAX[machine.range];
  const guess = machineGuess(machine);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<number | null>(null);

  const first = checked == null ? -1 : findContradiction(machine.steps, checked);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(value);
    if (value === "" || !Number.isInteger(n) || n < 1 || n > max) {
      setError(`Type a whole number from ${rangeLabel(machine.range)}.`);
      setChecked(null);
      return;
    }
    setError(null);
    setChecked(n);
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
              setValue(e.target.value.replace(/\D/g, "").slice(0, 4));
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

      <ol className="flex flex-col gap-2" aria-label="Your answers">
        {machine.steps.map((step, i) => {
          const fits = checked == null ? null : evaluateClue(step.question, checked) === step.answer;
          const isFirst = i === first;
          return (
            <li
              key={i}
              className={cn(
                "grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-md px-3 py-3 sm:grid-cols-[1.75rem_minmax(0,1fr)_auto_8.5rem]",
                isFirst ? "bg-game-soft ring-2 ring-game" : "bg-fg/[0.03]",
              )}
            >
              <span aria-hidden className="type-label tabular-nums text-fg-subtle">
                {i + 1}
              </span>
              <span className="type-body min-w-0 text-fg">{binaryQuestionText(step.question)}</span>
              <span className="col-start-2 flex items-center sm:col-start-auto">
                <span className="sr-only">You said </span>
                <AnswerChip yes={step.answer} />
              </span>
              {fits == null ? null : (
                <span className="col-start-2 sm:col-start-auto sm:text-right">
                  {fits ? (
                    <span className="type-small inline-flex items-center gap-1.5 text-fg-subtle">
                      <Check className="size-4" aria-hidden />
                      Fits {formatNumber(checked ?? 0)}
                    </span>
                  ) : (
                    <span className={cn("type-small inline-flex items-center gap-1.5 font-semibold", isFirst ? "text-game" : "text-fg")}>
                      <X className="size-4" aria-hidden />
                      Didn&apos;t fit
                    </span>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
