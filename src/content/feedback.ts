import { GAMES, type GameSlug } from "@/content/games";

/**
 * The visitor feedback form: three questions, reached only from the QR code
 * on each game's result screen (never linked from the hub).
 */

export const RATINGS = [
  { value: 1, word: "Not for me" },
  { value: 2, word: "Could be better" },
  { value: 3, word: "It was okay" },
  { value: 4, word: "I liked it" },
  { value: 5, word: "Loved it" },
] as const;

export type Rating = (typeof RATINGS)[number]["value"];

/** At or below this, the form asks what to improve. */
export const LOW_RATING = 2;

export const ISSUES = [
  { id: "confusing", label: "Hard to understand" },
  { id: "tracking", label: "Camera or tracking was off" },
  { id: "slow", label: "Too slow" },
  { id: "short", label: "Too short" },
  { id: "boring", label: "Not much fun" },
  { id: "other", label: "Something else" },
] as const;

export type IssueId = (typeof ISSUES)[number]["id"];

export const NAME_MAX = 40;
export const COMMENT_MAX = 400;

export interface FeedbackInput {
  name: string;
  game: GameSlug;
  rating: Rating;
  issues: IssueId[];
  comment: string;
}

const SLUGS = new Set<string>(GAMES.map((g) => g.slug));
const ISSUE_IDS = new Set<string>(ISSUES.map((i) => i.id));

export const isGameSlug = (value: unknown): value is GameSlug => typeof value === "string" && SLUGS.has(value);

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Checks and tidies the form before it is sent (the Firestore rules check again). */
export function parseFeedback(body: unknown): FeedbackInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (!isGameSlug(raw.game)) return null;
  const rating = raw.rating;
  if (typeof rating !== "number" || !RATINGS.some((r) => r.value === rating)) return null;
  const issues =
    rating <= LOW_RATING && Array.isArray(raw.issues)
      ? [...new Set(raw.issues.filter((id): id is IssueId => typeof id === "string" && ISSUE_IDS.has(id)))]
      : [];
  return {
    name: clean(raw.name, NAME_MAX),
    game: raw.game,
    rating: rating as Rating,
    issues,
    comment: rating <= LOW_RATING ? clean(raw.comment, COMMENT_MAX) : "",
  };
}
