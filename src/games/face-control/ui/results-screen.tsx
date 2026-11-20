"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, RotateCcw, Trophy } from "lucide-react";
import { useState } from "react";
import { NextPlayerIcon } from "@/components/game/next-player";
import { ResultPanel } from "@/components/game/panels";
import { NameEntry, Scoreboard } from "@/components/game/scoreboard";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { KeyHints } from "@/components/ui/key-hints";
import { Score, Stat } from "@/components/ui/score";
import { entrance } from "@/lib/entrance";
import { cn } from "@/lib/cn";
import { useBoard } from "@/lib/leaderboard";
import { BOARD_ID, boardDetail, boardScore, boardTiebreak, type RunForBoard } from "../engine/board";
import { formatScore, formatTime } from "../engine/format";
import { LEVELS } from "../engine/game/levels";
import { LEVEL_COUNT, type RunSummary } from "../play/machine";
import type { FaceControlSession, SessionView } from "../play/session";
import { CameraSlot } from "./camera-slot";
import { FaceHowItWorks } from "./how-it-works";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * The three levels as one road: cleared levels full, the one you were on
 * filled as far as the ball got. Shows how close you came (goal gradient),
 * which is what makes "Try again" tempting.
 */
function LevelRoad({ summary }: { summary: RunSummary }) {
  const won = summary.outcome === "victory";
  return (
    <ol aria-label="How far you got" className="grid w-full grid-cols-3 gap-2 sm:gap-3">
      {LEVELS.map((level, i) => {
        const fill = won || i < summary.levelIndex ? 1 : i === summary.levelIndex ? summary.furthest : 0;
        const cleared = fill >= 1;
        return (
          <li key={level.id} className="flex min-w-0 flex-col gap-2">
            <span aria-hidden className="relative h-2 overflow-hidden rounded-full bg-fg/10">
              <motion.span
                className={cn("absolute inset-0 origin-left rounded-full", cleared ? "bg-game" : "bg-game/60")}
                initial={entrance({ scaleX: 0 })}
                animate={{ scaleX: fill }}
                transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.15 + i * 0.12 }}
              />
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              {cleared ? <Check aria-hidden className="size-4 shrink-0 text-game" strokeWidth={3} /> : null}
              <span className={cn("type-small truncate font-semibold", cleared ? "text-fg" : fill > 0 ? "text-fg-muted" : "text-fg-subtle")}>{level.name}</span>
              <span className="sr-only">{cleared ? ", cleared" : fill > 0 ? `, ${Math.round(fill * 100)}% of the way` : ", not reached"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function verdict(summary: RunSummary): { label: string; title: string } {
  if (summary.outcome === "victory") return { label: `All ${LEVEL_COUNT} levels cleared`, title: "You beat Face Control" };
  const pct = Math.round(summary.furthest * 100);
  return {
    label: `Out of lives · level ${summary.levelIndex + 1}, ${pct}% of the way`,
    title: summary.furthest >= 0.75 ? `So close to the end of level ${summary.levelIndex + 1}` : "Out of lives",
  };
}

/** Today's shared board: a name for this run first (skippable), then the board with the visitor's row lit. */
function RunBoard({ run }: { run: RunForBoard }) {
  const board = useBoard(BOARD_ID);
  const [step, setStep] = useState<"name" | "board">("name");
  const [entryId, setEntryId] = useState<string | null>(null);
  const points = boardScore(run);

  const submitName = (name: string) => {
    const { id } = board.add({ name, score: points, detail: boardDetail(run), tiebreak: boardTiebreak(run) });
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
            {formatScore(points)} points for this run. Only the name you type and your score are saved, on the shared board.
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

/** Game over and victory: the verdict, the road so far, the visitor's numbers, the next step, then the reveal. */
export function ResultsScreen({ session, view }: { session: FaceControlSession; view: SessionView }) {
  const { machine } = view;
  const summary = machine.summary;
  if (!summary) return null;
  const victory = summary.outcome === "victory";
  const face = machine.mode === "face" && machine.camera;
  const { label, title } = verdict(summary);

  return (
    <ResultPanel
      label={label}
      badge={
        summary.isBest && summary.previousBest > 0 ? (
          <Chip tone="game" icon={<Trophy />}>
            New best score
          </Chip>
        ) : null
      }
      title={title}
      score={<Score value={summary.score} label="Score" tone="game" />}
      stats={
        <>
          <LevelRoad summary={summary} />
          <Stat value={formatTime(summary.runTime)} label={victory ? "Total time" : "Time played"} />
          <Stat value={`${summary.sparks} of ${summary.sparksTotal}`} label="Sparks" />
          <Stat value={summary.deaths} label={summary.deaths === 1 ? "Fall" : "Falls"} />
          {victory ? <Stat value={summary.lives} label={summary.lives === 1 ? "Life left" : "Lives left"} /> : null}
          {!summary.isBest && summary.previousBest > 0 ? <Stat value={formatScore(summary.previousBest)} label="Your best score" /> : null}
        </>
      }
      actions={
        <>
          {victory ? (
            <Button variant="game" size="lg" arrow autoFocus icon={<RotateCcw />} onClick={() => session.act({ type: "play-again" })}>
              Play again
            </Button>
          ) : (
            <>
              <Button variant="game" size="lg" arrow autoFocus icon={<RotateCcw />} onClick={() => session.act({ type: "retry-level" })}>
                Try level {summary.levelIndex + 1} again
              </Button>
              {summary.levelIndex > 0 ? (
                <Button variant="secondary" size="lg" onClick={() => session.act({ type: "start-over" })}>
                  Start from level 1
                </Button>
              ) : null}
            </>
          )}
          <Button variant="secondary" size="lg" icon={<NextPlayerIcon />} onClick={() => session.act({ type: "next-player" })}>
            Next player
          </Button>
          <KeyHints items={[{ keys: ["Space"], label: victory ? "Play again" : "Try again" }]} className="hidden self-center lg:flex" />
        </>
      }
    >
      <RunBoard
        run={{
          outcome: summary.outcome,
          score: summary.score,
          levelIndex: summary.levelIndex,
          furthest: summary.furthest,
          levelCount: LEVEL_COUNT,
          runTime: summary.runTime,
        }}
      />
      {face ? (
        <section
          aria-label="Your camera"
          className="grid items-center gap-4 rounded-xl bg-surface p-4 shadow-ring sm:grid-cols-[10rem_minmax(0,1fr)] sm:p-5"
        >
          <CameraSlot session={session} density="outline" className="aspect-[4/3] w-full max-w-[14rem] rounded-md" />
          <div className="flex flex-col gap-2">
            <p className="type-small px-1 text-fg-subtle">The camera is still on. Next player turns it off.</p>
          </div>
        </section>
      ) : null}
      <FaceHowItWorks session={session} calibration={view.calibration} stats={view.faceStats} tracking={view.tracking} />
    </ResultPanel>
  );
}
