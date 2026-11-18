"use client";

import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { KeyHints } from "@/components/ui/key-hints";
import { cn } from "@/lib/cn";
import { evaluateClue } from "../engine/clues";
import { machineCandidates, machineGuess, machineQuestion, type MachineAction, type MachineState } from "../engine/machine";
import { binaryQuestionHint, binaryQuestionText, type BinaryQuestion } from "../engine/prediction-engine";
import { formatNumber, halvingsFor, isRangeId, RANGE_IDS, RANGE_MAX, rangeLabel, type RangeId } from "../engine/ranges";
import { NumberField } from "./field/number-field";
import { useKeys, useScreenFocus } from "./hooks";
import { EASE_OUT } from "./motion";

/**
 * The beat after each answer: the crossed-out half falls away and the rest
 * glide together. Answers that arrive during it are ignored by the reducer.
 */
const NARROWING_MS = 700;

/** The reveal lands before "Is that right?" can be answered. */
const CONFIRM_ARM_MS = 900;

const RANGE_OPTIONS = RANGE_IDS.map((id) => ({ value: id, label: rangeLabel(id) }));

/** Keyboard hints only where there is a keyboard. */
const KEYS_SHOWN = "hidden pointer-fine:flex";

/**
 * "Let it read my mind", from "think of a number" to the guess. The field
 * stays mounted the whole time, so every answer plays out on the same picture.
 */
export function MachinePlay({
  machine,
  dispatch,
  onRangeChange,
}: {
  machine: MachineState;
  dispatch: (action: MachineAction) => void;
  onRangeChange: (range: RangeId) => void;
}) {
  const { phase, steps, range } = machine;
  const max = RANGE_MAX[range];
  const [hovered, setHovered] = useState<boolean | null>(null);

  // Stable between renders, so the field only does work when something changed.
  const candidates = useMemo(() => machineCandidates({ range, phase: "ask", steps }), [range, steps]);
  const question = useMemo(() => (phase === "ask" ? machineQuestion({ range, phase, steps }) : null), [range, phase, steps]);

  useEffect(() => {
    if (phase !== "narrowing") return;
    const id = window.setTimeout(() => dispatch({ type: "advance" }), NARROWING_MS);
    return () => window.clearTimeout(id);
  }, [phase, steps.length, dispatch]);

  const panel = phase === "think" ? "think" : phase === "guess" ? "guess" : "ask";
  const answer = (yes: boolean) => dispatch({ type: "answer", answer: yes });

  return (
    <section className="mx-auto grid w-full max-w-[72rem] flex-1 content-start items-center gap-5 px-4 pb-8 pt-1 sm:gap-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:content-center lg:gap-14 lg:px-8 lg:pb-12">
      <div className="order-2 min-w-0 lg:order-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={panel}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
          >
            {panel === "think" ? (
              <ThinkPanel range={range} onRangeChange={onRangeChange} onStart={() => dispatch({ type: "start" })} />
            ) : panel === "guess" ? (
              <GuessPanel machine={machine} dispatch={dispatch} />
            ) : (
              <AskPanel
                machine={machine}
                candidates={candidates}
                onAnswer={answer}
                onUndo={() => dispatch({ type: "undo" })}
                onPreview={setHovered}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <FieldPanel
        className="order-1 lg:order-2"
        max={max}
        candidates={candidates}
        question={question}
        preview={phase === "ask" ? hovered : null}
        reveal={phase === "guess"}
        answered={steps.length}
      />
    </section>
  );
}

/* ── The field and its two readouts ─────────────────────────────── */

function FieldPanel({
  max,
  candidates,
  question,
  preview,
  reveal,
  answered,
  className,
}: {
  max: number;
  candidates: readonly number[];
  question: BinaryQuestion | null;
  preview: boolean | null;
  reveal: boolean;
  answered: number;
  className?: string;
}) {
  const left = candidates.length;
  const total = halvingsFor(max);
  const needed = halvingsFor(left);
  const caption =
    needed === 0
      ? `Found with ${answered} ${answered === 1 ? "question" : "questions"}`
      : answered === 0
        ? `At most ${total} questions`
        : `At most ${needed} more`;

  return (
    <figure className={cn("flex w-full min-w-0 flex-col gap-3 rounded-xl bg-surface p-3 shadow-ring sm:gap-4 sm:p-5", className)}>
      <figcaption className="flex items-end justify-between gap-4 px-1">
        <span className="flex items-baseline gap-2.5">
          <NumberFlow
            value={left}
            className="font-dots text-[2.75rem] leading-[0.9] font-extrabold tabular-nums text-fg [font-variation-settings:'ROND'_70]"
          />
          <span className="type-small text-fg-muted">could be yours</span>
        </span>
        <span className="flex flex-col items-end gap-2">
          <span role="img" aria-label={`${answered} of at most ${total} questions asked`} className="flex gap-1">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-2 w-3 rounded-full transition-colors duration-300 ease-out sm:w-4",
                  i < answered ? "bg-game" : i < answered + needed ? "bg-fg/20" : "bg-fg/[0.06]",
                )}
              />
            ))}
          </span>
          <span className="type-caption tabular-nums text-fg-subtle">{caption}</span>
        </span>
      </figcaption>
      <NumberField
        className="h-[min(19rem,36dvh)] w-full sm:h-[min(26rem,44dvh)] lg:h-[min(33rem,calc(100dvh-14rem))]"
        max={max}
        candidates={candidates}
        question={question}
        preview={preview}
        reveal={reveal}
      />
    </figure>
  );
}

