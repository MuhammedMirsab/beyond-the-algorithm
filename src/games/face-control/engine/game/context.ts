import type { Emitter, GameEvents, GameInput, RunState } from "./bridge";

/** Shared state handed to the Phaser scenes through the game registry. */
export interface GameContext {
  input: GameInput;
  run: RunState;
  events: Emitter<GameEvents>;
  /**
   * Written by the play scene every frame. The backdrop reads scrollX for
   * parallax; the HUD reads progress (where the ball is between the start and
   * the finish line, 0 to 1) for its level track.
   */
  view: { scrollX: number; active: boolean; progress: number };
}

export const CONTEXT_KEY = "fc-context";
