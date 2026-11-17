import type { Delegate, DelegateTimings } from "./tracker";

/** What the React HUD needs from the engine. Updated sparingly (events + 2 Hz metrics). */
export interface EngineSnapshot {
  lens: number;
  locked: boolean;
  /** Hint state: has this session locked a frame yet? */
  everLocked: boolean;
  hands: number;
  /** Hint state: lens changes made by pinching this session. */
  pinches: number;
  fps: number;
  inferenceMs: number;
  latencyMs: number | null;
  delegate: Delegate | null;
  /** Startup benchmark per backend (ms). */
  bench: DelegateTimings | null;
  mirror: boolean;
  skeleton: boolean;
  /** Session counters, all measured: camera pictures the hand model checked. */
  framesTracked: number;
  /** Hands found, summed over every checked picture (two hands in one picture count twice). */
  handsFound: number;
  /** Times a frame locked on. */
  locks: number;
  /** Distinct lenses that were seen inside a locked frame. */
  lensesTried: number;
}

export const INITIAL_SNAPSHOT: EngineSnapshot = {
  lens: 0,
  locked: false,
  everLocked: false,
  hands: 0,
  pinches: 0,
  fps: 0,
  inferenceMs: 0,
  latencyMs: null,
  delegate: null,
  bench: null,
  mirror: true,
  skeleton: false,
  framesTracked: 0,
  handsFound: 0,
  locks: 0,
  lensesTried: 0,
};

/** Everything that belongs to one visitor's session: hints, live state and counters. */
const SESSION_RESET: Partial<EngineSnapshot> = {
  locked: false,
  everLocked: false,
  hands: 0,
  pinches: 0,
  fps: 0,
  inferenceMs: 0,
  latencyMs: null,
  framesTracked: 0,
  handsFound: 0,
  locks: 0,
  lensesTried: 0,
};

/** Minimal external store for `useSyncExternalStore`: the frame loop never re-renders React. */
export class EngineStore {
  private snapshot: EngineSnapshot = INITIAL_SNAPSHOT;
  private readonly listeners = new Set<() => void>();

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => INITIAL_SNAPSHOT;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  update(patch: Partial<EngineSnapshot>) {
    const keys = Object.keys(patch) as Array<keyof EngineSnapshot>;
    if (!keys.some((k) => !Object.is(patch[k], this.snapshot[k]))) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  /**
   * End of a session (End session, Play again): clears the hints and counters
   * so the next run starts from "Raise both hands". Keeps the chosen lens and
   * the view settings for a visitor who plays again.
   */
  resetSession() {
    this.update(SESSION_RESET);
  }

  /** Next player: back to the very first state, lens and view settings included. */
  reset() {
    this.update(INITIAL_SNAPSHOT);
  }
}
