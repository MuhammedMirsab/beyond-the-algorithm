"use client";

import { RotateCcw, Trophy, Users } from "lucide-react";
import { ResultPanel } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Score, Stat } from "@/components/ui/score";
import { formatScore, formatTime } from "../engine/format";
import { LEVELS } from "../engine/game/levels";
import { LEVEL_COUNT } from "../play/machine";
import type { FaceControlSession, SessionView } from "../play/session";
import { CameraSlot } from "./camera-slot";
import { FaceHowItWorks } from "./how-it-works";
import { MouthPrompt } from "./meters";

/** Game over and victory: the verdict, the visitor's numbers, the next step, then the reveal. */
export function ResultsScreen({ session, view }: { session: FaceControlSession; view: SessionView }) {
  const { machine } = view;
  const summary = machine.summary;
  if (!summary) return null;
  const victory = summary.outcome === "victory";
  const face = machine.mode === "face" && machine.camera;
  const level = LEVELS[summary.levelIndex] ?? LEVELS[0];

  return (
    <ResultPanel
      label={victory ? `All ${LEVEL_COUNT} levels complete` : `Level ${summary.levelIndex + 1} · ${level.name}`}
      title={victory ? "You beat Face Control" : "Out of lives"}
      score={
        <div className="flex flex-col items-start gap-3 md:items-end">
          <Score value={summary.score} label="Score" tone="game" />
          {summary.isBest && summary.previousBest > 0 ? (
            <Chip tone="game" icon={<Trophy />}>
              New best score
            </Chip>
          ) : null}
        </div>
      }
      stats={
        <>
          <Stat value={formatTime(summary.runTime)} label={victory ? "Total time" : "Time played"} />
          <Stat value={`${summary.sparks} of ${summary.sparksTotal}`} label="Sparks" />
          <Stat value={summary.deaths} label={summary.deaths === 1 ? "Fall" : "Falls"} />
          {victory ? <Stat value={summary.lives} label="Lives left" /> : null}
          {!summary.isBest && summary.previousBest > 0 ? <Stat value={formatScore(summary.previousBest)} label="Your best score" /> : null}
        </>
      }
      actions={
        victory ? (
          <>
            <Button variant="game" size="lg" arrow autoFocus icon={<RotateCcw />} onClick={() => session.act({ type: "play-again" })}>
              Play again
            </Button>
            <Button variant="secondary" size="lg" icon={<Users />} onClick={() => session.act({ type: "next-player" })}>
              Next player
            </Button>
          </>
        ) : (
          <>
            <Button variant="game" size="lg" arrow autoFocus icon={<RotateCcw />} onClick={() => session.act({ type: "retry-level" })}>
              Try again
            </Button>
            <Button variant="secondary" size="lg" onClick={() => session.act({ type: "start-over" })}>
              Start over
            </Button>
            <Button variant="secondary" size="lg" icon={<Users />} onClick={() => session.act({ type: "next-player" })}>
              Next player
            </Button>
          </>
        )
      }
    >
      {face ? (
        <section
          aria-label="Continue with your face"
          className="grid items-center gap-4 rounded-xl bg-surface p-4 shadow-ring sm:grid-cols-[11rem_minmax(0,1fr)] sm:p-5"
        >
          <CameraSlot session={session} density="outline" className="aspect-[4/3] w-full max-w-[16rem] rounded-md" />
          <div className="flex flex-col gap-2">
            <MouthPrompt session={session} label={victory ? "Open your mouth to play again" : "Open your mouth to try again"} />
            <p className="type-small px-1 text-fg-subtle">The camera is still on. Next player turns it off.</p>
          </div>
        </section>
      ) : null}
      <FaceHowItWorks session={session} calibration={view.calibration} tracking={view.tracking} />
    </ResultPanel>
  );
}
