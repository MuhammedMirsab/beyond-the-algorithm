/**
 * Runs a match on top of the copied engine, as an external store for React
 * (`useSyncExternalStore`). One instance per game mount.
 *
 * The round order is the exhibit: Space → the AI seals its move from earlier
 * rounds only → 3, 2, 1 → Shoot → your throw (camera or R/P/S) → reveal.
 *
 * - The AI's memory of a visitor (`history`, `learning`) lives here, in memory
 *   only. `newMatch` keeps it (rematch); `forget` wipes it (next player).
 * - At Shoot the camera's earlier frames are forgotten, and the first 300 ms
 *   are ignored while the hand changes shape (a fist pumped during the
 *   countdown must not count as rock).
 * - No confident throw 3 s after Shoot: the round is "missed" and can be
 *   replayed with the same sealed move.
 * - R/P/S pressed during the countdown are kept and thrown at Shoot.
 *
 * Browser only: methods are called from event handlers and effects.
 */
import { AudioManager } from "./audio/audioManager";
import { createInitialLearningSnapshot } from "./engine/aiLearningManager";
import {
  createNewMatchState,
  prepareAndLockRound,
  rearmRound,
  resolveRoundWithValidatedGesture,
  setCountdownStep,
  type ActiveMatchState,
} from "./engine/gameStateManager";
import type { CVFrameResult, Difficulty, Gesture, LearningSnapshot, RoundRecord } from "./engine/types";
import {
  canAcceptRoundGesture,
  clearValidationBuffer,
  createValidationState,
  markRoundGestureConfirmed,
  pushFrameToValidation,
  type ValidationState,
} from "./vision/gestureValidation";

export type InputMode = "camera" | "keys";

export interface MatchView {
  match: ActiveMatchState;
  /** What the AI has learned about this visitor, across rematches. */
  learning: LearningSnapshot;
  /** Every round this visitor has finished, across rematches. */
  history: RoundRecord[];
  inputMode: InputMode;
  /** The camera caught nothing at Shoot; the sealed round can be played again. */
  missed: boolean;
  /** A key pressed during the countdown, thrown at Shoot. */
  pendingThrow: Gesture | null;
}

export const MODE = "first_to_five" as const;
export const TARGET_WINS = 5;
/** One beat of "3, 2, 1, Shoot". */
export const STEP_MS = 700;
/** Ignore the camera this long after Shoot while the hand changes shape. */
export const SHOOT_GRACE_MS = 300;
/** Give up on the camera this long after Shoot. */
export const SHOOT_TIMEOUT_MS = 3000;

function freshView(difficulty: Difficulty, inputMode: InputMode = "camera"): MatchView {
  return {
    match: createNewMatchState(MODE, difficulty),
    learning: createInitialLearningSnapshot(),
    history: [],
    inputMode,
    missed: false,
    pendingThrow: null,
  };
}

/** True while a round is sealed and waiting for, or counting down to, a throw. */
export function isRoundLive(view: MatchView): boolean {
  const phase = view.match.phase;
  return !view.missed && (phase === "locked" || phase === "countdown" || phase === "detecting");
}

export class MatchController {
  private view: MatchView;
  private readonly listeners = new Set<() => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private validation: ValidationState = createValidationState();
  private shootAt = 0;
  private audio: AudioManager | null = null;

  constructor(difficulty: Difficulty = "normal") {
    this.view = freshView(difficulty);
  }

