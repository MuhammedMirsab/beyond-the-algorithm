"use client";

import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Info, MessageCircleQuestionMark, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { KeyHints } from "@/components/ui/key-hints";
import { cn } from "@/lib/cn";
import { parseCustomClue } from "../engine/custom-clue-parser";
import { numberRange } from "../engine/game-engine";
import { cluesLeft, humanCards, possibleNumbers, type AskedClue, type ClueCardView, type HumanAction, type HumanState } from "../engine/human";
import { formatNumber } from "../engine/ranges";
import { AnswerChip } from "./bits";
import { useKeys, useScreenFocus } from "./hooks";
import { EASE_OUT } from "./motion";
import { RangeLine, type LineFocus } from "./range-line";

const INPUT =
  "h-14 min-w-0 flex-1 rounded-full bg-sunken px-6 text-fg shadow-ring outline-none placeholder:text-fg-faint " +
  "transition-shadow duration-150 focus:shadow-[0_0_0_2px_var(--color-fg)]";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** How long the end of a round stays on the line before the results. */
export const HUMAN_END_MS = { won: 1500, lost: 2200 } as const;

/**
 * "Find its number": guess, read higher or lower on the line, narrow it down.
 * Clues are there for when you're stuck, and cost points.
 */
export function HumanPlay({
  human,
  dispatch,
  onFinished,
}: {
  human: HumanState;
  dispatch: (action: HumanAction) => void;
  /** Called a beat after the round ends, once the line has shown the number. */
  onFinished: () => void;
}) {
  const heading = useScreenFocus<HTMLHeadingElement>();
  const range = numberRange(human.range);
  const { guesses, clues } = human;
  const possible = useMemo(() => possibleNumbers({ range: human.range, guesses, clues }), [human.range, guesses, clues]);
  const finished = human.status !== "playing";
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (human.status === "playing") return;
    const id = window.setTimeout(onFinished, HUMAN_END_MS[human.status]);
    return () => window.clearTimeout(id);
  }, [human.status, onFinished]);

  const event = human.event;
  const focus: LineFocus =
    event?.kind === "guess" ? { kind: "guess", value: guesses[event.index].value } : event?.kind === "clue" ? { kind: "clue" } : null;

  const pick = (n: number) => {
    if (finished) return;
    setDraft(String(n));
    input.current?.focus();
  };

  return (
    <section className="mx-auto flex w-full max-w-[72rem] flex-col gap-5 px-4 pb-10 pt-1 sm:gap-6 sm:px-6 lg:px-8 lg:pb-14">
      <div className="flex flex-col gap-2">
        <span className="type-label text-game" aria-hidden>
          Find its number
        </span>
        <h1 ref={heading} tabIndex={-1} className="type-title-1 text-fg outline-none">
          I&apos;m thinking of a number from {range.label}.
        </h1>
      </div>

      <figure className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-ring sm:p-5">
        <figcaption className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-1">
          <span className="flex items-baseline gap-2.5">
            <NumberFlow
              value={finished && human.status === "won" ? 1 : possible.length}
              className="font-dots text-[2.75rem] leading-[0.9] font-extrabold tabular-nums text-fg [font-variation-settings:'ROND'_70]"
            />
            <span className="type-small text-fg-muted">{possible.length === 1 ? "number could be it" : "numbers could be it"}</span>
          </span>
          <GuessPips used={guesses.length} total={range.maxGuesses} won={human.status === "won"} />
        </figcaption>
        <RangeLine
          max={range.max}
          possible={possible}
          guesses={guesses}
          focus={focus}
          reveal={finished ? human.secret : null}
          onPick={finished ? undefined : pick}
        />
      </figure>

      <div className="grid items-start gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-5">
          <GuessForm
            max={range.max}
            possible={possible}
            draft={draft}
            setDraft={setDraft}
            input={input}
            disabled={finished}
            onGuess={(value) => dispatch({ type: "guess", value, now: Date.now() })}
          />
          <Feedback human={human} />
        </div>
        <CluePanel human={human} dispatch={dispatch} />
      </div>
    </section>
  );
}

