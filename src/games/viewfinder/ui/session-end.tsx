"use client";

import { RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { NextPlayerIcon } from "@/components/game/next-player";
import { ResultPanel } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Score, Stat } from "@/components/ui/score";
import { LENSES, LENS_COUNT } from "../engine/lenses";
import { formatCount, formatDuration, lensName, plural, pointsFound, summaryLine, summaryTitle, type SessionSummary } from "./copy";
import { ViewfinderHowItWorks } from "./how-it-works";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * After "End session": the verdict and what it means, this visitor's own
 * numbers (with the filters they tried), then the reveal. "Next player" is
 * the one filled action, with the arcade's Next player icon. The end of a
 * session is a rare moment, so the results rise in (this screen is only ever
 * reached after play, never on a first paint).
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
  const favourite = summary.lensesTried > 1 ? lensName(summary.favouriteLens) : null;
  return (
    <motion.div
      className="flex flex-1 flex-col"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
    >
      <ResultPanel
        label={`Session over · ${formatDuration(summary.seconds)}`}
        title={summaryTitle(summary)}
        score={points > 0 ? <Score value={points} label="Points found on your hands" tone="game" /> : undefined}
        stats={
          <>
            <p className="type-body-lg basis-full max-w-[38rem] text-fg-muted">{summaryLine(summary)}</p>
            <Stat value={formatCount(summary.framesTracked)} label="Pictures checked" />
            {summary.perSecond ? <Stat value={formatCount(summary.perSecond)} label="Pictures a second" /> : null}
            <Stat value={formatCount(summary.locks)} label={plural(summary.locks, "Frame made", "Frames made")} />
            {favourite ? <Stat value={favourite} label="Favourite filter" /> : null}
            {summary.triedLenses.length ? (
              <div className="flex basis-full flex-col gap-2.5">
                <span className="type-caption text-fg-subtle">
                  {summary.lensesTried} of {LENS_COUNT} filters tried
                </span>
                <ul className="flex flex-wrap gap-2">
                  {summary.triedLenses.map((i) => (
                    <li key={LENSES[i].id}>
                      <Chip icon={<span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: LENSES[i].accent }} />}>
                        {LENSES[i].name}
                      </Chip>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        }
        actions={
          <>
            <Button variant="game" size="lg" icon={<NextPlayerIcon />} onClick={onNextPlayer}>
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
    </motion.div>
  );
}
