import { listCollection, NoKeyError, plainFields, type FsDocument } from "@/lib/firestore-rest";
import { toVisit, type Visit } from "@/content/visits";
import { sessionsFromDoc, type PlaySession } from "@/content/plays";

/**
 * Server only. Reads the Firestore `feedback` and `visits` collections with
 * the Firebase service account (see firestore-rest.ts). The security rules
 * keep both unreadable from the site.
 *
 * Never import this file from a client component.
 */

export interface FeedbackEntry {
  id: string;
  /** Asked only until 19 Nov 2026; empty on later answers. */
  name: string;
  games: string[];
  from: string;
  rating: number;
  issues: string[];
  comment: string;
  /** ISO time the answer reached the server. */
  at: string;
}

export type FeedbackResult =
  | { ok: true; entries: FeedbackEntry[]; fetchedAt: string }
  | { ok: false; reason: "no-key" | "error"; message: string };

export type PlaysResult = { ok: true; sessions: PlaySession[]; docs: number; fetchedAt: string } | { ok: false; reason: "no-key" | "error"; message: string };

export type VisitsResult = { ok: true; visits: Visit[] } | { ok: false; message: string };

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function toEntry(doc: FsDocument): FeedbackEntry {
  const f = plainFields(doc);
  // The first answers (before 18 Nov) used one `game` field instead of `games`.
  const games = strList(f.games);
  const legacy = str(f.game);
  return {
    id: doc.name.split("/").pop() ?? doc.name,
    name: str(f.name).trim(),
    games: games.length ? games : legacy ? [legacy] : [],
    from: str(f.from) || legacy,
    rating: typeof f.rating === "number" ? f.rating : 0,
    issues: strList(f.issues),
    comment: str(f.comment).trim(),
    at: str(f.at) || doc.createTime,
  };
}

export async function fetchAllFeedback(): Promise<FeedbackResult> {
  try {
    const entries = (await listCollection("feedback")).map(toEntry);
    entries.sort((a, b) => b.at.localeCompare(a.at));
    return { ok: true, entries, fetchedAt: new Date().toISOString() };
  } catch (err) {
    if (err instanceof NoKeyError) return { ok: false, reason: "no-key", message: err.message };
    return { ok: false, reason: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

/** Every time the form was opened (since 19 Nov 2026), newest first. */
export async function fetchAllVisits(): Promise<VisitsResult> {
  try {
    const visits = (await listCollection("visits")).map((doc) => toVisit(doc.name.split("/").pop() ?? doc.name, plainFields(doc), doc.createTime));
    visits.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    return { ok: true, visits };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Every game session (since 20 Nov 2026), newest first. One read per
 * device-hour document, not per session (see src/content/plays.ts).
 */
export async function fetchAllPlays(): Promise<PlaysResult> {
  try {
    const docs = await listCollection("plays");
    const sessions = docs.flatMap((doc) => sessionsFromDoc(doc.name.split("/").pop() ?? doc.name, plainFields(doc), doc.createTime));
    sessions.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    return { ok: true, sessions, docs: docs.length, fetchedAt: new Date().toISOString() };
  } catch (err) {
    if (err instanceof NoKeyError) return { ok: false, reason: "no-key", message: err.message };
    return { ok: false, reason: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
