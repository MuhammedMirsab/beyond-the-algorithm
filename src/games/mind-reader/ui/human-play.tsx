"use client";

import { motion } from "motion/react";
import { ArrowDown, ArrowUp, Info } from "lucide-react";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { StepDots } from "@/components/ui/progress";
import { Kbd } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { parseCustomClue } from "../engine/custom-clue-parser";
import { numberRange } from "../engine/game-engine";
import { cluesLeft, guessesLeft, humanCards, possibleNumbers, type AskedClue, type ClueCardView, type HumanAction, type HumanState } from "../engine/human";
import { formatNumber } from "../engine/ranges";
import { AnswerChip, GuessTrail } from "./bits";
import { useScreenFocus } from "./hooks";
import { PossibleBar } from "./possible-bar";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const INPUT =
  "h-14 min-w-0 flex-1 rounded-full bg-sunken px-6 text-fg shadow-ring outline-none placeholder:text-fg-faint " +
  "transition-shadow duration-150 focus:shadow-[0_0_0_2px_var(--color-fg)]";

/** "Find its number": guess with higher or lower, narrow it down with clues. */
export function HumanPlay({ human, dispatch }: { human: HumanState; dispatch: (action: HumanAction) => void }) {
  const heading = useScreenFocus<HTMLHeadingElement>();
  const range = numberRange(human.range);
  const possible = useMemo(() => possibleNumbers(human), [human]);
  const used = human.guesses.length;
  const left = guessesLeft(human);

  return (
    <section className="mx-auto grid w-full max-w-[69rem] items-start gap-8 px-4 pb-12 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12 lg:px-8 lg:pb-16 lg:pt-8">
      <div className="flex min-w-0 flex-col gap-7">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="type-label tabular-nums text-game" aria-hidden>
              Guess {Math.min(used + 1, range.maxGuesses)} of {range.maxGuesses}
            </span>
            <StepDots total={range.maxGuesses} current={used} label="Guess" />
          </div>
          <h1 ref={heading} tabIndex={-1} className="type-title-1 text-fg outline-none">
            I&apos;m thinking of a number from {range.label}.
          </h1>
          <p className="type-body-lg text-fg-muted">
            {used === 0 ? `You have ${range.maxGuesses} guesses.` : `${left} ${left === 1 ? "guess" : "guesses"} left.`}
          </p>
        </div>

        <PossibleBar max={range.max} possible={possible} />
        <GuessForm max={range.max} possible={possible} dispatch={dispatch} />
        <GuessFeedback human={human} />

        {used > 0 ? (
          <div className="flex flex-col gap-2.5">
            <h2 className="type-label text-fg-subtle">Your guesses</h2>
            <GuessTrail guesses={human.guesses} />
          </div>
        ) : null}
      </div>

      <CluePanel human={human} dispatch={dispatch} />
    </section>
  );
}

function GuessForm({
  max,
  possible,
  dispatch,
}: {
  max: number;
  possible: readonly number[];
  dispatch: (action: HumanAction) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const n = value === "" ? null : Number(value);
  const valid = n != null && Number.isInteger(n) && n >= 1 && n <= max;
  const crossedOut = valid && !possible.includes(n);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) {
      setError(`Type a whole number from 1 to ${formatNumber(max)}.`);
      return;
    }
    setError(null);
    dispatch({ type: "guess", value: n, now: Date.now() });
    setValue("");
    input.current?.focus();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <label htmlFor={`${id}-guess`} className="type-body font-semibold text-fg">
        Your guess
      </label>
      <div className="flex gap-3">
        <input
          ref={input}
          id={`${id}-guess`}
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
          aria-describedby={`${id}-help`}
          className={cn(INPUT, "type-title-3 tabular-nums", error && "shadow-[0_0_0_2px_var(--color-danger)]")}
        />
        <Button type="submit" variant="game" size="lg" arrow>
          Guess
        </Button>
      </div>
      <p id={`${id}-help`} className={cn("type-small min-h-[1lh] pl-6", error ? "text-danger" : "text-fg-subtle")}>
        {error ? (
          error
        ) : crossedOut ? (
          `${formatNumber(n)} is already crossed out.`
        ) : (
          <span className="hidden items-center gap-2 lg:inline-flex">
            Press <Kbd>Enter</Kbd> to guess
          </span>
        )}
      </p>
    </form>
  );
}

