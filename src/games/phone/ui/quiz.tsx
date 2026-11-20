"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { KeyHints } from "@/components/ui/key-hints";
import { StepDots } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { track } from "@/lib/play-tracker";
import { correctIndex, QUIZ_LENGTH, QUIZ_QUESTIONS, quizScore } from "../data/quiz";
import { sound } from "../engine/sound";
import { useShared } from "../link/link";

const KEYS: Record<string, number> = { "1": 0, "2": 1, "3": 2 };

/** Five everyday moments, one at a time. An answer locks, then the explanation shows. */
export function Quiz({ keys = true, onDone }: { keys?: boolean; onDone: (score: number) => void }) {
  const [localIndex, setIndex] = useState(0);
  const [localAnswers, setAnswers] = useState<(number | null)[]>(() => QUIZ_QUESTIONS.map(() => null));
  // A booth screen linked to a phone shows the phone's question and answers (checked: they came from another device).
  const shared = useShared("quiz", { index: localIndex, answers: localAnswers });
  const index = Number.isInteger(shared.index) ? Math.min(QUIZ_LENGTH - 1, Math.max(0, shared.index)) : 0;
  const answers = QUIZ_QUESTIONS.map((_, i) => {
    const a = Array.isArray(shared.answers) ? shared.answers[i] : null;
    return typeof a === "number" && Number.isInteger(a) && a >= 0 && a < 4 ? a : null;
  });
  const heading = useRef<HTMLHeadingElement>(null);

  const question = QUIZ_QUESTIONS[index];
  const chosen = answers[index];
  const locked = chosen != null;
  const right = correctIndex(question);
  const last = index === QUIZ_LENGTH - 1;

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [index]);

  const choose = (option: number) => {
    if (locked || option >= question.options.length) return;
    setAnswers((list) => list.map((v, i) => (i === index ? option : v)));
    track.step("quiz-answer", option === right ? "right" : "wrong");
    if (option === right) sound.success();
    else sound.beep();
  };

  const next = () => {
    if (!locked) return;
    if (last) onDone(quizScore(answers));
    else setIndex((i) => i + 1);
  };

  // Booth keys: 1 to 3 answer, Enter moves on.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (!keys || event.altKey || event.ctrlKey || event.metaKey) return;
    const option = KEYS[event.key.toLowerCase()];
    if (option != null) {
      event.preventDefault();
      choose(option);
    } else if (event.key === "Enter" && locked) {
      event.preventDefault();
      next();
    }
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const gotIt = locked && chosen === right;

  return (
    <section className="mx-auto flex w-full max-w-[46rem] flex-col gap-8 px-4 pb-16 pt-4 sm:px-6 lg:pt-8">
      <div className="flex items-center justify-between gap-4">
        <span className="type-label text-game">
          Question {index + 1} of {QUIZ_LENGTH}
        </span>
        <StepDots total={QUIZ_LENGTH} current={index} label="Question" />
      </div>

      <div className="flex flex-col gap-3">
        <p className="type-body-lg text-fg-muted">{question.scenario}</p>
        <h1 ref={heading} tabIndex={-1} className="type-title-1 text-fg outline-none">
          {question.question}
        </h1>
      </div>

      <ul className="flex flex-col gap-3">
        {question.options.map((option, i) => {
          const isRight = i === right;
          const isChosen = i === chosen;
          return (
            <li key={option.text}>
              <button
                type="button"
                onClick={() => choose(i)}
                aria-disabled={locked || undefined}
                className={cn(
                  "flex min-h-16 w-full items-center gap-4 rounded-lg px-4 py-3 text-left shadow-ring",
                  "transition-[background-color,opacity,transform] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                  !locked && "bg-surface hover:bg-raised active:scale-[0.99]",
                  locked && isRight && "bg-success/15",
                  locked && isChosen && !isRight && "bg-danger/15",
                  locked && !isRight && !isChosen && "bg-surface opacity-55",
                  locked && "cursor-default",
                )}
              >
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-fg/10 font-mono text-[0.8125rem] font-semibold text-fg">
                  {i + 1}
                </span>
                <span className="type-body-lg min-w-0 flex-1 font-semibold text-fg">{option.text}</span>
                {locked && isRight ? (
                  <span className="type-small inline-flex shrink-0 items-center gap-1.5 font-semibold text-success">
                    <CircleCheck aria-hidden className="size-5" />
                    Right answer
                  </span>
                ) : null}
                {locked && isChosen && !isRight ? (
                  <span className="type-small inline-flex shrink-0 items-center gap-1.5 font-semibold text-danger">
                    <CircleX aria-hidden className="size-5" />
                    Your answer
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div aria-live="polite" className="flex flex-col gap-6">
        {locked ? (
          <>
            <div className="flex flex-col gap-2 rounded-lg bg-surface p-5 shadow-ring">
              <p className={cn("type-title-3 inline-flex items-center gap-2", gotIt ? "text-success" : "text-fg")}>
                {gotIt ? <CircleCheck aria-hidden className="size-5" /> : <CircleX aria-hidden className="size-5 text-danger" />}
                {gotIt ? "Right." : "Not quite."}
              </p>
              <p className="type-body text-fg-muted">{question.explanation}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <Button variant="game" size="lg" arrow onClick={next}>
                {last ? "See how you did" : "Next question"}
              </Button>
              {keys ? (
                <div className="hidden pointer-fine:block">
                  <KeyHints items={[{ keys: ["Enter"], label: last ? "See how you did" : "Next question" }]} />
                </div>
              ) : null}
            </div>
          </>
        ) : keys ? (
          <div className="hidden pointer-fine:block">
            <KeyHints items={[{ keys: ["1", "2", "3"], label: "Answer" }]} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
