"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Undo2, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/surface";
import { machineCandidates, machineGuess, machineQuestion, type MachineAction, type MachineState } from "../engine/machine";
import { binaryQuestionHint, binaryQuestionText } from "../engine/prediction-engine";
import { formatNumber, rangeLabel } from "../engine/ranges";
import { ButtonKey } from "./bits";
import { useKeys, useScreenFocus } from "./hooks";
import { MachineView } from "./machine-view";

/** The beat after each answer while the ruled-out numbers dim. */
const NARROWING_MS = 420;

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * "Let it read my mind", from "think of a number" to the guess. The machine's
 * view stays mounted beside every step, so its cells dim in place.
 */
export function MachinePlay({
  machine,
  dispatch,
  onChangeRange,
}: {
  machine: MachineState;
  dispatch: (action: MachineAction) => void;
  onChangeRange: () => void;
}) {
  const { phase, steps } = machine;

  useEffect(() => {
    if (phase !== "narrowing") return;
    const id = window.setTimeout(() => dispatch({ type: "advance" }), NARROWING_MS);
    return () => window.clearTimeout(id);
  }, [phase, steps.length, dispatch]);

  const panel = phase === "think" ? "think" : phase === "guess" ? "guess" : "ask";

  return (
    <section className="mx-auto grid w-full max-w-[69rem] flex-1 content-center items-center gap-8 px-4 pb-10 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14 lg:px-8 lg:pb-16">
      <div className="min-w-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={panel}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
          >
            {panel === "think" ? (
              <ThinkPanel machine={machine} dispatch={dispatch} onChangeRange={onChangeRange} />
            ) : panel === "guess" ? (
              <GuessPanel machine={machine} dispatch={dispatch} />
            ) : (
              <AskPanel machine={machine} dispatch={dispatch} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <MachineView range={machine.range} candidates={machineCandidates(machine)} className="lg:self-center" />
    </section>
  );
}

function ThinkPanel({
  machine,
  dispatch,
  onChangeRange,
}: {
  machine: MachineState;
  dispatch: (action: MachineAction) => void;
  onChangeRange: () => void;
}) {
  const heading = useScreenFocus<HTMLHeadingElement>();
  const start = () => dispatch({ type: "start" });
  useKeys({ Enter: start });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 ref={heading} tabIndex={-1} className="type-display-2 text-fg outline-none">
          Think of a number from {rangeLabel(machine.range)}.
        </h1>
        <p className="type-body-lg max-w-[34rem] text-fg-muted">
          Keep it in your head and don&apos;t say it. It will only ask yes or no questions.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="game" size="lg" arrow onClick={start}>
            I&apos;ve got my number
          </Button>
          <Button variant="ghost" size="lg" onClick={onChangeRange}>
            Change range
          </Button>
        </div>
        <p className="type-small hidden items-center gap-2 text-fg-subtle lg:flex">
          Or press <Kbd>Enter</Kbd>
        </p>
      </div>
    </div>
  );
}

function AskPanel({ machine, dispatch }: { machine: MachineState; dispatch: (action: MachineAction) => void }) {
  const heading = useScreenFocus<HTMLHeadingElement>();
  const narrowing = machine.phase === "narrowing";
  const question = machineQuestion(machine);
  const number = narrowing ? machine.steps.length : machine.steps.length + 1;
  const canUndo = machine.phase === "ask" && machine.steps.length > 0;

  const answer = (yes: boolean) => dispatch({ type: "answer", answer: yes });
  const undo = () => dispatch({ type: "undo" });
  useKeys({ y: () => answer(true), ArrowLeft: () => answer(true), n: () => answer(false), ArrowRight: () => answer(false) });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <span className="type-label text-game" aria-hidden>
          {narrowing ? "Narrowing it down" : `Question ${number}`}
        </span>
        {/* The heading stays put (it may hold focus); only its text swaps. */}
        <h1 ref={heading} tabIndex={-1} className="type-display-2 min-h-[2lh] text-fg outline-none">
          <motion.span
            key={number}
            className="block"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: narrowing ? 0.35 : 1, y: 0 }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
          >
            {question ? binaryQuestionText(question) : null}
          </motion.span>
        </h1>
        {/* Always rendered, so the buttons don't jump when a hint appears. */}
        <p className="type-body-lg min-h-[1lh] text-fg-muted">{question ? binaryQuestionHint(question) : null}</p>
      </div>

      <div className="flex flex-col items-start gap-4">
        <div className="grid w-full grid-cols-2 gap-3 sm:max-w-[30rem]">
          <Button variant="secondary" size="lg" icon={<Check />} onClick={() => answer(true)} className="w-full">
            Yes
            <ButtonKey>Y</ButtonKey>
          </Button>
          <Button variant="secondary" size="lg" icon={<X />} onClick={() => answer(false)} className="w-full">
            No
            <ButtonKey>N</ButtonKey>
          </Button>
        </div>
        {/* aria-disabled, not disabled: a disabled button drops keyboard focus. */}
        <Button variant="ghost" size="md" icon={<Undo2 />} onClick={undo} aria-disabled={!canUndo || undefined} className="-ml-2">
          Undo last answer
        </Button>
      </div>
    </div>
  );
}

function GuessPanel({ machine, dispatch }: { machine: MachineState; dispatch: (action: MachineAction) => void }) {
  const heading = useScreenFocus<HTMLHeadingElement>();
  const guess = machineGuess(machine);
  const asked = machine.steps.length;
  const confirm = (correct: boolean) => dispatch({ type: "confirm", correct });
  useKeys({ y: () => confirm(true), n: () => confirm(false) });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <h1 ref={heading} tabIndex={-1} className="type-title-1 text-fg outline-none">
          Your number is<span className="sr-only"> {formatNumber(guess)}</span>
        </h1>
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", duration: 0.55, bounce: 0.28 }}
          className="tile-surface grain grid h-44 w-full max-w-[24rem] place-items-center rounded-xl sm:h-52"
        >
          <span className="type-score relative z-[2] text-game-ink">{formatNumber(guess)}</span>
        </motion.div>
        <p className="type-label text-fg-subtle">
          Worked out from {asked} {asked === 1 ? "answer" : "answers"}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="game" size="lg" icon={<Check />} onClick={() => confirm(true)}>
          Yes, that&apos;s it
          <ButtonKey onGame>Y</ButtonKey>
        </Button>
        <Button variant="secondary" size="lg" icon={<X />} onClick={() => confirm(false)}>
          No, it&apos;s not
          <ButtonKey>N</ButtonKey>
        </Button>
      </div>
    </div>
  );
}