function GuessPips({ used, total, won }: { used: number; total: number; won: boolean }) {
  const left = Math.max(0, total - used);
  return (
    <span className="flex flex-col items-end gap-2">
      <span role="img" aria-label={`Guess ${Math.min(used + 1, total)} of ${total}`} className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 w-3 rounded-full transition-colors duration-300 ease-out sm:w-4",
              i < used ? (won && i === used - 1 ? "bg-game" : "bg-fg-muted") : "bg-fg/15",
            )}
          />
        ))}
      </span>
      <span className="type-caption tabular-nums text-fg-subtle">
        {won ? `Found in ${used}` : `${left} ${left === 1 ? "guess" : "guesses"} left`}
      </span>
    </span>
  );
}

function GuessForm({
  max,
  possible,
  draft,
  setDraft,
  input,
  disabled,
  onGuess,
}: {
  max: number;
  possible: readonly number[];
  draft: string;
  setDraft: (value: string | ((old: string) => string)) => void;
  input: RefObject<HTMLInputElement | null>;
  disabled: boolean;
  onGuess: (value: number) => void;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);

  const n = draft === "" ? null : Number(draft);
  const valid = n !== null && Number.isInteger(n) && n >= 1 && n <= max;
  const crossedOut = valid && !possible.includes(n);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (disabled) return;
    if (!valid) {
      setError(`Type a whole number from 1 to ${formatNumber(max)}.`);
      return;
    }
    setError(null);
    onGuess(n);
    setDraft("");
    input.current?.focus();
  };

  // Type anywhere: digits go straight into the guess box.
  useKeys(
    {
      ...Object.fromEntries(
        DIGITS.map((d) => [
          d,
          () => {
            input.current?.focus();
            setDraft((old) => (old + d).replace(/^0+/, "").slice(0, 4));
            setError(null);
          },
        ]),
      ),
      Enter: () => submit(),
    },
    !disabled,
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <label htmlFor={`${id}-guess`} className="type-body font-semibold text-fg">
        Your guess
      </label>
      <div className="flex gap-3">
        <input
          ref={input}
          id={`${id}-guess`}
          value={draft}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value.replace(/\D/g, "").slice(0, 4));
            if (error) setError(null);
          }}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="go"
          placeholder={`1 to ${formatNumber(max)}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          className={cn(INPUT, "type-title-3 tabular-nums disabled:opacity-60", error && "shadow-[0_0_0_2px_var(--color-danger)]")}
        />
        <Button type="submit" variant="game" size="lg" arrow aria-disabled={disabled || undefined}>
          Guess
        </Button>
      </div>
      <div id={`${id}-help`} className={cn("type-small min-h-6 pl-6", error ? "text-danger" : "text-fg-subtle")}>
        {error ? (
          error
        ) : crossedOut ? (
          `${formatNumber(n)} is already crossed out.`
        ) : (
          <>
            <span className="pointer-fine:hidden">Or tap a number on the line.</span>
            <KeyHints
              className="hidden pointer-fine:flex"
              items={[
                { keys: ["0", "9"], join: "to", label: "Type a guess" },
                { keys: ["Enter"], label: "Guess" },
              ]}
            />
          </>
        )}
      </div>
    </form>
  );
}

/** Higher or lower, big and immediate. Replays even when the same answer repeats. */
function Feedback({ human }: { human: HumanState }) {
  const event = human.event;
  let content: { key: string; icon: ReactNode; title: string; text: string; tone: "neutral" | "game" } | null = null;

  if (human.status === "won") {
    content = { key: "won", icon: <Check />, title: "That's it", text: `You found ${formatNumber(human.secret)}.`, tone: "game" };
  } else if (human.status === "lost") {
    content = { key: "lost", icon: <X />, title: "Out of guesses", text: `Its number was ${formatNumber(human.secret)}.`, tone: "neutral" };
  } else if (event?.kind === "guess" || event?.kind === "repeat-guess") {
    const g = human.guesses[event.index];
    const higher = g.result === "higher";
    const value = formatNumber(g.value);
    content = {
      key: `${event.kind}-${human.turn}`,
      icon: higher ? <ArrowRight /> : <ArrowLeft />,
      title: higher ? "Higher" : "Lower",
      text: `${event.kind === "repeat-guess" ? `You already guessed ${value}. ` : ""}It's ${higher ? "more" : "less"} than ${value}.`,
      tone: "neutral",
    };
  }

  return (
    <div className="min-h-24" aria-hidden={content ? undefined : true}>
      <AnimatePresence mode="popLayout" initial={false}>
        {content ? (
          <motion.div
            key={content.key}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={content.tone === "game" ? { type: "spring", duration: 0.45, bounce: 0.25 } : { duration: 0.22, ease: EASE_OUT }}
            className={cn(
              "flex items-center gap-4 rounded-lg p-4 sm:p-5",
              content.tone === "game" ? "tile-surface grain" : "bg-surface shadow-ring",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "relative z-[2] grid size-14 shrink-0 place-items-center rounded-full [&_svg]:size-7 [&_svg]:stroke-[2.5]",
                content.tone === "game" ? "bg-game-ink text-game" : "bg-game-soft text-game",
              )}
            >
              {content.icon}
            </span>
            <div className="relative z-[2] flex min-w-0 flex-col gap-0.5">
              <p className={cn("type-title-1", content.tone === "game" ? "text-game-ink" : "text-fg")}>{content.title}</p>
              <p className={cn("type-body", content.tone === "game" ? "text-game-ink" : "text-fg-muted")}>{content.text}</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ── Clues ──────────────────────────────────────────────────────── */

function CluePanel({ human, dispatch }: { human: HumanState; dispatch: (action: HumanAction) => void }) {
  const id = useId();
  const { maxSuggestions } = numberRange(human.range);
  const cards = humanCards(human);
  const left = cluesLeft(human);
  const finished = human.status !== "playing";
  const typed = human.clues.filter((c) => c.source === "typed").reverse();
  const [own, setOwn] = useState(false);
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
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-4 rounded-xl bg-surface p-4 shadow-ring sm:p-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id={`${id}-title`} className="type-title-3 text-fg">
            Stuck? Ask a clue
          </h2>
          <span className="type-label tabular-nums text-fg-subtle">
            {left} of {maxSuggestions} left
          </span>
        </div>
        <p className="type-small text-fg-subtle">A yes or no answer about its number. Each clue lowers your score.</p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.id} className="min-w-0">
            <ClueCard card={card} noneLeft={left === 0 || finished} onAsk={() => dispatch({ type: "ask-card", id: card.id })} />
          </li>
        ))}
      </ul>

      {own ? (
        <form onSubmit={submit} noValidate className="flex flex-col gap-2">
          <label htmlFor={`${id}-ask`} className="type-small font-semibold text-fg">
            Your own question
          </label>
          <div className="flex gap-2">
            <input
              id={`${id}-ask`}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 80))}
              autoComplete="off"
              autoCapitalize="sentences"
              spellCheck={false}
              enterKeyHint="send"
              placeholder="Is it between 20 and 40?"
              disabled={finished}
              aria-describedby={message ? `${id}-message` : undefined}
              className={cn(INPUT, "type-body h-12")}
            />
            <Button type="submit" variant="secondary" size="md" className="h-12">
              Ask
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="ghost" size="md" icon={<MessageCircleQuestionMark />} onClick={() => setOwn(true)} className="-ml-2 self-start" aria-disabled={finished || undefined}>
          Ask your own question
        </Button>
      )}

      {message ? (
        <p id={`${id}-message`} className="type-small flex items-start gap-2 text-fg-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {message}
        </p>
      ) : null}

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
  if (asked) {
    return (
      <div className="flex h-full min-h-14 flex-col justify-center gap-1.5 rounded-md bg-sunken px-4 py-3">
        <span className="type-small font-semibold text-fg">{card.question}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <AnswerChip yes={asked.answer} />
          <Narrowed clue={asked} />
        </span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onAsk}
      aria-disabled={noneLeft || undefined}
      className={cn(
        "flex h-full min-h-14 w-full items-center rounded-md bg-raised px-4 py-3 text-left shadow-ring",
        "transition-[background-color,scale,opacity] duration-150 ease-out hover:bg-overlay active:scale-[0.97]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        noneLeft && "pointer-events-none opacity-45",
      )}
    >
      <span className="type-small font-semibold text-fg">{card.question}</span>
    </button>
  );
}

function TypedAnswer({ clue }: { clue: AskedClue }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-md bg-sunken px-4 py-3">
      <span className="type-small font-semibold text-fg">{clue.question}</span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <AnswerChip yes={clue.answer} />
        <Narrowed clue={clue} />
      </span>
      {clue.typoNote ? <span className="type-caption text-fg-subtle">{clue.typoNote}</span> : null}
    </li>
  );
}
