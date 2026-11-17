"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { StepDots } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { correctIndex, QUIZ_LENGTH, QUIZ_QUESTIONS, quizScore } from "../data/quiz";
import { sound } from "../engine/sound";

const LETTERS = ["A", "B", "C", "D"];
const KEYS: Record<string, number> = { "1": 0, "2": 1, "3": 2, a: 0, b: 1, c: 2 };

/** Five everyday moments, one at a time. An answer locks, then the explanation shows. */
export function Quiz({ onDone }: { onDone: (score: number) => void }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() => QUIZ_QUESTIONS.map(() => null));
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
    if (option === right) sound.success();
    else sound.beep();
  };

  const next = () => {
    if (!locked) return;
    if (last) onDone(quizScore(answers));
    else setIndex((i) => i + 1);
  };

  // Booth keys: 1 to 3 (or A to C) answer, Enter moves on.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
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
                  {LETTERS[i]}
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
            <div>
              <Button variant="game" size="lg" arrow onClick={next}>
                {last ? "See how you did" : "Next question"}
              </Button>
            </div>
          </>
        ) : (
          <p className="type-small hidden text-fg-subtle pointer-fine:block">Press 1, 2 or 3 to answer.</p>
        )}
      </div>
    </section>
  );
}
