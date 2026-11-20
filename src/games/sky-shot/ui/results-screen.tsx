"use client";

import { AnimatePresence, motion } from "motion/react";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { HowItWorks, ResultPanel } from "@/components/game/panels";
import { NextPlayerIcon } from "@/components/game/next-player";
import { NameEntry, Scoreboard } from "@/components/game/scoreboard";
import { Button } from "@/components/ui/button";
import { KeyHints } from "@/components/ui/key-hints";
import { Score, Stat } from "@/components/ui/score";
import { useBoard } from "@/lib/leaderboard";
import { BIRDS_PER_ROUND, MAX_ROUNDS, type RunSummary } from "../engine/world";

/** Shared board id: boards/sky-shot/entries in Firestore. */
export const BOARD_ID = "sky-shot";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const fmt = (n: number) => n.toLocaleString("en");

function accuracy(run: RunSummary) {
  return run.shots > 0 ? Math.round((run.hits / run.shots) * 100) : 0;
}

function verdict(run: RunSummary): { label: string; title: string } {
  if (run.cleared) return { label: `Both rounds cleared`, title: "Sharp shooting" };
  if (run.roundsCleared > 0) return { label: `Round ${run.round} of ${MAX_ROUNDS} not cleared`, title: "So close to the end" };
  return { label: `Round 1 of ${MAX_ROUNDS} not cleared`, title: "The birds got away" };
}

/** A name for this run first (skippable), then today's shared board with the visitor's row lit. */
function RunBoard({ run }: { run: RunSummary }) {
  const board = useBoard(BOARD_ID);
  const [step, setStep] = useState<"name" | "board">("name");
  const [entryId, setEntryId] = useState<string | null>(null);

  const submitName = (name: string) => {
    const { id } = board.add({
      name,
      score: run.score,
      detail: `${run.hits} birds · ${accuracy(run)}% aim · ${run.roundsCleared} of ${MAX_ROUNDS} rounds`,
      // Fewer shots for the same score ranks higher.
      tiebreak: run.shots,
    });
    setEntryId(id);
    setStep("board");
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {step === "name" ? (
        <motion.div
          key="name"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-ring sm:p-6"
        >
          <NameEntry onSubmit={submitName} onSkip={() => setStep("board")} />
          <p className="type-caption text-fg-subtle">
            {fmt(run.score)} points for this run. Only the name you type and your score are saved, on the shared board.
          </p>
        </motion.div>
      ) : (
        <motion.div key="board" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }}>
          <Scoreboard entries={board.entries} highlightId={entryId} total={board.total} rankOf={board.rankOf} loading={!board.ready} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SkyShotHowItWorks({ run }: { run: RunSummary }) {
  return (
    <HowItWorks
      intro="No buttons and no controller: the camera picture was the only input. Nothing was recorded or uploaded."
      steps={[
        {
          title: "It finds your hand",
          text: "A hand model from Google's MediaPipe, running on this laptop, marks 21 points on your hand about 30 times a second.",
        },
        {
          title: "Your fingertip becomes the aim",
          text: "The tip of your index finger, mirrored and smoothed so it doesn't shake, is mapped onto the screen. That is the yellow dot.",
        },
        {
          title: "Your thumb is the trigger",
          text: `When the thumb drops against your finger, the gap between them shrinks and it fires. You fired ${run.shots} ${
            run.shots === 1 ? "time" : "times"
          } and hit ${run.hits}.`,
        },
      ]}
    />
  );
}

/** End of a run: score, stats, play again / next player, the feedback code, the board, then how it worked. */
export function ResultsScreen({ run, onPlayAgain, onNextPlayer }: { run: RunSummary; onPlayAgain: () => void; onNextPlayer: () => void }) {
  const { label, title } = verdict(run);
  return (
    <ResultPanel
      label={label}
      title={title}
      score={<Score value={run.score} label="Score" tone="game" />}
      stats={
        <>
          <Stat value={`${run.roundsCleared} of ${MAX_ROUNDS}`} label="Rounds cleared" />
          <Stat value={`${run.hits} of ${Math.max(run.birds, BIRDS_PER_ROUND)}`} label="Birds hit" />
          <Stat value={`${accuracy(run)}%`} label="Aim" />
          <Stat value={run.shots} label={run.shots === 1 ? "Shot" : "Shots"} />
        </>
      }
      actions={
        <>
          <Button variant="game" size="lg" arrow autoFocus icon={<RotateCcw />} onClick={onPlayAgain}>
            Play again
          </Button>
          <Button variant="secondary" size="lg" icon={<NextPlayerIcon />} onClick={onNextPlayer}>
            Next player
          </Button>
          <KeyHints items={[{ keys: ["Space"], label: "Play again" }]} className="hidden self-center lg:flex" />
        </>
      }
    >
      <RunBoard run={run} />
      <SkyShotHowItWorks run={run} />
    </ResultPanel>
  );
}
