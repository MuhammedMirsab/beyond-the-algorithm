/**
 * Types for Real or AI?, copied from the original app's src/types/index.ts and
 * trimmed to what the game uses. Invented sources and tool names are gone:
 * real photos carry their real credit, AI versions carry what their files say.
 */

export type Difficulty = "easy" | "medium" | "hard";

/** Which side of the screen a photo is on. */
export type Side = "A" | "B";

/** Where a real photo came from. Every field is either known or null, never guessed. */
export interface PhotoCredit {
  /** Photographer as listed on the source, or null when it wasn't recorded. */
  author: string | null;
  /**
   * Null when the original app never recorded where the photo came from (its
   * credit for it was invented). A Commons search on 2026-11-17 didn't find it.
   */
  source: "Wikimedia Commons" | null;
  /** File title on Wikimedia Commons, when it was recorded. */
  file: string | null;
  /** Null when it wasn't recorded. */
  license: string | null;
}

interface PhotoBase {
  id: string;
  /**
   * Public path. File names are neutral (cottage-1, cottage-2) so a URL never
   * gives the answer away, and the number doesn't say which one is AI.
   */
  src: string;
  /** Intrinsic size in pixels: used to crop both sides of a pair identically. */
  width: number;
  height: number;
}

export interface RealPhoto extends PhotoBase {
  isReal: true;
  credit: PhotoCredit;
}

export interface AiPhoto extends PhotoBase {
  isReal: false;
  /** What gives it away, checked against the image files. Plain words, no jargon. */
  clues: readonly [string, string, string];
  /**
   * The image as Gemini delivered it carries signed Content Credentials (C2PA)
   * that say "Created by Google Generative AI". The original ten files still
   * hold them; the nine added on 2026-11-17 were cropped (to remove Gemini's
   * visible sparkle mark), which drops the metadata, but the downloads had it.
   */
  contentCredentials: boolean;
}

export type PairPhoto = RealPhoto | AiPhoto;

export interface ComparisonPair {
  id: string;
  /** Neutral description of the scene. Used for alt text, so it must not hint at the answer. */
  subject: string;
  difficulty: Difficulty;
  realItem: RealPhoto;
  aiItem: AiPhoto;
}

export interface ActiveQuestion {
  pair: ComparisonPair;
  questionNumber: number;
  totalQuestions: number;
  optionA: PairPhoto;
  optionB: PairPhoto;
  /** The side holding the AI photo. */
  correctOptionKey: Side;
}

export interface PlayerAnswer {
  questionIndex: number;
  pairId: string;
  /** null when the timer ran out. */
  selectedOptionKey: Side | null;
  correctOptionKey: Side;
  /** True when the visitor picked the AI photo. */
  isCorrect: boolean;
  /** 0.1 s precision. A timeout counts as the full round. */
  timeTakenSeconds: number;
}