  /* ── Store API ─────────────────────────────────────────────── */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): MatchView => this.view;

  private set(patch: Partial<MatchView>): void {
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }

  /* ── Audio (needs a user gesture first) ────────────────────── */

  unlockAudio(): void {
    (this.audio ??= new AudioManager()).unlock();
  }

  /* ── Matches and visitors ──────────────────────────────────── */

  setInputMode(inputMode: InputMode): void {
    if (inputMode === this.view.inputMode) return;
    this.clearTimers();
    const match = isRoundLive(this.view) || this.view.missed ? this.unsealed(this.view.match) : this.view.match;
    this.set({ inputMode, match, missed: false, pendingThrow: null });
  }

  /** A fresh match. The AI keeps what it learned about this visitor (rematch). */
  newMatch(difficulty: Difficulty): void {
    this.clearTimers();
    this.validation = createValidationState();
    this.set({ match: createNewMatchState(MODE, difficulty), missed: false, pendingThrow: null });
  }

  /** A fresh match and a fresh AI: nothing about the last visitor is kept (next player). */
  forget(difficulty: Difficulty = "normal"): void {
    this.clearTimers();
    this.validation = createValidationState();
    this.set(freshView(difficulty, this.view.inputMode));
  }

  /** Back to "waiting for a round" without scoring, e.g. when the input changes mid-round. */
  private unsealed(match: ActiveMatchState): ActiveMatchState {
    return { ...match, phase: match.lastResolvedRound ? "round_complete" : "idle", countdownValue: null, sealedCommitment: null };
  }

  /* ── A round ───────────────────────────────────────────────── */

  /** Space or the start button. Returns false when a round can't start now. */
  startRound(): boolean {
    const { match, missed, history, learning } = this.view;

    // Replay a missed round: same sealed move, countdown again.
    if (missed && match.phase === "locked" && match.sealedCommitment) {
      this.set({ missed: false, pendingThrow: null, match: { ...match, countdownValue: 3 } });
      this.audio?.playLock();
      this.runCountdown();
      return true;
    }

    if (match.phase !== "idle" && match.phase !== "round_complete") return false;

    // Steps 1-5: predict from finished rounds only, pick the counter move, seal it. Then count down.
    const locked = prepareAndLockRound(match, history, learning);
    this.set({ match: locked, missed: false, pendingThrow: null });
    this.audio?.playLock();
    this.runCountdown();
    return true;
  }

  private runCountdown(): void {
    this.clearTimers();
    this.audio?.playCountdownTick(3);
    this.later(STEP_MS, () => this.step(2));
    this.later(STEP_MS * 2, () => this.step(1));
    this.later(STEP_MS * 3, () => this.shoot());
  }

  private step(value: 2 | 1): void {
    if (!this.view.match.sealedCommitment) return;
    this.set({ match: setCountdownStep(this.view.match, value) });
    this.audio?.playCountdownTick(value);
  }

  private shoot(): void {
    if (!this.view.match.sealedCommitment) return;
    this.set({ match: setCountdownStep(this.view.match, "SHOOT") });
    this.audio?.playCountdownTick("SHOOT");
    this.validation = clearValidationBuffer(this.validation);
    this.shootAt = performance.now();

    const pending = this.view.pendingThrow;
    if (pending) {
      this.resolve(pending);
      return;
    }
    if (this.view.inputMode === "camera") this.later(SHOOT_TIMEOUT_MS, () => this.miss());
  }

  /** R, P or S (keys mode, or as a fallback in camera mode). */
  throwMove(gesture: Gesture): void {
    const phase = this.view.match.phase;
    if (this.view.missed) return;
    if (phase === "detecting") {
      this.audio?.playGestureLocked();
      this.resolve(gesture);
    } else if (phase === "locked" || phase === "countdown") {
      this.set({ pendingThrow: gesture });
    }
  }

  /** Every camera frame. Throws only count after Shoot. */
  onFrame(frame: CVFrameResult): void {
    const { match, inputMode } = this.view;
    const detecting = match.phase === "detecting" && !this.view.missed;
    if (detecting && performance.now() - this.shootAt < SHOOT_GRACE_MS) return;

    this.validation = pushFrameToValidation(this.validation, frame);
    if (!detecting || inputMode !== "camera" || !match.sealedCommitment) return;

    const roundId = match.sealedCommitment.roundId;
    const now = Date.now();
    const check = canAcceptRoundGesture(this.validation, roundId, now);
    if (!check.allowed || !check.gesture) return;
    this.validation = markRoundGestureConfirmed(this.validation, roundId, now);
    this.audio?.playGestureLocked();
    this.resolve(check.gesture);
  }

  /** Steps 7-11: score the throw against the sealed move and update what the AI knows. */
  private resolve(gesture: Gesture): void {
    const { match, learning, history } = this.view;
    if (match.phase !== "detecting") return;
    const result = resolveRoundWithValidatedGesture(match, gesture, learning, history);
    if (!result.accepted || !result.roundRecord) return;
    this.clearTimers();

    const round = result.roundRecord;
    this.set({
      match: result.nextMatch,
      learning: result.nextLearning,
      history: [...history, round],
      missed: false,
      pendingThrow: null,
    });

    const audio = this.audio;
    if (!audio) return;
    audio.playReveal();
    if (result.nextMatch.phase === "match_complete") {
      if (result.nextMatch.winner === "player") audio.playMatchWon();
      else audio.playDefeat();
    } else if (round.outcome === "player_win") {
      if (result.nextMatch.currentPlayerStreak >= 3) audio.playStreakCelebration();
      else audio.playVictory();
    } else if (round.outcome === "ai_win") {
      audio.playDefeat();
    } else {
      audio.playDraw();
    }
  }

  private miss(): void {
    const { match } = this.view;
    if (match.phase !== "detecting" || !match.sealedCommitment) return;
    this.clearTimers();
    this.set({ match: rearmRound(match), missed: true, pendingThrow: null });
    this.audio?.playMiss();
  }

  /* ── Timers and cleanup ────────────────────────────────────── */

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  /** On unmount. The instance stays usable (React StrictMode mounts twice). */
  dispose(): void {
    this.clearTimers();
    this.audio?.dispose();
    this.audio = null;
    this.validation = createValidationState();
    if (isRoundLive(this.view) || this.view.missed) {
      this.view = { ...this.view, match: this.unsealed(this.view.match), missed: false, pendingThrow: null };
    }
  }
}
