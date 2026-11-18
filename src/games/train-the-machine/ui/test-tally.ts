/**
 * What happened while the visitor tested their model: how many frames it
 * answered, what it said, its best match per move, and the three things to
 * try (make it say each move, and make it say "Not sure"). Pure, so it is
 * tested; kept in memory only and cleared by Next player.
 */
import type { Prediction } from "../engine/classifier";
import type { MoveId } from "./model";

export type Said = MoveId | "unsure";

export interface TestTally {
  /** Frames it gave an answer for (someone in view). */
  frames: number;
  said: Record<Said, number>;
  /** Highest match per move while testing, 0 to 1. */
  best: Record<MoveId, number>;
  /** The three things to try. "unsure" counts once "Not sure" lasted UNSURE_HOLD_MS. */
  madeSay: Record<Said, boolean>;
  /** When the current run of "Not sure" began, or null. */
  unsureSince: number | null;
}

/** "Not sure" must last this long to count: a flicker between two moves doesn't. */
export const UNSURE_HOLD_MS = 1200;

export const EMPTY_TALLY: TestTally = {
  frames: 0,
  said: { a: 0, b: 0, unsure: 0 },
  best: { a: 0, b: 0 },
  madeSay: { a: false, b: false, unsure: false },
  unsureSince: null,
};

const isMove = (id: string | null): id is MoveId => id === "a" || id === "b";

/** One more answer from the model. Returns the same object when nothing changed. */
export function tallyFrame(tally: TestTally, prediction: Prediction, now: number): TestTally {
  const answered =
    prediction.status === "recognized" || (prediction.status === "unknown" && prediction.reason !== "no_hand");
  if (!answered) return tally.unsureSince === null ? tally : { ...tally, unsureSince: null };

  const best = { ...tally.best };
  for (const score of prediction.scores) if (isMove(score.id)) best[score.id] = Math.max(best[score.id], score.match);
  const frames = tally.frames + 1;

  if (prediction.status === "recognized" && isMove(prediction.classId)) {
    const id = prediction.classId;
    return {
      frames,
      best,
      said: { ...tally.said, [id]: tally.said[id] + 1 },
      madeSay: { ...tally.madeSay, [id]: true },
      unsureSince: null,
    };
  }

  const since = tally.unsureSince ?? now;
  return {
    frames,
    best,
    said: { ...tally.said, unsure: tally.said.unsure + 1 },
    madeSay: { ...tally.madeSay, unsure: tally.madeSay.unsure || now - since >= UNSURE_HOLD_MS },
    unsureSince: since,
  };
}

/** How many of the three things to try are done. */
export const triesDone = (tally: TestTally) => Number(tally.madeSay.a) + Number(tally.madeSay.b) + Number(tally.madeSay.unsure);

/** The share of answered frames for each answer, 0 to 1. */
export function shares(tally: TestTally): Record<Said, number> {
  const total = Math.max(1, tally.frames);
  return { a: tally.said.a / total, b: tally.said.b / total, unsure: tally.said.unsure / total };
}
