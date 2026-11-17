import type { Emitter, GameEvents, GameInput, RunState } from "./bridge";

/** Shared state handed to the Phaser scenes through the game registry. */
export interface GameContext {
  input: GameInput;
  run: RunState;
  events: Emitter<GameEvents>;
  /** Written by the play scene every frame; read by the backdrop for parallax. */
  view: { scrollX: number; active: boolean };
}

export const CONTEXT_KEY = "fc-context";
