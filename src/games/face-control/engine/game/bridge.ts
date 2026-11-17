/**
 * The shared contract between the DOM experience (camera, HUD, menus) and
 * the Phaser world. Phaser never touches the DOM; the DOM never touches
 * physics. Both sides only talk through these objects.
 */

/** Where steering and jumps come from. Written by the face controller and keyboard, read by the game. */
export class GameInput {
  /** -1 (left) .. 1 (right). */
  faceSteer = 0;
  keySteer = 0;
  /** True while the face is the active controller (keyboard is always available as a fallback). */
  faceActive = false;
  private jumpAt = -Infinity;

  get steer() {
    if (this.keySteer !== 0) return this.keySteer;
    return this.faceActive ? this.faceSteer : 0;
  }

  pressJump(now = performance.now()) {
    this.jumpAt = now;
  }

  /** Consumes a jump pressed within `buffer` seconds (jump buffering hides input latency). */
  takeJump(bufferSec: number, now = performance.now()) {
    if (now - this.jumpAt <= bufferSec * 1000) {
      this.jumpAt = -Infinity;
      return true;
    }
    return false;
  }

  clear() {
    this.jumpAt = -Infinity;
    this.keySteer = 0;
  }
}

export interface RunState {
  levelIndex: number;
  score: number;
  scoreAtLevelStart: number;
  lives: number;
  sparks: number;
  sparksTotal: number;
  levelTime: number;
  runTime: number;
  deaths: number;
  levelDeaths: number;
}

export const START_LIVES = 5;

export function newRun(): RunState {
  return {
    levelIndex: 0,
    score: 0,
    scoreAtLevelStart: 0,
    lives: START_LIVES,
    sparks: 0,
    sparksTotal: 0,
    levelTime: 0,
    runTime: 0,
    deaths: 0,
    levelDeaths: 0,
  };
}

export interface LevelResult {
  levelIndex: number;
  time: number;
  sparks: number;
  sparksTotal: number;
  deaths: number;
  sparkScore: number;
  completionBonus: number;
  timeBonus: number;
  perfectBonus: number;
  total: number;
}

export interface GameEvents {
  "level-ready": { levelIndex: number; practice: boolean };
  jump: void;
  land: void;
  collect: { sparks: number; total: number };
  checkpoint: void;
  /** The ball crossed the finish line (results follow shortly with "level-complete"). */
  finished: void;
  died: { lives: number; reason: "hazard" | "fall" };
  "game-over": void;
  "level-complete": LevelResult;
}

type Handler<T> = (payload: T) => void;

export class Emitter<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(event: K, fn: Handler<E[K]>) {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(event: K, ...payload: E[K] extends void ? [] : [E[K]]) {
    this.handlers.get(event)?.forEach((fn) => (fn as Handler<E[K] | undefined>)(payload[0]));
  }

  clear() {
    this.handlers.clear();
  }
}