/* ── Think of a number ──────────────────────────────────────────── */

function ThinkPanel({ range, onRangeChange, onStart }: { range: RangeId; onRangeChange: (range: RangeId) => void; onStart: () => void }) {
  const heading = useScreenFocus<HTMLHeadingElement>();
  useKeys({ Enter: onStart });

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <h1 ref={heading} tabIndex={-1} className="type-title-1 text-fg outline-none lg:type-display-2">
          Think of a number from {rangeLabel(range)}.
        </h1>
        <p className="type-body-lg max-w-[32rem] text-fg-muted">Keep it in your head. It can only ask yes or no questions.</p>
      </div>
      <Segmented
        label="Numbers from"
        value={range}
        onValueChange={(value: string) => {
          if (isRangeId(value)) onRangeChange(value);
        }}
        options={RANGE_OPTIONS}
      />
      <div className="flex flex-col gap-4">
        <Button variant="game" size="lg" arrow onClick={onStart} className="self-start">
          Ask me
        </Button>
        <KeyHints className={KEYS_SHOWN} items={[{ keys: ["Enter"], label: "Ask me" }]} />
      </div>
    </div>
  );
}

/* ── One question ───────────────────────────────────────────────── */

function AskPanel({
  machine,
  candidates,
  onAnswer,
  onUndo,
  onPreview,
}: {
  machine: MachineState;
  /** What's possible now (while narrowing: after the answer just given). */
  candidates: readonly number[];
  onAnswer: (yes: boolean) => void;
  onUndo: () => void;
  onPreview: (answer: boolean | null) => void;
}) {
  const heading = useScreenFocus<HTMLHeadingElement>();
  const narrowing = machine.phase === "narrowing";
  const question = machineQuestion(machine);
  // Each answer's outcome, worked out before you give it: the machine's whole plan.
  const asked = narrowing ? (machine.steps[machine.steps.length - 1]?.before ?? 0) : candidates.length;
  const yesLeft = narrowing
    ? given(machine) === true
      ? candidates.length
      : asked - candidates.length
    : question
      ? candidates.filter((n) => evaluateClue(question, n)).length
      : 0;
  const noLeft = asked - yesLeft;
  const number = narrowing ? machine.steps.length : machine.steps.length + 1;
  const answerGiven = given(machine);
  const canUndo = machine.phase === "ask" && machine.steps.length > 0;

  useKeys({
    y: () => onAnswer(true),
    n: () => onAnswer(false),
    ArrowLeft: () => onAnswer(true),
    ArrowRight: () => onAnswer(false),
    Backspace: () => {
      if (canUndo) onUndo();
    },
  });

  return (
    <div className="flex flex-col gap-6 sm:gap-7">
      <div className="flex flex-col gap-2 sm:gap-3">
        <span className="type-label text-game" aria-hidden>
          Question {number}
        </span>
        {/* The heading stays put (it may hold focus); only its text swaps. */}
        <h1 ref={heading} tabIndex={-1} className="type-title-1 min-h-[2lh] text-fg outline-none lg:type-display-2">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={number}
              className="block"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: narrowing ? 0.4 : 1, y: 0, transition: { duration: 0.26, ease: EASE_OUT } }}
              exit={{ opacity: 0, x: answerGiven === false ? 28 : -28, transition: { duration: 0.16, ease: EASE_OUT } }}
            >
              {question ? binaryQuestionText(question) : null}
            </motion.span>
          </AnimatePresence>
        </h1>
        {/* Always rendered, so the answers don't jump when a hint appears. */}
        <p className="type-body min-h-[1lh] text-fg-muted sm:type-body-lg">{question ? binaryQuestionHint(question) : null}</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3" role="group" aria-label="Your answer">
          <Pad
            label="Yes"
            detail={`leaves ${formatNumber(yesLeft)}`}
            mark={<span aria-hidden className="size-[18px] rounded-[5px] bg-game" />}
            chosen={answerGiven === true}
            faded={answerGiven === false}
            onPress={() => onAnswer(true)}
            onPreview={(on) => onPreview(on ? true : null)}
          />
          <Pad
            label="No"
            detail={`leaves ${formatNumber(noLeft)}`}
            mark={<span aria-hidden className="size-[18px] rounded-[5px] bg-fg/25" />}
            chosen={answerGiven === false}
            faded={answerGiven === true}
            onPress={() => onAnswer(false)}
            onPreview={(on) => onPreview(on ? false : null)}
          />
        </div>
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <KeyHints
            className={KEYS_SHOWN}
            items={[
              { keys: ["Y"], label: "Yes" },
              { keys: ["N"], label: "No" },
              { keys: ["Backspace"], label: "Undo" },
            ]}
          />
          {/* aria-disabled, not disabled: a disabled button drops keyboard focus. */}
          <Button variant="ghost" size="md" icon={<Undo2 />} onClick={onUndo} aria-disabled={!canUndo || undefined} className="-mr-2 ml-auto">
            Undo
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The answer just given, while its half falls away. */
function given(machine: MachineState): boolean | null {
  return machine.phase === "narrowing" ? (machine.steps[machine.steps.length - 1]?.answer ?? null) : null;
}

