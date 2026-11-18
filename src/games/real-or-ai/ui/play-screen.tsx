"use client";

import { AnimatePresence } from "motion/react";
import { useCallback, useState, type CSSProperties } from "react";
import type { SoundSynthesizer } from "../engine/audio";
import { pairAspect } from "../engine/pairs";
import type { ActiveQuestion, PlayerAnswer } from "../engine/types";
import type { Clock } from "./countdown";
import { outcomeOf } from "./labels";
import { RoundHud } from "./round-hud";
import { RoundScreen } from "./round-screen";
import { cn } from "@/lib/cn";

export interface Run {
  /** New for every game, so rounds and results always mount fresh. */
  id: number;
  questions: ActiveQuestion[];
  index: number;
  answers: PlayerAnswer[];
}

/**
 * The six rounds. The HUD stays put for the whole game (its round track
 * fills in, its timer bar refills between rounds) while each round slides in
 * from the right and out to the left beneath it.
 */
export function PlayScreen({
  run,
  sound,
  onAnswer,
  onAdvance,
  onIdle,
}: {
  run: Run;
  sound: SoundSynthesizer;
  onAnswer: (answer: PlayerAnswer) => void;
  onAdvance: (fromIndex: number) => void;
  onIdle: () => void;
}) {
  const question = run.questions[run.index];
  const [clock, setClock] = useState<Clock>({ state: "waiting" });
  // The shape of the round on screen: it sets the play area's width, so the HUD lines up with the photos.
  const [ratio, setRatio] = useState(() => pairAspect(question.pair));
  const onShow = useCallback((aspect: number) => {
    setRatio(aspect);
    window.scrollTo({ top: 0 });
  }, []);

  const outcomes = run.questions.map((_, i) => {
    const answer = run.answers.find((a) => a.questionIndex === i);
    return answer ? outcomeOf(answer) : undefined;
  });

  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-1 flex-col gap-4 pb-6 pt-2",
        "[--gutter:1rem] sm:[--gutter:1.5rem] lg:[--gutter:2rem] [--gap:0.75rem] md:[--gap:1rem] lg:[--gap:1.5rem]",
        // Vertical space everything except the photos needs, with the reveal showing, so nothing jumps.
        "[--chrome:31rem] lg:[--chrome:25.5rem] [--photo-h:max(12rem,calc(100dvh_-_var(--chrome)))]",
        "px-[var(--gutter)] md:max-w-[calc(2*var(--photo-h)*var(--ratio)_+_var(--gap)_+_2*var(--gutter))]",
        "transition-[max-width] duration-300 ease-out motion-reduce:transition-none",
      )}
      style={{ "--ratio": ratio } as CSSProperties}
    >
      <RoundHud index={run.index} total={run.questions.length} outcomes={outcomes} clock={clock} />
      <AnimatePresence mode="wait">
        <RoundScreen
          key={`${run.id}-${run.index}`}
          question={question}
          index={run.index}
          nextQuestion={run.questions[run.index + 1] ?? null}
          isLast={run.index === run.questions.length - 1}
          sound={sound}
          onAnswer={onAnswer}
          onNext={() => onAdvance(run.index)}
          onIdle={onIdle}
          onClock={setClock}
          onShow={onShow}
        />
      </AnimatePresence>
    </div>
  );
}
