"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { readJSON, storageKey, subscribeKey, writeJSON } from "./storage";

/**
 * Local-first scoreboards. Each device keeps its own board for the day, so a
 * booth laptop driving the projector never depends on the venue Wi-Fi.
 * Other tabs on the same device (a second screen) update live.
 */

export interface BoardEntry {
  id: string;
  name: string;
  score: number;
  /** Optional secondary line, e.g. "5 of 6 correct · 41s". */
  detail?: string;
  /** Tie-breakers, smaller is better (time in seconds, guesses...). */
  tiebreak?: number;
  at: number;
}

const MAX_ENTRIES = 200;
const EMPTY: BoardEntry[] = [];

export const NAME_MAX = 20;

/** Words we will not put on a projected board. Kept short on purpose. */
const BLOCKED = [
  "fuck", "shit", "bitch", "cunt", "dick", "pussy", "bastard", "asshole", "slut", "whore",
  "nigg", "fag", "retard", "porn", "sex", "kill", "rape", "nazi", "hitler",
];

export function cleanName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  if (name.length < 2) return { ok: false, reason: "Use at least 2 characters." };
  const flat = name.toLowerCase().replace(/[^a-z]/g, "");
  if (BLOCKED.some((w) => flat.includes(w))) return { ok: false, reason: "Pick a different name for the board." };
  return { ok: true, name };
}

function sortEntries(entries: BoardEntry[]): BoardEntry[] {
  return [...entries].sort(
    (a, b) => b.score - a.score || (a.tiebreak ?? 0) - (b.tiebreak ?? 0) || a.at - b.at,
  );
}

/** Cache parsed snapshots per key so useSyncExternalStore gets stable references. */
const cache = new Map<string, { raw: string | null; value: BoardEntry[] }>();

function readBoard(key: string): BoardEntry[] {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = null;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  const value = raw ? sortEntries(readJSON<BoardEntry[]>(key, EMPTY)) : EMPTY;
  cache.set(key, { raw, value });
  return value;
}

export function useLocalBoard(gameId: string) {
  const key = storageKey(gameId, "board");

  const entries = useSyncExternalStore(
    useCallback((onChange) => subscribeKey(key, onChange), [key]),
    () => readBoard(key),
    () => EMPTY,
  );

  const add = useCallback(
    (entry: Omit<BoardEntry, "id" | "at">): { id: string; rank: number } => {
      const full: BoardEntry = { ...entry, id: `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, at: Date.now() };
      const next = sortEntries([...readBoard(key), full]).slice(0, MAX_ENTRIES);
      writeJSON(key, next);
      const rank = next.findIndex((e) => e.id === full.id) + 1;
      return { id: full.id, rank: rank > 0 ? rank : next.length + 1 };
    },
    [key],
  );

  const remove = useCallback((id: string) => writeJSON(key, readBoard(key).filter((e) => e.id !== id)), [key]);
  const clear = useCallback(() => writeJSON(key, []), [key]);

  return useMemo(() => ({ entries, add, remove, clear }), [entries, add, remove, clear]);
}