/**
 * A big answer button. Its swatch matches the field: game-coloured numbers
 * answer yes, grey ones answer no. Hover (or keyboard focus) previews the
 * half it would cross out.
 */
function Pad({
  label,
  detail,
  mark,
  chosen,
  faded,
  onPress,
  onPreview,
}: {
  label: string;
  /** A second line in the machine's voice, e.g. "leaves 50". */
  detail?: string;
  mark: ReactNode;
  chosen: boolean;
  faded: boolean;
  onPress: () => void;
  onPreview: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") onPreview(true);
      }}
      onPointerLeave={() => onPreview(false)}
      onFocus={(e) => {
        if (e.currentTarget.matches(":focus-visible")) onPreview(true);
      }}
      onBlur={() => onPreview(false)}
      className={cn(
        "inline-flex h-16 select-none items-center justify-center gap-3 rounded-full text-[1.25rem] font-bold sm:h-20 sm:text-[1.375rem]",
        "transition-[background-color,color,scale,opacity] duration-150 ease-out active:scale-[0.97]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        chosen ? "bg-fg text-canvas" : "bg-raised text-fg shadow-ring hover:bg-overlay",
        faded && "opacity-40",
      )}
    >
      {mark}
      {detail ? (
        <span className="flex flex-col items-start leading-none">
          <span>{label}</span>
          <span className={cn("type-label mt-1.5 tabular-nums", chosen ? "text-canvas/70" : "text-fg-subtle")}>{detail}</span>
        </span>
      ) : (
        label
      )}
    </button>
  );
}

/* ── The guess ──────────────────────────────────────────────────── */

function GuessPanel({ machine, dispatch }: { machine: MachineState; dispatch: (action: MachineAction) => void }) {
  const heading = useScreenFocus<HTMLHeadingElement>();
  const guess = machineGuess(machine);
  const asked = machine.steps.length;
  const confirm = (correct: boolean) => dispatch({ type: "confirm", correct });
  // Keys arm with the buttons, so a doubled N on the last question can't answer this one.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setArmed(true), CONFIRM_ARM_MS);
    return () => window.clearTimeout(id);
  }, []);
  useKeys({ y: () => confirm(true), n: () => confirm(false) }, armed);

  return (
    <div className="flex flex-col gap-6 sm:gap-7">
      <div className="flex flex-col gap-2 sm:gap-3">
        <span className="type-label text-game">
          {asked} {asked === 1 ? "answer" : "answers"}, 1 number left
        </span>
        <h1 ref={heading} tabIndex={-1} className="type-title-1 text-fg outline-none lg:type-display-2">
          Your number is{" "}
          <motion.span
            className="inline-block text-game"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.6 }}
          >
            {formatNumber(guess)}.
          </motion.span>
        </h1>
        <p className="type-body min-h-[1lh] text-fg-muted sm:type-body-lg">Is that right?</p>
      </div>
      <motion.div
        className={cn("flex flex-col gap-4", !armed && "pointer-events-none")}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: EASE_OUT, delay: CONFIRM_ARM_MS / 1000 }}
      >
        <div className="grid grid-cols-2 gap-3" role="group" aria-label="Is that your number?">
          <Pad label="Yes" mark={<Check aria-hidden className="size-6" />} chosen={false} faded={false} onPress={() => confirm(true)} onPreview={() => {}} />
          <Pad label="No" mark={<X aria-hidden className="size-6" />} chosen={false} faded={false} onPress={() => confirm(false)} onPreview={() => {}} />
        </div>
        <KeyHints
          className={KEYS_SHOWN}
          items={[
            { keys: ["Y"], label: "Yes" },
            { keys: ["N"], label: "No" },
          ]}
        />
      </motion.div>
    </div>
  );
}
