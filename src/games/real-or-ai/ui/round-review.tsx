import Image from "next/image";
import { photoOn } from "../engine/pairs";
import type { ActiveQuestion, PairPhoto, PlayerAnswer, Side } from "../engine/types";
import { formatSeconds, LEVEL_NAME, OutcomeChip, outcomeOf, PickLabel, SideBadge, TruthLabel } from "./labels";
import { cn } from "@/lib/cn";

/** Small photos only: these thumbnails are never wider than ~300px. */
const THUMB_SIZES = "(min-width: 1024px) 180px, (min-width: 768px) 25vw, 50vw";

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export const countWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** A small, labelled photo for the results. The answer is known by now, so every thumbnail shares one 4:3 crop. */
export function Thumb({
  photo,
  alt,
  side,
  showTruth = true,
  picked = false,
  pickCorrect = false,
  className,
}: {
  photo: PairPhoto;
  alt: string;
  side?: Side;
  showTruth?: boolean;
  picked?: boolean;
  pickCorrect?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative aspect-[4/3] overflow-hidden rounded-md bg-sunken",
        showTruth && !photo.isReal && "ring-2 ring-game ring-offset-2 ring-offset-surface",
        className,
      )}
    >
      <Image src={photo.src} alt={alt} fill sizes={THUMB_SIZES} draggable={false} className="select-none object-cover" />
      {side ? <SideBadge side={side} size="sm" className="absolute left-1.5 top-1.5" /> : null}
      {picked ? <PickLabel correct={pickCorrect} size="sm" className="absolute right-1.5 top-1.5" /> : null}
      {showTruth ? <TruthLabel isReal={photo.isReal} size="sm" animate={false} className="absolute bottom-1.5 left-1.5" /> : null}
    </div>
  );
}

/** "Your six rounds": every pair, which one was AI, what you picked, and the main clue. */
export function RoundReview({ questions, answers }: { questions: readonly ActiveQuestion[]; answers: readonly PlayerAnswer[] }) {
  return (
    <section aria-labelledby="real-or-ai-review" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="real-or-ai-review" className="type-title-1 text-fg">
          Your {countWord(answers.length)} rounds
        </h2>
        <p className="type-body-lg max-w-[40rem] text-fg-muted">
          Which photo AI made, which one you picked, and the main thing that gave it away.
        </p>
      </div>
      {/* One column until 768px: two per row any earlier squeezes the labels on each thumbnail together. */}
      <ol className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {answers.map((answer) => {
          const question = questions[answer.questionIndex];
          if (!question) return null;
          const outcome = outcomeOf(answer);
          return (
            <li key={answer.pairId} className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-ring">
              <div className="flex items-center justify-between gap-3">
                <span className="type-label text-fg-subtle">
                  Round {answer.questionIndex + 1} · {LEVEL_NAME[question.pair.difficulty]}
                </span>
                <OutcomeChip outcome={outcome} />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {(["A", "B"] as const).map((side) => {
                  const photo = photoOn(question, side);
                  return (
                    <Thumb
                      key={side}
                      photo={photo}
                      side={side}
                      alt={`Photo ${side}, ${photo.isReal ? "the real photo" : "made by AI"}: ${question.pair.subject}`}
                      picked={answer.selectedOptionKey === side}
                      pickCorrect={answer.isCorrect}
                    />
                  );
                })}
              </div>
              <p className="type-small text-fg-muted">{question.pair.aiItem.clues[0]}</p>
              <span className="type-caption mt-auto tabular-nums text-fg-subtle">
                {answer.selectedOptionKey ? `You picked in ${formatSeconds(answer.timeTakenSeconds)}` : "No pick before the timer ran out"}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
