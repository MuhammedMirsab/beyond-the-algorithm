"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CircleHelp, Hand, LoaderCircle, PersonStanding, ScanFace } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Prediction } from "../engine/classifier";
import { CameraStage, StageBanner, StagePlate } from "./camera-stage";
import { MoveGlyph } from "./figures";
import { liveHint } from "./hints";
import type { Move, MoveId } from "./model";
import { triesDone, type Said, type TestTally } from "./test-tally";
import type { PerceptionStatus } from "./use-perception";

interface Readout {
  /** Changes only when the answer changes, so screen readers hear answers, not numbers. */
  key: string;
  word: string;
  line: string;
  icon: ReactNode;
  /** game: it recognised a move. */
  tone: "game" | "dark";
}

const pct = (value: number) => `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;

function readout(prediction: Prediction | null, moves: readonly [Move, Move], trackerReady: boolean): Readout {
  const move = (id: string | null) => moves.find((m) => m.id === id);
  if (!trackerReady) {
    return { key: "load", word: "Starting", line: "Loading the body tracker", icon: <LoaderCircle className="animate-spin" />, tone: "dark" };
  }
  if (!prediction || prediction.status === "not_trained") {
    return { key: "wait", word: "Watching", line: "Do one of your moves", icon: <ScanFace />, tone: "dark" };
  }
  switch (prediction.status) {
    case "recognized": {
      const m = move(prediction.classId);
      return {
        key: `is-${prediction.classId}`,
        word: m?.name ?? "",
        line: `${pct(prediction.match)} like your examples`,
        icon: m ? <MoveGlyph icon={m.icon} className="size-7" /> : <Check />,
        tone: "game",
      };
    }
    case "no_person":
      return { key: "nobody", word: "No one here", line: "Step in front of the camera", icon: <ScanFace />, tone: "dark" };
    case "not_enough_info":
      return { key: "back", word: "Step back", line: "It needs to see down to your hips", icon: <PersonStanding />, tone: "dark" };
    default: {
      if (prediction.reason === "no_hand") {
        return { key: "hand", word: "Show a hand", line: "Both moves are hand shapes", icon: <Hand />, tone: "dark" };
      }
      const closest = move(prediction.closestId);
      if (prediction.reason === "no_motion" && closest) {
        return { key: "still", word: "Not sure", line: `A bit like ${closest.name}, but you're not moving`, icon: <CircleHelp />, tone: "dark" };
      }
      return {
        key: "unsure",
        word: "Not sure",
        line: closest && prediction.match > 0 ? `Closest: ${closest.name}, ${pct(prediction.match)}` : "It won't guess",
        icon: <CircleHelp />,
        tone: "dark",
      };
    }
  }
}

/**
 * Step 3: the model watches live. The answer sits on the camera, large, where
 * the visitor is already looking; the side shows how alike each move is
 * against the "Not sure" line, and three things to try.
 */
export function TestStep({
  moves,
  prediction,
  tally,
  threshold,
  stream,
  videoRef,
  canvasRef,
  status,
  trackerReady,
  onResults,
  onAddMore,
  onStartOver,
}: {
  moves: readonly [Move, Move];
  prediction: Prediction | null;
  tally: TestTally;
  /** The classifier's "not sure" line, 0 to 1. */
  threshold: number;
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  status: PerceptionStatus;
  trackerReady: boolean;
  onResults: () => void;
  onAddMore: () => void;
  onStartOver: () => void;
}) {
  const view = readout(prediction, moves, trackerReady);
  // Light problems only: where to stand is already in the answer itself.
  const light = trackerReady && status.hasPerson ? liveHint(status, null) : null;
  const hint = light && (status.light === "low" || status.light === "bright") ? light : null;
  const recognized = prediction?.status === "recognized" ? prediction.classId : null;
  const rows = moves.map((move) => ({
    move,
    value: prediction?.scores.find((s) => s.id === move.id)?.match ?? 0,
  }));
  const done = triesDone(tally);

  return (
    <section className="mx-auto grid w-full max-w-[75rem] items-start gap-x-8 gap-y-6 px-4 pb-10 pt-2 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:px-8">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <CameraStage stream={stream} videoRef={videoRef} canvasRef={canvasRef}>
          <StagePlate tone={view.tone} className="py-3 pl-3 pr-5">
            <span
              aria-hidden
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-md transition-colors duration-150 [&_svg]:size-7",
                view.tone === "game" ? "bg-game-ink text-game" : "bg-white/15 text-white",
              )}
            >
              {view.icon}
            </span>
            <span className="flex min-w-0 flex-col">
              {/* The answer swaps at once (it can change several times a second); the plate's colour marks the change. */}
              <span className="type-title-1 truncate">{view.word}</span>
              <span className="type-small truncate font-semibold tabular-nums opacity-90">{view.line}</span>
            </span>
          </StagePlate>
          {hint ? <StageBanner icon={hint.icon}>{hint.text}</StageBanner> : null}
        </CameraStage>
      </div>

      <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-start-1">
        <header className="flex flex-col gap-2">
          <span className="type-label text-game">Step 3 of 3 · Test it</span>
          <h1 data-step-focus tabIndex={-1} className="type-title-1 text-fg outline-none">
            Do a move and watch what it says
          </h1>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {view.word}
          </p>
        </header>

        <MatchBars rows={rows} highlight={recognized} threshold={threshold} />

        <Tries moves={moves} tally={tally} done={done} />

        <div className="flex flex-col gap-3">
          <Button variant="game" size="lg" arrow onClick={onResults} className="self-start">
            See how it works
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="md" onClick={onAddMore}>
              Add more examples
            </Button>
            <Button variant="ghost" size="md" onClick={onStartOver}>
              Pick new moves
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * How alike the current pose is to each move, with the line under which it
 * says "Not sure". Word and number on every bar, never colour alone.
 */
