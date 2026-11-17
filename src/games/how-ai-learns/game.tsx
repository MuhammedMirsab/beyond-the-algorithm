"use client";

import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { GameArt } from "@/components/art/game-art";
import { GameIntro } from "@/components/game/game-intro";
import { GameShell } from "@/components/game/game-shell";
import { NextPlayerButton } from "@/components/game/next-player";
import { ExamplesStep } from "./ui/examples-step";
import { PhotoCredits } from "./ui/photo-credits";
import { PickStep } from "./ui/pick-step";
import { ResultsStep } from "./ui/results-step";
import { TestStep } from "./ui/test-step";
import { TrainStep } from "./ui/train-step";
import { useLearnGame } from "./ui/use-learn-game";

/**
 * See how AI learns: pick two things, give a model example photos, train its
 * last layer in the browser, then test it on photos it has never seen.
 */
export function HowAiLearnsGame() {
  const game = useLearnGame();
  const { state, dataset, actions } = game;
  const stepRef = useRef<HTMLDivElement | null>(null);
  const lastStep = useRef(state.step);

  // New screen: move focus to it, so keyboard and screen reader users start at the top.
  useEffect(() => {
    if (lastStep.current === state.step) return;
    lastStep.current = state.step;
    stepRef.current?.focus({ preventScroll: true });
  }, [state.step]);

  return (
    <GameShell
      slug="how-ai-learns"
      actions={
        state.step !== "intro" ? <NextPlayerButton onClick={actions.nextPlayer} /> : null
      }
    >
      <motion.div
        key={state.step}
        ref={stepRef}
        tabIndex={-1}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-1 flex-col outline-none"
      >
        {state.step === "intro" ? (
          <GameIntro
            slug="how-ai-learns"
            art={<GameArt slug="how-ai-learns" />}
            steps={[
              { title: "Pick two things to teach it" },
              { title: "Give it example photos" },
              { title: "Train it, then test it on photos it has never seen" },
            ]}
            primary={{ label: "Start", onClick: actions.start }}
            footnote="Everything runs in this browser. Photos you take stay on this device and are deleted for the next player."
          />
        ) : null}
        {state.step === "pick" ? <PickStep game={game} /> : null}
        {state.step === "examples" ? <ExamplesStep game={game} /> : null}
        {state.step === "train" ? <TrainStep game={game} /> : null}
        {state.step === "test" ? <TestStep game={game} /> : null}
        {state.step === "results" ? <ResultsStep game={game} /> : null}
      </motion.div>
      {state.step !== "intro" && dataset.status === "ready" ? <PhotoCredits manifest={dataset.manifest} /> : null}
    </GameShell>
  );
}
