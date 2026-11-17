"use client";

import { motion } from "motion/react";
import { Check, CircleHelp, Hand, Lightbulb, PersonStanding, ScanFace } from "lucide-react";
import { NextPlayerIcon } from "@/components/game/next-player";
import type { ReactNode, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { ConfidenceBars } from "@/components/ui/meter";
import { cn } from "@/lib/cn";
import type { Prediction } from "../engine/classifier";
import { CameraStage, StageBanner } from "./camera-stage";
import { liveHint } from "./collect-step";
import type { Move } from "./model";
import type { PerceptionStatus } from "./use-perception";

interface Readout {
  /** Changes only when the answer changes, so screen readers hear answers, not numbers. */
  key: string;
  word: string;
  line: string;
  icon: ReactNode;
  tone: "game" | "fg" | "muted";
}

const pct = (value: number) => `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;

function readout(prediction: Prediction | null, moves: readonly [Move, Move]): Readout {
  const name = (id: string | null) => moves.find((m) => m.id === id)?.name ?? "";
  if (!prediction || prediction.status === "not_trained") {
    return { key: "wait", word: "Watching", line: "Do one of your moves.", icon: <ScanFace />, tone: "muted" };
  }
  switch (prediction.status) {
    case "recognized":
      return {
        key: `is-${prediction.classId}`,
        word: name(prediction.classId),
        line: `${pct(prediction.match)} like your ${name(prediction.classId)} examples.`,
        icon: <Check />,
        tone: "game",
      };
    case "no_person":
      return { key: "nobody", word: "No one here", line: "Step in front of the camera.", icon: <ScanFace />, tone: "muted" };
    case "not_enough_info":
      return {
        key: "back",
        word: "Step back",
        line: "It needs to see your body, down to your hips.",
        icon: <PersonStanding />,
        tone: "muted",
      };
    default:
      if (prediction.reason === "no_hand") {
        return {
          key: "hand",
          word: "Show a hand",
          line: "Both moves are hand shapes, so it needs to see a hand.",
          icon: <Hand />,
          tone: "muted",
        };
      }
      if (prediction.reason === "no_motion" && prediction.closestId) {
        return {
          key: "still",
          word: "Not sure",
          line: `It looks a bit like ${name(prediction.closestId)}, but you aren't moving like your examples.`,
          icon: <CircleHelp />,
          tone: "fg",
        };
      }
      return { key: "unsure", word: "Not sure", line: "It doesn't know. Good: it won't guess.", icon: <CircleHelp />, tone: "fg" };
  }
}

export function TestStep({
  moves,
  prediction,
  threshold,
  stream,
  videoRef,
  canvasRef,
  status,
  onResults,
  onAddMore,
  onStartOver,
  onNextPlayer,
}: {
  moves: readonly [Move, Move];
  prediction: Prediction | null;
  /** The classifier's "not sure" line, 0 to 1. */
  threshold: number;
  stream: MediaStream | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  status: PerceptionStatus;
  onResults: () => void;
  onAddMore: () => void;
  onStartOver: () => void;
  onNextPlayer: () => void;
}) {
  const view = readout(prediction, moves);
  const hint = status.hasPerson ? liveHint(status, null) : null;
  const recognized = prediction?.status === "recognized" ? prediction.classId : null;
  const rows = moves.map((move) => ({
    id: move.id,
    label: move.name,
    value: prediction?.scores.find((s) => s.id === move.id)?.match ?? 0,
  }));

  return (
    <section className="mx-auto grid w-full max-w-[75rem] items-start gap-x-8 gap-y-6 px-4 pb-10 pt-2 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_1fr] lg:px-8">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        {/* Shorter than on the teaching screen, so the actions below it stay in view. */}
        <CameraStage stream={stream} videoRef={videoRef} canvasRef={canvasRef} className="lg:[--stage-max:calc(100dvh_-_14rem)]">
          {hint ? <StageBanner icon={hint.icon}>{hint.text}</StageBanner> : null}
        </CameraStage>
      </div>

      <div className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div className="flex flex-col gap-3">
          <h1 data-step-focus tabIndex={-1} className="type-label text-game outline-none">
            Step 3 of 3 · It sees
          </h1>
          <div aria-live="polite" aria-atomic="true" className="flex min-w-0 items-center gap-4">
            <span
              aria-hidden
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-full [&_svg]:size-6",
                view.tone === "game" ? "bg-game text-game-ink" : "bg-fg/[0.08] text-fg-muted",
              )}
            >
              {view.icon}
            </span>
            <motion.p
              key={view.key}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "type-display-2 min-w-0 break-words",
                view.tone === "game" ? "text-game" : view.tone === "fg" ? "text-fg" : "text-fg-muted",
              )}
            >
              {view.word}
            </motion.p>
          </div>
          <p className="type-body-lg tabular-nums text-fg-muted">{view.line}</p>
        </div>

        <div className="flex flex-col gap-3">
          <span className="type-small font-semibold text-fg">How alike it is to each move</span>
          <ConfidenceBars rows={rows} highlight={recognized ?? "none"} />
          <span className="type-small text-fg-subtle">Under {Math.round(threshold * 100)}%, it says Not sure.</span>
        </div>

        <div className="flex items-start gap-3 rounded-lg bg-game-soft p-4">
          <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-game" />
          <p className="type-body font-semibold text-fg">Try to fool it: do something halfway between.</p>
        </div>

        <Button variant="game" size="lg" arrow onClick={onResults} className="self-start">
          See how it works
        </Button>
      </div>

      <div className="flex min-w-0 flex-wrap gap-3 lg:col-start-1 lg:row-start-2">
        <Button variant="secondary" size="lg" onClick={onAddMore}>
          Add more examples
        </Button>
        <Button variant="ghost" size="lg" onClick={onStartOver}>
          Start over with new moves
        </Button>
        <Button variant="ghost" size="lg" icon={<NextPlayerIcon />} onClick={onNextPlayer}>
          Next player
        </Button>
      </div>
    </section>
  );
}
