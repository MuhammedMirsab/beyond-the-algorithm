"use client";

import { RotateCcw } from "lucide-react";
import { ResultPanel } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { Score, Stat } from "@/components/ui/score";
import { LENS_COUNT } from "../engine/lenses";
import { formatCount, formatDuration, plural, pointsFound, summaryTitle, type SessionSummary } from "./copy";
import { ViewfinderHowItWorks } from "./how-it-works";

/**
 * After "End session": what the model did with this visitor's hands, in
 * their own numbers, then the reveal. "Next player" is the one filled action.
 */
export function SessionEnd({
  summary,
  onNextPlayer,
  onPlayAgain,
}: {
  summary: SessionSummary;
  onNextPlayer: () => void;
  onPlayAgain: () => void;
}) {
  const points = pointsFound(summary.handsFound);
  return (
    <ResultPanel
      label={`Session over · ${formatDuration(summary.seconds)}`}
      title={summaryTitle(summary)}
      score={points > 0 ? <Score value={points} label="Points found on your hands" tone="game" /> : undefined}
      stats={
        <>
          <Stat value={formatCount(summary.framesTracked)} label="Pictures checked" />
          {summary.perSecond ? <Stat value={formatCount(summary.perSecond)} label="Pictures a second" /> : null}
          <Stat value={formatCount(summary.locks)} label={plural(summary.locks, "Frame made", "Frames made")} />
          <Stat value={`${summary.lensesTried} of ${LENS_COUNT}`} label="Lenses tried" />
        </>
      }
      actions={
        <>
          <Button variant="game" size="lg" arrow onClick={onNextPlayer}>
            Next player
          </Button>
          <Button variant="secondary" size="lg" icon={<RotateCcw />} onClick={onPlayAgain}>
            Play again
          </Button>
        </>
      }
    >
      <ViewfinderHowItWorks numbers={summary} />
    </ResultPanel>
  );
}
