import { readJSON, removeKey, storageKey, writeJSON } from "@/lib/storage";

/**
 * Personal bests for the current visitor. Loaded lazily (never at import),
 * saved so a reload mid-visit keeps them, and cleared by Next player so one
 * visitor's times never show up as the next visitor's "best".
 */
export interface LevelRecord {
  bestTime: number | null;
  bestSparks: number;
}

export interface Records {
  bestScore: number;
  bestRunTime: number | null;
  runsCompleted: number;
  levels: Record<string, LevelRecord>;
}

export const RECORDS_KEY = storageKey("face-control", "records");

const empty = (): Records => ({ bestScore: 0, bestRunTime: null, runsCompleted: 0, levels: {} });

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function sanitizeRecords(raw: unknown): Records {
  if (!raw || typeof raw !== "object") return empty();
  const r = raw as Partial<Record<keyof Records, unknown>>;
  const levels: Record<string, LevelRecord> = {};
  if (r.levels && typeof r.levels === "object") {
    for (const [key, value] of Object.entries(r.levels as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Partial<Record<keyof LevelRecord, unknown>>;
      levels[key] = { bestTime: num(v.bestTime), bestSparks: num(v.bestSparks) ?? 0 };
    }
  }
  return {
    bestScore: num(r.bestScore) ?? 0,
    bestRunTime: num(r.bestRunTime),
    runsCompleted: num(r.runsCompleted) ?? 0,
    levels,
  };
}

let records: Records | null = null;

function load(): Records {
  if (!records) {
    if (typeof window === "undefined") return empty();
    records = sanitizeRecords(readJSON<unknown>(RECORDS_KEY, null));
  }
  return records;
}

function save(next: Records) {
  records = next;
  writeJSON(RECORDS_KEY, next);
}

export function getRecords(): Readonly<Records> {
  return load();
}

/** Returns the previous best score and whether `score` beats it. */
export function submitScore(score: number): { isBest: boolean; previous: number } {
  const current = load();
  const previous = current.bestScore;
  const isBest = score > previous;
  if (isBest) save({ ...current, bestScore: score });
  return { isBest, previous };
}

/** Records a finished level; returns the best time before this run (null on the first finish). */
export function submitLevel(levelId: number, time: number, sparks: number): { newBestTime: boolean; previousBest: number | null } {
  const current = load();
  const key = String(levelId);
  const prev = current.levels[key] ?? { bestTime: null, bestSparks: 0 };
  const newBestTime = prev.bestTime === null || time < prev.bestTime;
  save({
    ...current,
    levels: {
      ...current.levels,
      [key]: { bestTime: newBestTime ? time : prev.bestTime, bestSparks: Math.max(prev.bestSparks, sparks) },
    },
  });
  return { newBestTime, previousBest: prev.bestTime };
}

export function submitRun(totalTime: number) {
  const current = load();
  save({
    ...current,
    runsCompleted: current.runsCompleted + 1,
    bestRunTime: current.bestRunTime === null ? totalTime : Math.min(current.bestRunTime, totalTime),
  });
}

/** Forgets every record (Next player, leaving the game). */
export function clearRecords() {
  records = empty();
  removeKey(RECORDS_KEY);
}