function MatchBars({
  rows,
  highlight,
  threshold,
}: {
  rows: { move: Move; value: number }[];
  highlight: string | null;
  threshold: number;
}) {
  const line = Math.round(threshold * 100);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="type-small font-semibold text-fg">How alike to each move</h2>
        <span className="type-label text-fg-subtle">Not sure under {line}%</span>
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map(({ move, value }) => {
          const p = Math.round(Math.min(1, Math.max(0, value)) * 100);
          const on = move.id === highlight;
          return (
            <li key={move.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
              <span className={cn("type-body truncate font-semibold", on ? "text-fg" : "text-fg-muted")}>{move.name}</span>
              <span className={cn("type-body font-semibold tabular-nums", on ? "text-game" : "text-fg-subtle")}>{p}%</span>
              <span aria-hidden className="relative col-span-2 block h-2.5 rounded-full bg-fg/10">
                <span
                  className={cn(
                    "absolute inset-0 origin-left rounded-full transition-[transform,background-color] duration-300 ease-out",
                    on ? "bg-game" : "bg-fg/35",
                  )}
                  style={{ transform: `scaleX(${p / 100})` }}
                />
                <span className="absolute -inset-y-1 w-0.5 rounded-full bg-fg" style={{ left: `${line}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Three things to try: a goal for the test, and the idea of "Not sure" in practice. */
function Tries({ moves, tally, done }: { moves: readonly [Move, Move]; tally: TestTally; done: number }) {
  const items: { id: Said; title: string; detail: string }[] = [
    ...moves.map((m) => ({
      id: m.id as Said,
      title: `Make it say ${m.name}`,
      detail: tally.best[m.id as MoveId] > 0 ? `Best match ${pct(tally.best[m.id as MoveId])}` : m.hint,
    })),
    { id: "unsure", title: "Make it say Not sure", detail: "Try something halfway between your two moves." },
  ];
  return (
    <section
      aria-labelledby="tries"
      className={cn(
        "flex flex-col gap-3 rounded-lg p-4 transition-shadow duration-300 ease-out",
        done === 3 ? "bg-surface shadow-[0_0_0_2px_var(--color-game)]" : "bg-surface shadow-ring",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="tries" className="type-title-3 text-fg">
          {done === 3 ? "You tried all three" : "Try all three"}
        </h2>
        <span className="type-label tabular-nums text-fg-subtle">{done} of 3</span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => {
          const ok = tally.madeSay[item.id];
          return (
            <li key={item.id} className="flex items-start gap-3">
              <span
                aria-hidden
                className={cn(
                  "relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-150",
                  ok ? "bg-game text-game-ink" : "bg-fg/[0.08] text-fg-faint",
                )}
              >
                <AnimatePresence initial={false}>
                  {ok ? (
                    <motion.span
                      key="ok"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", duration: 0.4, bounce: 0.3 }}
                      className="grid place-items-center"
                    >
                      <Check className="size-4" strokeWidth={3} />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className={cn("type-body font-semibold", ok ? "text-fg" : "text-fg-muted")}>
                  {item.title}
                  <span className="sr-only">{ok ? ", done" : ", not yet"}</span>
                </span>
                <span className="type-small tabular-nums text-fg-subtle">{item.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
