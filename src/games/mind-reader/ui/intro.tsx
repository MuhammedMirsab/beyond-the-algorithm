"use client";

import { GameArt } from "@/components/art/game-art";
import { GameIntro } from "@/components/game/game-intro";
import { Segmented } from "@/components/ui/controls";
import { numberRange } from "../engine/game-engine";
import { isRangeId, RANGE_IDS, rangeLabel, type RangeId } from "../engine/ranges";

const RANGE_OPTIONS = RANGE_IDS.map((id) => ({ value: id, label: rangeLabel(id) }));

export function Intro({
  range,
  onRangeChange,
  onReadMyMind,
  onFindItsNumber,
}: {
  range: RangeId;
  onRangeChange: (range: RangeId) => void;
  onReadMyMind: () => void;
  onFindItsNumber: () => void;
}) {
  const label = rangeLabel(range);

  return (
    <GameIntro
      slug="mind-reader"
      art={<GameArt slug="mind-reader" />}
      steps={[
        { title: "Think of a number", text: `Any number from ${label}. Keep it in your head.` },
        { title: "Answer yes or no", text: "Each answer crosses out about half of the numbers." },
        { title: "See how it found it", text: "It names your number, then shows every step it took." },
      ]}
      primary={{ label: "Let it read my mind", onClick: onReadMyMind }}
      secondary={{ label: "Find its number", onClick: onFindItsNumber }}
      footnote={`Find its number turns it around: it picks a number from ${label} and you get ${numberRange(range).maxGuesses} guesses.`}
    >
      <div className="flex flex-col gap-3">
        <span aria-hidden className="type-small font-semibold text-fg-muted">
          Numbers from
        </span>
        <Segmented
          label="Numbers from"
          value={range}
          onValueChange={(value: string) => {
            if (isRangeId(value)) onRangeChange(value);
          }}
          options={RANGE_OPTIONS}
        />
      </div>
    </GameIntro>
  );
}
