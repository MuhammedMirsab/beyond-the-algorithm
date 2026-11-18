"use client";

import { GameArt } from "@/components/art/game-art";
import { GameIntro } from "@/components/game/game-intro";
import { Segmented } from "@/components/ui/controls";
import { numberRange } from "../engine/game-engine";
import { formatNumber, halvingsFor, isRangeId, RANGE_IDS, RANGE_MAX, rangeLabel, type RangeId } from "../engine/ranges";
import { useKeys } from "./hooks";

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
  const max = RANGE_MAX[range];
  const questions = halvingsFor(max);
  useKeys({ Enter: onReadMyMind, f: onFindItsNumber });

  return (
    <GameIntro
      slug="mind-reader"
      art={<GameArt slug="mind-reader" mode="intro" />}
      steps={[
        { title: "Think of a number", text: `Any number from ${label}. Keep it in your head.` },
        { title: "Answer yes or no", text: "Every answer crosses out half of the numbers left." },
        { title: "See how it found it", text: "Then replay every step it took." },
      ]}
      primary={{ label: "Let it read my mind", onClick: onReadMyMind }}
      secondary={{ label: "Find its number", onClick: onFindItsNumber }}
      keys={[
        { keys: ["Enter"], label: "Let it read my mind" },
        { keys: ["F"], label: "Find its number" },
      ]}
      footnote={`Find its number turns it around: it picks a number from ${label} and you get ${numberRange(range).maxGuesses} guesses.`}
    >
      <div className="flex flex-col gap-2.5">
        <Segmented
          label="Numbers from"
          value={range}
          onValueChange={(value: string) => {
            if (isRangeId(value)) onRangeChange(value);
          }}
          options={RANGE_OPTIONS}
        />
        <p className="type-small text-fg-subtle" aria-live="polite">
          {formatNumber(max)} numbers, never more than {questions} questions.
        </p>
      </div>
    </GameIntro>
  );
}
