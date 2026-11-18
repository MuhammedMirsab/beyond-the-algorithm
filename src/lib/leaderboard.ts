"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getDb } from "./firebase";

/**
 * Shared scoreboards in Firestore: a score added on the booth laptop shows up
 * on every other screen with the board open, within a second. Firestore's
 * local cache keeps the board on the device, so it still shows on bad Wi-Fi
 * and new scores upload once the connection is back.
 *
 * Path: boards/<game>/entries/<id>. Only the top TOP entries are listened to,
 * which keeps a busy exhibition day inside the free plan's daily reads.
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

const TOP = 20;
const DETAIL_MAX = 80;
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

/** A Firestore document as a board entry, or null if it isn't one. */
function toEntry(id: string, data: Record<string, unknown>): BoardEntry | null {
  if (typeof data.name !== "string" || typeof data.score !== "number") return null;
  const at = data.at as { toMillis?: () => number } | null | undefined;
  return {
    id,
    name: data.name,
    score: data.score,
    detail: typeof data.detail === "string" ? data.detail : undefined,
    tiebreak: typeof data.tiebreak === "number" ? data.tiebreak : undefined,
    // A just-written entry has no server time yet: treat it as now.
    at: typeof at?.toMillis === "function" ? at.toMillis() : Date.now(),
  };
}

const newId = () => `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function useBoard(gameId: string) {
  const [remote, setRemote] = useState<BoardEntry[]>(EMPTY);
  const [mine, setMine] = useState<BoardEntry[]>(EMPTY);
  const [ranks, setRanks] = useState<Record<string, number>>({});
  const [total, setTotal] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  // Listen to the top of the board while it is on screen.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    let counting = false;

    (async () => {
      try {
        const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
        if (cancelled) return;
        const entries = fs.collection(db, "boards", gameId, "entries");

        // The player count: one cheap aggregate read, refreshed when the board changes.
        const recount = async () => {
          if (counting) return;
          counting = true;
          try {
            const snap = await fs.getCountFromServer(entries);
            if (!cancelled) setTotal(snap.data().count);
          } catch {
            // Offline: keep the last count.
          } finally {
            counting = false;
          }
        };

        unsubscribe = fs.onSnapshot(
          fs.query(entries, fs.orderBy("score", "desc"), fs.limit(TOP)),
          (snap) => {
            const list: BoardEntry[] = [];
            for (const d of snap.docs) {
              const entry = toEntry(d.id, d.data());
              if (entry) list.push(entry);
            }
            setRemote(list);
            setReady(true);
            if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) void recount();
          },
          () => setReady(true),
        );
      } catch {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [gameId]);

  const add = useCallback(
    (entry: Omit<BoardEntry, "id" | "at">): { id: string } => {
      const full: BoardEntry = { ...entry, detail: entry.detail?.slice(0, DETAIL_MAX), id: newId(), at: Date.now() };
      // Shown straight away; the shared board confirms it a moment later.
      setMine((list) => [...list, full]);
      setTotal((n) => (n == null ? n : n + 1));

      void (async () => {
        try {
          const [db, fs] = await Promise.all([getDb(), import("firebase/firestore")]);
          const data: Record<string, unknown> = { name: full.name, score: full.score, at: fs.serverTimestamp() };
          if (full.detail) data.detail = full.detail;
          if (typeof full.tiebreak === "number") data.tiebreak = full.tiebreak;
          await fs.setDoc(fs.doc(db, "boards", gameId, "entries", full.id), data);
          // Its real place, even when it is below the top of the board.
          const above = await fs.getCountFromServer(
            fs.query(fs.collection(db, "boards", gameId, "entries"), fs.where("score", ">", full.score)),
          );
          setRanks((r) => ({ ...r, [full.id]: above.data().count + 1 }));
        } catch {
          // Offline or refused: it stays on this screen and Firestore retries when it can.
        }
      })();

      return { id: full.id };
    },
    [gameId],
  );

  const entries = useMemo(() => {
    const seen = new Set(remote.map((e) => e.id));
    return sortEntries([...remote, ...mine.filter((e) => !seen.has(e.id))]);
  }, [remote, mine]);

  /** 1-based place on the whole board, when known. */
  const rankOf = useCallback(
    (id: string): number | undefined => {
      if (ranks[id]) return ranks[id];
      const i = entries.findIndex((e) => e.id === id);
      return i >= 0 && i < TOP ? i + 1 : undefined;
    },
    [ranks, entries],
  );

  return useMemo(
    () => ({ entries, add, rankOf, total: total ?? (ready ? entries.length : null), ready }),
    [entries, add, rankOf, total, ready],
  );
}
