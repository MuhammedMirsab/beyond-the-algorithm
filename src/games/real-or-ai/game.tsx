"use client";

import { useEffect, useRef, useState } from "react";
import { GameArt } from "@/components/art/game-art";
import { GameIntro } from "@/components/game/game-intro";
import { GameShell } from "@/components/game/game-shell";
import { useIdle } from "@/lib/idle";
import { SoundSynthesizer } from "./engine/audio";
import { getGameQuestions, questionSources } from "./engine/pairs";
import { warmUp } from "./engine/preload";
import { ROUNDS, SECONDS_PER_ROUND } from "./engine/scoring";
import type { ActiveQuestion, PlayerAnswer } from "./engine/types";
import { ResultsScreen } from "./ui/results-screen";
import { RoundScreen } from "./ui/round-screen";

type Phase = "intro" | "playing" | "results";

interface Run {
  /** New for every game, so rounds and results always mount fresh. */
  id: number;
  questions: ActiveQuestion[];
  index: number;
  answers: PlayerAnswer[];
}

/**
 * Real or AI? Six pairs of photos, one AI-made in each. Intro, six timed
 * rounds with a reveal after each, then results with the scoreboard and
 * how the AI did it.
 */
export function RealOrAiGame() {
  const [sound] = useState(() => new SoundSynthesizer());
  useEffect(() => sound.attach(), [sound]);

  const [phase, setPhase] = useState<Phase>("intro");
  const [run, setRun] = useState<Run | null>(null);
  // The next game's pairs, picked while the intro is up so their photos can load early.
  const upcoming = useRef<ActiveQuestion[] | null>(null);

  useEffect(() => {
    if (phase !== "intro") return;
    upcoming.current ??= getGameQuestions(ROUNDS);
    return warmUp(questionSources(upcoming.current));
  }, [phase]);

  const toTop = () => window.scrollTo({ top: 0 });

  const start = () => {
    const questions = upcoming.current ?? getGameQuestions(ROUNDS);
    upcoming.current = null;
    setRun((prev) => ({ id: (prev?.id ?? 0) + 1, questions, index: 0, answers: [] }));
    setPhase("playing");
    sound.playWhoosh();
    toTop();
  };

  const recordAnswer = (answer: PlayerAnswer) => {
    setRun((r) =>
      r && !r.answers.some((a) => a.questionIndex === answer.questionIndex) ? { ...r, answers: [...r.answers, answer] } : r,
    );
  };

  const advance = (fromIndex: number) => {
    if (!run || run.index !== fromIndex) return;
    if (fromIndex + 1 < run.questions.length) {
      setRun({ ...run, index: fromIndex + 1 });
    } else {
      setPhase("results");
      sound.playFanfare();
    }
    toTop();
  };

  /** Booth reset: back to the intro with nothing of this visitor left in memory. */
  const nextPlayer = () => {
    setPhase("intro");
    setRun(null);
    sound.playPop();
    toTop();
  };

  useIdle(
    () => {
      if (phase === "intro") toTop();
      else nextPlayer();
    },
    { enabled: phase !== "playing" },
  );

  return (
    <GameShell slug="real-or-ai" sound>
      {phase === "playing" && run ? (
        <RoundScreen
          key={`${run.id}-${run.index}`}
          question={run.questions[run.index]}
          index={run.index}
          nextQuestion={run.questions[run.index + 1] ?? null}
          isLast={run.index === run.questions.length - 1}
          sound={sound}
          onAnswer={recordAnswer}
          onNext={() => advance(run.index)}
          onIdle={nextPlayer}
        />
      ) : phase === "results" && run ? (
        <ResultsScreen
          key={run.id}
          questions={run.questions}
          answers={run.answers}
          onPlayAgain={start}
          onNextPlayer={nextPlayer}
        />
      ) : (
        <GameIntro
          slug="real-or-ai"
          art={<GameArt slug="real-or-ai" />}
          steps={[
            { title: "Look at two photos of the same scene", text: "One is a real photo. AI redrew the other one." },
            { title: "Pick the one AI made before the timer runs out", text: "Tap it, or press A or B. The magnifier gives you a closer look." },
            { title: "See what gave it away", text: "After each pick, the clues show where AI slipped." },
          ]}
          primary={{ label: "Start game", onClick: start }}
          footnote={`${ROUNDS} rounds, ${SECONDS_PER_ROUND} seconds each. The photos get harder as you go.`}
        />
      )}
    </GameShell>
  );
}
