"use client";

import { HowItWorks } from "@/components/game/panels";
import { notesFor, explainedRound, spotInBox } from "../engine/clues";
import { pairAspect } from "../engine/pairs";
import type { LevelTally } from "../engine/scoring";
import type { ActiveQuestion, PlayerAnswer } from "../engine/types";
import { DenoiseVisual, NoiseVisual, RealDetailVisual } from "./explain-visuals";

/** "The fur..." becomes "the fur..." to follow on in a sentence; "AI added..." stays as it is. */
const lowerFirst = (text: string) => (/^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text);

/**
 * How the AI made its photos, taken apart on one of the visitor's own rounds
 * (the hardest one that fooled them, or the hardest one they played): the
 * real photo and its fine detail, the noise that drowns that detail, and the
 * clean-up that invents it again, ending on the slip they could have spotted.
 */
export function ModelSteps({
  questions,
  answers,
  tally,
}: {
  questions: readonly ActiveQuestion[];
  answers: readonly PlayerAnswer[];
  tally: LevelTally;
}) {
  const caught = `You caught ${tally.easy.correct} of ${tally.easy.total} easy pairs, ${tally.medium.correct} of ${tally.medium.total} medium and ${tally.hard.correct} of ${tally.hard.total} hard.`;
  const explained = explainedRound(questions, answers);
  if (!explained) return null;

  const { question, answer } = explained;
  const pair = question.pair;
  const ratio = pairAspect(pair);
  const round = answer.questionIndex + 1;
  const notes = notesFor(pair);
  // The clue to end on: a slip in the fine detail if there is one, since that's what the noise story explains.
  const clueIndex = notes ? Math.max(0, notes.findIndex((n) => n.tell === "smooth")) : 0;
  const spot = notes ? spotInBox(notes[clueIndex].spot, pair.aiItem, ratio) : { x: 0.5, y: 0.5 };
  const clue = pair.aiItem.clues[clueIndex];
  const which = answer.isCorrect
    ? `Here is round ${round}, the hardest one you played, taken apart.`
    : `Round ${round} fooled you, so here it is again, taken apart.`;

  return (
    <HowItWorks
      title="How the AI made its photos"
      intro={`${caught} ${which} Most image models today work like this.`}
      columns={3}
      steps={[
        {
          title: "It starts from a real photo",
          text: "Every AI photo you saw began as the real photo beside it. A camera records the fine detail: every hair, grain and letter.",
          visual: <RealDetailVisual photo={pair.realItem} ratio={ratio} spot={spot} alt={`The real photo from round ${round}: ${pair.subject}`} />,
        },
        {
          title: "It drowns the photo in noise",
          text: "The model covers the photo in random static. Fine detail goes first. The big shapes and colours last longest.",
          visual: <NoiseVisual photo={pair.realItem} ratio={ratio} alt="The same photo, covered in random noise" />,
        },
        {
          title: "It redraws every pixel",
          text: `It takes the noise away bit by bit, guessing each patch from millions of photos it learned from. The scene comes back, but the fine detail is invented. In round ${round}, ${lowerFirst(clue)}`,
          visual: (
            <DenoiseVisual
              real={pair.realItem}
              ai={pair.aiItem}
              ratio={ratio}
              spot={spot}
              alt={`The AI version from round ${round}: ${pair.subject}`}
            />
          ),
        },
      ]}
    />
  );
}
