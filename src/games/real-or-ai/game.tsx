"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { GameArt } from "@/components/art/game-art";
import { GameIntro } from "@/components/game/game-intro";
import { GameShell } from "@/components/game/game-shell";
import { NextPlayerButton } from "@/components/game/next-player";
import { entrance } from "@/lib/entrance";
import { useIdle } from "@/lib/idle";
import { track } from "@/lib/play-tracker";
import { SoundSynthesizer } from "./engine/audio";
import { getGameQuestions, questionSources } from "./engine/pairs";
import { warmUp } from "./engine/preload";
import { MAX_SCORE, ROUNDS, SECONDS_PER_ROUND, summarize, verdict } from "./engine/scoring";
import type { ActiveQuestion, PlayerAnswer } from "./engine/types";
import { PlayScreen, type Run } from "./ui/play-screen";
import { ResultsScreen } from "./ui/results-screen";
import { isControl } from "./ui/round-screen";

type Phase = "intro" | "playing" | "results";

/** Screens cross-fade: out quickly, in a little slower. */
const SCREEN = {
  animate: { opacity: 1, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] } },
} as const;

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
    track.start(run ? "again" : "first", questions.length);
    setRun((prev) => ({ id: (prev?.id ?? 0) + 1, questions, index: 0, answers: [] }));
    setPhase("playing");
    sound.playWhoosh();
    toTop();
  };

  const recordAnswer = (answer: PlayerAnswer) => {
    if (run && !run.answers.some((a) => a.questionIndex === answer.questionIndex)) {
      const outcome = answer.selectedOptionKey === null ? "timeout" : answer.isCorrect ? "right" : "wrong";
      track.step(`round-${answer.questionIndex + 1}`, outcome);
    }
    setRun((r) =>
      r && !r.answers.some((a) => a.questionIndex === answer.questionIndex) ? { ...r, answers: [...r.answers, answer] } : r,
    );
  };

  const advance = (fromIndex: number) => {
    if (!run || run.index !== fromIndex) return;
    if (fromIndex + 1 < run.questions.length) {
      setRun((r) => (r && r.index === fromIndex ? { ...r, index: fromIndex + 1 } : r));
    } else {
      const summary = summarize(run.answers);
      track.end({
        score: summary.score,
        outOf: MAX_SCORE,
        won: summary.correct * 2 > summary.total,
        label: verdict(summary.correct, summary.total).toLowerCase(),
      });
      setPhase("results");
      sound.playFanfare();
      toTop();
    }
  };

  /** Booth reset: back to the intro with nothing of this visitor left in memory. */
  const nextPlayer = () => {
    track.nextPlayer();
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

  // Enter starts the game from the intro (the laptop's quickest way in).
  const onIntroKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.repeat || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isControl(e.target)) return;
    e.preventDefault();
    start();
  });
  useEffect(() => {
    if (phase !== "intro") return;
    const listener = (e: KeyboardEvent) => onIntroKey(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [phase]);

  return (
    <GameShell slug="real-or-ai" sound actions={phase === "intro" ? null : <NextPlayerButton onClick={nextPlayer} />}>
      <AnimatePresence mode="wait" initial={false}>
        {phase === "playing" && run ? (
          <motion.div key={`play-${run.id}`} className="flex flex-1 flex-col" initial={{ opacity: 0 }} {...SCREEN}>
            <PlayScreen run={run} sound={sound} onAnswer={recordAnswer} onAdvance={advance} onIdle={nextPlayer} />
          </motion.div>
        ) : phase === "results" && run ? (
          <motion.div key={`results-${run.id}`} className="flex flex-1 flex-col" initial={{ opacity: 0 }} {...SCREEN}>
            <ResultsScreen questions={run.questions} answers={run.answers} onPlayAgain={start} onNextPlayer={nextPlayer} />
          </motion.div>
        ) : (
          <motion.div key="intro" className="flex flex-1 flex-col" initial={entrance({ opacity: 0 })} {...SCREEN}>
            <GameIntro
              slug="real-or-ai"
              art={<GameArt slug="real-or-ai" mode="intro" />}
              steps={[
                { title: "Two photos, one scene", text: "One is a real photo. AI made the other one from it." },
                {
                  title: "Pick the one AI made",
                  text: "Tap or click it before the timer runs out. The magnifier shows the fine detail where AI slips.",
                },
                { title: "See what gave it away", text: "Each round ends with the clues circled on the photo." },
              ]}
              primary={{ label: "Start game", onClick: start }}
              footnote={`${ROUNDS} rounds, ${SECONDS_PER_ROUND} seconds each. The photos get harder as you go.`}
              keys={[
                { keys: ["Enter"], label: "Start game" },
                { keys: ["A", "B"], label: "Pick a photo" },
              ]}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  );
}
