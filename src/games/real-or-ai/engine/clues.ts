import type { ActiveQuestion, ComparisonPair, PlayerAnswer } from "./types";

/**
 * Where each clue is, and what kind of slip it is. Kept apart from pairs.ts so
 * the photos, clues and credits there stay exactly as written.
 *
 * Spots were placed by looking at every AI file on 2026-11-17: x and y are
 * fractions of the AI image itself (0,0 top left), before the game's shared
 * crop. A spot marks where to look; for a clue about the whole scene ("the
 * light makes everything glow") it sits where that shows most.
 */

/** The three kinds of slip the clues describe. */
export type Tell = "smooth" | "invented" | "light";

export const TELLS: readonly Tell[] = ["smooth", "invented", "light"];

export interface ClueSpot {
  x: number;
  y: number;
}

export interface ClueNote {
  tell: Tell;
  spot: ClueSpot;
}

type Notes = readonly [ClueNote, ClueNote, ClueNote];

const n = (tell: Tell, x: number, y: number): ClueNote => ({ tell, spot: { x, y } });

export const CLUE_NOTES: Readonly<Record<string, Notes>> = {
  "pair-hibiscus": [n("smooth", 0.58, 0.66), n("smooth", 0.83, 0.59), n("smooth", 0.12, 0.86)],
  "pair-desert-camel": [n("light", 0.18, 0.2), n("smooth", 0.57, 0.6), n("smooth", 0.79, 0.75)],
  "pair-lemon-tea": [n("invented", 0.39, 0.86), n("invented", 0.44, 0.25), n("smooth", 0.1, 0.35)],
  "pair-green-mangoes": [n("smooth", 0.4, 0.53), n("invented", 0.34, 0.29), n("smooth", 0.7, 0.45)],
  "pair-parakeets": [n("smooth", 0.3, 0.45), n("smooth", 0.81, 0.53), n("smooth", 0.55, 0.62)],
  "pair-thatched-cottage": [n("invented", 0.92, 0.385), n("invented", 0.504, 0.703), n("smooth", 0.375, 0.49)],
  "pair-indian-thali": [n("invented", 0.8, 0.44), n("invented", 0.09, 0.52), n("smooth", 0.52, 0.47)],
  "pair-vegetable-stall": [n("invented", 0.396, 0.084), n("light", 0.67, 0.52), n("invented", 0.39, 0.22)],
  "pair-fuji-sakura": [n("invented", 0.358, 0.68), n("smooth", 0.27, 0.3), n("smooth", 0.56, 0.69)],
  "pair-golden-gate": [n("invented", 0.062, 0.883), n("invented", 0.29, 0.52), n("invented", 0.31, 0.88)],
  "pair-coastal-lighthouse": [n("light", 0.36, 0.58), n("light", 0.56, 0.57), n("light", 0.5, 0.08)],
  "pair-graffiti-bicycle": [n("invented", 0.42, 0.29), n("invented", 0.93, 0.33), n("smooth", 0.5, 0.7)],
  "pair-spice-market": [n("invented", 0.22, 0.49), n("invented", 0.78, 0.2), n("smooth", 0.79, 0.84)],
  "pair-snow-fox": [n("smooth", 0.6, 0.525), n("smooth", 0.8, 0.28), n("smooth", 0.34, 0.6)],
  "pair-sleeping-retriever": [n("smooth", 0.45, 0.12), n("smooth", 0.31, 0.665), n("smooth", 0.79, 0.26)],
  "pair-himalayan-glacier": [n("invented", 0.84, 0.71), n("smooth", 0.83, 0.335), n("smooth", 0.95, 0.775)],
  "pair-market-modified": [n("smooth", 0.765, 0.507), n("invented", 0.54, 0.353), n("smooth", 0.68, 0.77)],
  "pair-tuxedo-cat": [n("invented", 0.507, 0.022), n("smooth", 0.78, 0.47), n("smooth", 0.567, 0.5)],
  "pair-sand-dune": [n("smooth", 0.5, 0.65), n("smooth", 0.1, 0.15), n("smooth", 0.78, 0.72)],
};

/** Notes for a pair, or null for a pair that has none (a new pair added without them). */
export const notesFor = (pair: ComparisonPair): Notes | null => CLUE_NOTES[pair.id] ?? null;

/**
 * Where a point of an image lands inside the game's shared crop box: both
 * photos of a pair fill a box of the same shape (object-fit: cover, centred),
 * so each loses a sliver on one side.
 */
export function spotInBox(spot: ClueSpot, image: { width: number; height: number }, boxRatio: number): ClueSpot {
  const ratio = image.width / image.height;
  if (ratio > boxRatio) {
    const visible = boxRatio / ratio;
    return { x: (spot.x - (1 - visible) / 2) / visible, y: spot.y };
  }
  const visible = ratio / boxRatio;
  return { x: spot.x, y: (spot.y - (1 - visible) / 2) / visible };
}

