"use client";

import { RotateCcw } from "lucide-react";
import { NextPlayerIcon } from "@/components/game/next-player";
import { ResultPanel } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { Score, Stat } from "@/components/ui/score";
import { TrainHowItWorks } from "./how-it-works";
import { MOVE_IDS, type Examples, type Move, type MoveId } from "./model";
import { triesDone, type TestTally } from "./test-tally";

/** The end of a run: the verdict with the visitor's real numbers, then how it worked. */
export function ResultsStep({
  moves,
  examples,
  tally,
  rate,
  threshold,
  onNextPlayer,
  onTestAgain,
  onStartOver,
}: {
  moves: readonly [Move, Move];
  examples: Examples;
  /** What happened while testing. Empty when it never saw anyone. */
  tally: TestTally;
  /** Frames checked per second while testing, measured. */
  rate: number;
  threshold: number;
  onNextPlayer: () => void;
  onTestAgain: () => void;
  onStartOver: () => void;
}) {
  const [a, b] = moves;
  const total = examples.a.length + examples.b.length;
  const tested = tally.frames > 0;
  const top = MOVE_IDS.reduce<MoveId>((winner, id) => (tally.best[id] > tally.best[winner] ? id : winner), "a");
  const topPct = Math.round(tally.best[top] * 100);
  const tries = triesDone(tally);

  return (
    <ResultPanel
      label={`Your model · ${total} examples`}
      title={`You taught it ${a.name} and ${b.name}`}
      score={tested ? <Score value={topPct} suffix="%" label={`Best match, ${moves.find((m) => m.id === top)?.name ?? ""}`} tone="game" /> : undefined}
      stats={
        <>
          <Stat value={`${tries} of 3`} label="Things you tried" />
          {tested ? <Stat value={tally.frames.toLocaleString("en")} label="Frames it judged" /> : null}
          <Stat value={total} label="Examples you showed it" />
        </>
      }
      actions={
        <>
          <Button variant="game" size="lg" icon={<NextPlayerIcon />} onClick={onNextPlayer}>
            Next player
          </Button>
          <Button variant="secondary" size="lg" icon={<RotateCcw />} onClick={onTestAgain}>
            Test again
          </Button>
          <Button variant="ghost" size="lg" onClick={onStartOver}>
            Pick new moves
          </Button>
        </>
      }
    >
      <TrainHowItWorks moves={moves} examples={examples} tally={tally} rate={rate} threshold={threshold} />
    </ResultPanel>
  );
}
