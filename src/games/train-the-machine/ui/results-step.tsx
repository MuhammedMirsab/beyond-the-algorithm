"use client";

import { RotateCcw, UserPlus } from "lucide-react";
import { HowItWorks, ResultPanel } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { Score, Stat } from "@/components/ui/score";
import { FEATURE_COUNT, averageShape } from "../engine/features";
import { PoseFigure } from "./figures";
import { MOVE_IDS, type Examples, type Move, type MoveId } from "./model";

const fmt = (value: number) => (value < 0 ? `−${Math.abs(value).toFixed(2)}` : value.toFixed(2));

/** The end of a run: the verdict with the visitor's real numbers, then how it worked. */
export function ResultsStep({
  moves,
  examples,
  best,
  rate,
  threshold,
  onNextPlayer,
  onTestAgain,
  onStartOver,
}: {
  moves: readonly [Move, Move];
  examples: Examples;
  /** Highest match per move while testing, 0 to 1. Null when it never saw anyone. */
  best: Record<MoveId, number> | null;
  /** Frames checked per second while testing, measured. */
  rate: number;
  threshold: number;
  onNextPlayer: () => void;
  onTestAgain: () => void;
  onStartOver: () => void;
}) {
  const [a, b] = moves;
  const total = examples.a.length + examples.b.length;
  const top = best ? MOVE_IDS.reduce<MoveId>((winner, id) => (best[id] > best[winner] ? id : winner), "a") : null;
  const topMove = top ? moves.find((m) => m.id === top) : undefined;
  const topPct = best && top ? Math.round(best[top] * 100) : 0;
  const thresholdPct = Math.round(threshold * 100);
  const how = rate > 0 ? `About ${rate} times a second, it compared what it saw with your examples and picked the closest.` : "It compared what it saw with your examples and picked the closest.";
  const verdict = topMove
    ? topPct >= thresholdPct
      ? `Its best match was ${topPct}%, for ${topMove.name}. Under ${thresholdPct}%, it says Not sure instead of guessing.`
      : `Its best match was only ${topPct}%, for ${topMove.name}, so it kept saying Not sure. It never guesses under ${thresholdPct}%.`
    : `Under ${thresholdPct}%, it says Not sure instead of guessing.`;
  const sample = examples.a[0] ?? examples.b[0];
  const legs = MOVE_IDS.some((id) => examples[id].some((e) => e.shape?.slice(9).some((p) => p.visible)));

  return (
    <ResultPanel
      label={`Your model · ${total} examples`}
      title={`It learned ${a.name} and ${b.name}`}
      score={topMove ? <Score value={topPct} suffix="%" label="Closest match" tone="game" /> : undefined}
      stats={
        <>
          <Stat value={total} label="Examples you showed it" />
          <Stat value={FEATURE_COUNT} label="Numbers in each example" />
          {rate > 0 ? <Stat value={`${rate} a second`} label="How often it checked" /> : null}
        </>
      }
      actions={
        <>
          <Button variant="game" size="lg" icon={<UserPlus />} onClick={onNextPlayer}>
            Next player
          </Button>
          <Button variant="secondary" size="lg" icon={<RotateCcw />} onClick={onTestAgain}>
            Test again
          </Button>
          <Button variant="ghost" size="lg" onClick={onStartOver}>
            Start over with new moves
          </Button>
        </>
      }
    >
      <HowItWorks
        title="How it did it"
        intro={`It never learned what “${a.name}” means. It only compared numbers with the examples you gave it.`}
        steps={[
          {
            title: "Your body became 17 points",
            text: "In every frame, a pose model found 17 points on you: nose, eyes, ears, shoulders, elbows, wrists, hips, knees and ankles. A hand model read the shape of your hand.",
            visual: (
              <div className="dot-field grid aspect-[4/3] grid-cols-2 gap-2 p-4">
                {moves.map((move) => (
                  <figure key={move.id} className="flex min-h-0 flex-col items-center gap-1">
                    <PoseFigure
                      shape={averageShape(examples[move.id].map((e) => e.shape))}
                      legs={legs}
                      label={`Your average ${move.name} pose`}
                      className="min-h-0 w-full flex-1"
                    />
                    <figcaption className="type-label text-fg-subtle">Average {move.name}</figcaption>
                  </figure>
                ))}
              </div>
            ),
          },
          {
            title: `Each example became ${FEATURE_COUNT} numbers`,
            text: `Where your hands were compared with your shoulders and hips, how far apart they were, your hand shape and how you moved. ${total} examples gave it ${total} lists of ${FEATURE_COUNT} numbers.`,
            visual: sample ? <NumberGrid values={sample.features} /> : undefined,
          },
          {
            title: "It picked the closest, or said it didn't know",
            text: `${how} ${verdict}`,
            visual: best ? <BestMatches moves={moves} best={best} threshold={threshold} /> : undefined,
          },
        ]}
      />
    </ResultPanel>
  );
}

/** One real example as 44 shaded cells, with its first numbers printed. */
function NumberGrid({ values }: { values: readonly number[] }) {
  const max = Math.max(1e-6, ...values.map((v) => Math.abs(v)));
  return (
    <div className="flex aspect-[4/3] flex-col justify-center gap-4 p-4">
      <div
        role="img"
        aria-label={`${values.length} numbers from one of your examples, starting ${values.slice(0, 3).map(fmt).join(", ")}`}
        className="grid grid-cols-11 gap-1"
      >
        {values.map((value, i) => (
          <span key={i} className="aspect-square rounded-[3px] bg-game" style={{ opacity: 0.12 + (0.88 * Math.abs(value)) / max }} />
        ))}
      </div>
      <span aria-hidden className="type-label tabular-nums text-fg-subtle">
        {values.slice(0, 4).map(fmt).join("  ")} …
      </span>
    </div>
  );
}

/** Best match per move against the "not sure" line. Word and number on every bar, not just colour. */
function BestMatches({ moves, best, threshold }: { moves: readonly [Move, Move]; best: Record<MoveId, number>; threshold: number }) {
  return (
    <div className="flex aspect-[4/3] flex-col justify-center gap-4 p-4">
      {moves.map((move) => {
        const value = Math.min(1, Math.max(0, best[move.id]));
        return (
          <div key={move.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="type-small truncate font-semibold text-fg">{move.name}</span>
              <span className="type-small font-semibold tabular-nums text-fg-muted">{Math.round(value * 100)}%</span>
            </div>
            <span className="relative block h-2 overflow-hidden rounded-full bg-fg/10" aria-hidden>
              <span className="absolute inset-y-0 left-0 origin-left rounded-full bg-game" style={{ width: `${value * 100}%` }} />
              <span className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${threshold * 100}%` }} />
            </span>
          </div>
        );
      })}
      <span className="type-label text-fg-subtle">Closest while testing · line at {Math.round(threshold * 100)}%</span>
    </div>
  );
}
