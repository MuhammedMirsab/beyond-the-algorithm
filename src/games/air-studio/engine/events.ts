import type { InstrumentId } from "./settings";

/**
 * Every note, hit and strum is announced on the play bus (copied from the
 * original app). The recorder logs them, the lesson judge scores them, and
 * the "How it works" numbers count them.
 */

/** A performance event. `t` is AudioContext time (seconds) live, or seconds from the take's start once recorded. */
export interface PlayEvent {
  t: number;
  inst: InstrumentId;
  kind: "note" | "hit" | "strum";
  /** Primary pitch (the root for chords). */
  midi?: number;
  /** Every sounding pitch. */
  notes?: number[];
  piece?: string;
  chord?: string;
  dir?: "down" | "up";
  muted?: boolean;
  /** Loudness, 0 to 1. */
  vel: number;
  dur?: number;
  hand?: "Left" | "Right" | "Sim";
  id?: string;
  preset?: string;
  /** The hand's speed when it triggered, in size-normalised frame units per second (see hands.ts). */
  speed?: number;
}

export interface ReleaseEvent {
  id: string;
  t: number;
}

type Listener<T> = (e: T) => void;

class Bus {
  private on = new Set<Listener<PlayEvent>>();
  private off = new Set<Listener<ReleaseEvent>>();
  play(fn: Listener<PlayEvent>) {
    this.on.add(fn);
    return () => {
      this.on.delete(fn);
    };
  }
  release(fn: Listener<ReleaseEvent>) {
    this.off.add(fn);
    return () => {
      this.off.delete(fn);
    };
  }
  emit(e: PlayEvent) {
    this.on.forEach((f) => f(e));
  }
  emitRelease(e: ReleaseEvent) {
    this.off.forEach((f) => f(e));
  }
}

export const playBus = new Bus();

/** The key used to match an event against a lesson target. */
export function eventKey(e: PlayEvent): string {
  if (e.kind === "hit") return e.piece ?? "";
  if (e.kind === "strum") return e.chord ?? "";
  return String(e.midi ?? "");
}