function GuessFeedback({ human }: { human: HumanState }) {
  const event = human.event;
  const repeat = event?.kind === "repeat-guess" ? human.guesses[event.index] : null;
  const shown = repeat ?? human.guesses[human.guesses.length - 1];
  if (!shown || shown.result === "correct") return null;

  const higher = shown.result === "higher";
  const value = formatNumber(shown.value);
  return (
    <motion.div
      key={repeat ? `repeat-${human.turn}` : `guess-${human.guesses.length}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
      className="flex items-center gap-4 rounded-lg bg-surface p-4 shadow-ring sm:p-5"
    >
      <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-game-soft text-game [&_svg]:size-7">
        {higher ? <ArrowUp strokeWidth={2.5} /> : <ArrowDown strokeWidth={2.5} />}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="type-title-1 text-fg">{higher ? "Higher" : "Lower"}</p>
        <p className="type-body text-fg-muted">
          {repeat ? `You already guessed ${value}. ` : ""}
          It&apos;s {higher ? "more" : "less"} than {value}.
        </p>
      </div>
    </motion.div>
  );
}

function CluePanel({ human, dispatch }: { human: HumanState; dispatch: (action: HumanAction) => void }) {
  const id = useId();
  const { maxSuggestions } = numberRange(human.range);
  const cards = humanCards(human);
  const left = cluesLeft(human);
  const typed = human.clues.filter((c) => c.source === "typed").reverse();
  const [text, setText] = useState("");

  const event = human.event;
  const message =
    event?.kind === "not-understood"
      ? event.message
      : event?.kind === "no-clues-left"
        ? "No clues left. Use your guesses."
        : event?.kind === "repeat-clue"
          ? `You already asked that. The answer was ${human.clues[event.index].answer ? "yes" : "no"}.`
          : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() === "") return;
    const understood = parseCustomClue(text).understood;
    dispatch({ type: "ask-text", text });
    if (understood) setText("");
  };

  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-6 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id={`${id}-title`} className="type-title-2 text-fg">
            Clues
          </h2>
          <span className="type-label tabular-nums text-fg-subtle">
            {left} of {maxSuggestions} left
          </span>
        </div>
        <p className="type-body text-fg-muted">
          Ask yes or no questions about its number. You get {maxSuggestions} {maxSuggestions === 1 ? "clue" : "clues"}, and the answer only shows once you ask.
        </p>
      </div>

      <ul className="grid gap-2.5 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.id} className="min-w-0">
            <ClueCard card={card} noneLeft={left === 0} onAsk={() => dispatch({ type: "ask-card", id: card.id })} />
          </li>
        ))}
      </ul>

      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <label htmlFor={`${id}-ask`} className="type-body font-semibold text-fg">
          Or ask your own
        </label>
        <div className="flex gap-3">
          <input
            id={`${id}-ask`}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 80))}
            autoComplete="off"
            autoCapitalize="sentences"
            spellCheck={false}
            enterKeyHint="send"
            placeholder="Is it between 20 and 40?"
            aria-describedby={message ? `${id}-message` : undefined}
            className={cn(INPUT, "type-body")}
          />
          <Button type="submit" variant="secondary" size="lg">
            Ask
          </Button>
        </div>
        {message ? (
          <p id={`${id}-message`} className="type-small flex items-start gap-2 pl-6 text-fg-muted">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {message}
          </p>
        ) : null}
      </form>

      {typed.length > 0 ? (
        <ol className="flex flex-col gap-2" aria-label="Your questions">
          {typed.map((clue) => (
            <TypedAnswer key={clue.key} clue={clue} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function Narrowed({ clue }: { clue: AskedClue }) {
  return (
    <>
      <span aria-hidden className="type-label tabular-nums text-fg-subtle">
        {formatNumber(clue.before)} → {formatNumber(clue.after)}
      </span>
      <span className="sr-only">
        Possible numbers went from {formatNumber(clue.before)} to {formatNumber(clue.after)}.
      </span>
    </>
  );
}

function ClueCard({ card, noneLeft, onAsk }: { card: ClueCardView; noneLeft: boolean; onAsk: () => void }) {
  const asked = card.asked;
  const inactive = asked != null || noneLeft;
  return (
    <button
      type="button"
      onClick={onAsk}
      aria-disabled={inactive || undefined}
      className={cn(
        "flex h-full min-h-24 w-full flex-col items-start justify-between gap-3 rounded-lg p-4 text-left",
        "transition-[background-color,transform,opacity] duration-150 ease-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        asked ? "pointer-events-none bg-sunken" : "bg-raised shadow-ring hover:bg-overlay active:scale-[0.97]",
        !asked && noneLeft && "pointer-events-none opacity-45",
      )}
    >
      <span className="type-body font-semibold text-fg">{card.question}</span>
      {asked ? (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <AnswerChip yes={asked.answer} />
          <Narrowed clue={asked} />
        </span>
      ) : (
        <span className="type-label text-game">{noneLeft ? "No clues left" : "Ask this"}</span>
      )}
    </button>
  );
}

function TypedAnswer({ clue }: { clue: AskedClue }) {
  return (
    <li className="flex flex-col gap-2 rounded-md bg-fg/[0.03] px-4 py-3">
      <span className="type-body text-fg">{clue.question}</span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <AnswerChip yes={clue.answer} />
        <Narrowed clue={clue} />
      </span>
      {clue.typoNote ? <span className="type-small text-fg-subtle">{clue.typoNote}</span> : null}
    </li>
  );
}