/** The reverse of spotInBox: which point of `image` shows at a place in the shared crop box. */
export function boxToImage(spot: ClueSpot, image: { width: number; height: number }, boxRatio: number): ClueSpot {
  const ratio = image.width / image.height;
  if (ratio > boxRatio) {
    const visible = boxRatio / ratio;
    return { x: spot.x * visible + (1 - visible) / 2, y: spot.y };
  }
  const visible = ratio / boxRatio;
  return { x: spot.x, y: spot.y * visible + (1 - visible) / 2 };
}

/** Where the photo's own labels sit (fractions of the photo): the letter and its tag top left, the magnifier top right. */
const CHROME = [
  { x0: 0, y0: 0, x1: 0.42, y1: 0.22 },
  { x0: 0.85, y0: 0, x1: 1, y1: 0.22 },
];

/** Which diagonal a pin's number goes on: inside the photo and clear of its labels, up and to the left when free. */
export function numberSide(spot: ClueSpot): { dx: -1 | 1; dy: -1 | 1 } {
  const options = [
    { dx: -1, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 1 },
    { dx: 1, dy: 1 },
  ] as const;
  let best: { dx: -1 | 1; dy: -1 | 1 } = options[0];
  let bestScore = -Infinity;
  options.forEach((o, i) => {
    const x = spot.x + o.dx * 0.05;
    const y = spot.y + o.dy * 0.08;
    let score = -i * 0.1;
    if (x < 0.03 || x > 0.97 || y < 0.04 || y > 0.96) score -= 10;
    for (const c of CHROME) if (x > c.x0 && x < c.x1 && y > c.y0 && y < c.y1) score -= 5;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  });
  return best;
}

/** The bottom corner with room for the "Your pick" label: the left one, unless a pin sits there. */
export function freeCorner(spots: readonly ClueSpot[] | null): "left" | "right" {
  if (!spots || spots.length === 0) return "left";
  const clearance = (cx: number) => Math.min(...spots.map((s) => Math.hypot((s.x - cx) * 1.5, s.y - 0.9)));
  const left = clearance(0.14);
  return left >= 0.3 || left >= clearance(0.86) ? "left" : "right";
}

/** One clue from the visitor's own game, for How it works. */
export interface PlayedClue {
  round: number;
  question: ActiveQuestion;
  answer: PlayerAnswer;
  /** 0, 1 or 2: which of the pair's clues. */
  clue: number;
  text: string;
  note: ClueNote;
}

/** Every clue of every round played, with the round's outcome. */
export function playedClues(questions: readonly ActiveQuestion[], answers: readonly PlayerAnswer[]): PlayedClue[] {
  const out: PlayedClue[] = [];
  for (const answer of answers) {
    const question = questions[answer.questionIndex];
    if (!question) continue;
    const notes = notesFor(question.pair);
    if (!notes) continue;
    question.pair.aiItem.clues.forEach((text, clue) => {
      out.push({ round: answer.questionIndex + 1, question, answer, clue, text, note: notes[clue] });
    });
  }
  return out;
}

/**
 * The visitor's rounds that show one kind of slip, at most one clue per
 * round (the first of that kind), missed rounds first: they teach the most.
 */
export function evidenceFor(tell: Tell, clues: readonly PlayedClue[]): PlayedClue[] {
  const seen = new Set<number>();
  const picked: PlayedClue[] = [];
  for (const c of clues) {
    if (c.note.tell !== tell || seen.has(c.round)) continue;
    seen.add(c.round);
    picked.push(c);
  }
  return picked.sort((a, b) => Number(a.answer.isCorrect) - Number(b.answer.isCorrect) || a.round - b.round);
}

/**
 * The round to explain the model with: the hardest round the AI won (fooled
 * or timed out), or the hardest round played when the visitor caught them all.
 */
export function explainedRound(questions: readonly ActiveQuestion[], answers: readonly PlayerAnswer[]): { question: ActiveQuestion; answer: PlayerAnswer } | null {
  const rank = { easy: 0, medium: 1, hard: 2 } as const;
  const played = answers
    .map((answer) => ({ answer, question: questions[answer.questionIndex] }))
    .filter((r): r is { answer: PlayerAnswer; question: ActiveQuestion } => Boolean(r.question));
  if (played.length === 0) return null;
  const missed = played.filter((r) => !r.answer.isCorrect);
  const pool = missed.length > 0 ? missed : played;
  return [...pool].sort((a, b) => rank[b.question.pair.difficulty] - rank[a.question.pair.difficulty] || b.answer.questionIndex - a.answer.questionIndex)[0];
}
