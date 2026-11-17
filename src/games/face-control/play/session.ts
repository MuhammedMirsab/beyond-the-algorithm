import { isSoundOn, setSoundOn } from "@/lib/sound";
import { audio } from "../engine/audio/audio";
import { Emitter, GameInput, newRun, START_LIVES, type GameEvents, type RunState } from "../engine/game/bridge";
import type { GameContext } from "../engine/game/context";
import { loadCanvasFonts } from "../engine/game/fonts";
import type { GameHost } from "../engine/game/host";
import { LEVELS, PRACTICE } from "../engine/game/levels";
import type { LevelDef } from "../engine/game/levels/types";
import { clearRecords, getRecords, submitLevel, submitRun, submitScore } from "../engine/state/records";
import { resetSettings, settings } from "../engine/state/settings";
import type { CalibMeasured, CalibrationProfile } from "../engine/vision/calibration";
import { attachStream, CameraError, openCamera, stopStream } from "../engine/vision/camera";
import { FaceController, type ControlSnapshot } from "../engine/vision/face-controller";
import {
  holdFaceTracker,
  loadFaceTracker,
  parseDelegate,
  releaseFaceTracker,
  unlistenFaceTracker,
  type Delegate,
  type FaceTracker,
  type LoadProgress,
} from "../engine/vision/tracker";
import { CameraSurface, type Density } from "./camera-surface";
import {
  initialState,
  inWorld,
  primaryEvent,
  transition,
  type Effect,
  type Issue,
  type MachineEvent,
  type MachineState,
  type RunSummary,
} from "./machine";

export interface ModelState {
  status: "loading" | "ready" | "failed";
  stage: LoadProgress["stage"];
  fraction: number;
  loaded: number;
  total: number;
  delegate: Delegate | null;
}

/** What the visitor showed the camera during calibration. Memory only; Next player forgets it. */
export interface CalibrationResult {
  profile: CalibrationProfile;
  measured: CalibMeasured;
  /** The 478 points at the neutral pose (raw camera coordinates, 0..1), drawn in the reveal. */
  points: { x: number; y: number }[] | null;
  /** Width / height of the camera picture the points came from. */
  aspect: number;
}

/** Real tracking numbers from this visit, for the reveal. */
export interface TrackingStats {
  fps: number | null;
  delegate: Delegate | null;
  points: number | null;
}

export interface SessionView {
  machine: MachineState;
  /** 3, 2, 1, then 0 for "Go". Null when no countdown is showing. */
  countdown: number | null;
  toast: { id: number; text: string } | null;
  model: ModelState;
  settingsOpen: boolean;
  calibration: CalibrationResult | null;
  tracking: TrackingStats;
  /** This visitor's best time per level index (only levels they have finished). */
  bestTimes: Partial<Record<number, number>>;
}

const INITIAL_MODEL: ModelState = { status: "loading", stage: "download", fraction: 0, loaded: 0, total: 0, delegate: null };
const INITIAL_TRACKING: TrackingStats = { fps: null, delegate: null, points: null };

const SERVER_VIEW: SessionView = {
  machine: initialState(),
  countdown: null,
  toast: null,
  model: INITIAL_MODEL,
  settingsOpen: false,
  calibration: null,
  tracking: INITIAL_TRACKING,
  bestTimes: {},
};

/** Keyboard codes, plus the on-screen buttons used on touch devices. */
const STEER_KEYS: Record<string, number> = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1, TouchLeft: -1, TouchRight: 1 };
/** Seconds of steering (past 45%) that tick off a practice task. */
const PRACTICE_HOLD_S = 0.3;
const PRACTICE_STEER = 0.45;
const COUNTDOWN_STEP_MS = 560;
const GO_SHOWN_MS = 420;
const TOAST_MS = 1800;
const PRACTICE_DONE_MS = 1600;

function issueFrom(err: unknown): Issue {
  if (err instanceof CameraError) {
    switch (err.code) {
      case "denied":
      case "missing":
      case "busy":
      case "insecure":
      case "unsupported":
      case "ended":
        return err.code;
      default:
        return "unknown";
    }
  }
  return "unknown";
}

/** Controls that should keep Space and Enter for themselves when focused. */
const OWN_KEYS = "button, a[href], input, select, textarea, [role='button'], [role='slider'], [role='switch'], [role='tab']";

/**
 * One visit to Face Control: owns the camera, the face controller, the Phaser
 * host, timers and keyboard input, runs the effects the pure state machine
 * asks for, and publishes a snapshot for React (useSyncExternalStore).
 *
 * Construction has no side effects. start() and stop() bracket the mounted
 * lifetime and can run more than once (React StrictMode mounts twice).
 */
export class FaceControlSession {
  readonly input = new GameInput();
  readonly run: RunState = newRun();
  readonly events = new Emitter<GameEvents>();
  readonly ctx: GameContext = { input: this.input, run: this.run, events: this.events, view: { scrollX: 0, active: false } };

  private machine: MachineState = SERVER_VIEW.machine;
  private view: SessionView = SERVER_VIEW;
  private readonly listeners = new Set<() => void>();
  private readonly frameListeners = new Set<(s: ControlSnapshot) => void>();
  private readonly jumpListeners = new Set<() => void>();

  private started = false;
  private queue: MachineEvent[] = [];
  private dispatching = false;
  private dirty = false;

  private stage: HTMLElement | null = null;
  private host: GameHost | null = null;
  private hostPromise: Promise<GameHost | null> | null = null;
  private hostToken = 0;
  private surface: CameraSurface | null = null;
  /** Mounted camera slots, newest last; the preview shows in the newest. */
  private cameraSlots: { el: HTMLElement; density: Density }[] = [];
  private stream: MediaStream | null = null;
  private tracker: FaceTracker | null = null;
  private trackerPromise: Promise<FaceTracker> | null = null;
  private controller: FaceController | null = null;
  private cameraToken = 0;
  private forcedDelegate: Delegate | null = null;

  private countdownTimer = 0;
  private toastTimer = 0;
  private practiceTimer = 0;
  private toastId = 0;
  private disposers: (() => void)[] = [];
  private readonly keysDown = new Set<string>();

  private profile: CalibrationProfile | null = null;
  private livesAtLevelStart = START_LIVES;
  private sparksBanked = 0;
  private practiceHold = { left: 0, right: 0 };
  private lastFrameT = 0;
  private fpsSum = 0;
  private fpsCount = 0;
  private lastPoints: number | null = null;

  // ---------------------------------------------------------------------------
  // React bindings
  // ---------------------------------------------------------------------------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.view;

  getServerSnapshot = () => SERVER_VIEW;

  /** Every tracking frame (~30 per second). For imperative drawing; never set React state per frame. */
  onFrame = (fn: (s: ControlSnapshot) => void) => {
    this.frameListeners.add(fn);
    return () => {
      this.frameListeners.delete(fn);
    };
  };

  /** Fires when an open mouth triggers a jump. */
  onJump = (fn: () => void) => {
    this.jumpListeners.add(fn);
    return () => {
      this.jumpListeners.delete(fn);
    };
  };

  /** Ref callback for the full-bleed element the Phaser world lives in. */
  setStage = (el: HTMLElement | null) => {
    if (this.stage === el) return;
    if (this.host && this.stage && el !== this.stage) this.destroyHost();
    this.stage = el;
  };

  /** Shows the live camera inside `el` until releaseCamera(el). The newest slot wins. */
  showCamera = (el: HTMLElement, density: Density = "all") => {
    this.cameraSlots = [...this.cameraSlots.filter((s) => s.el !== el), { el, density }];
    this.placeSurface();
  };

  /** When the newest slot goes, the preview returns to the one before it (e.g. a panel closes over the dock). */
  releaseCamera = (el: HTMLElement) => {
    this.cameraSlots = this.cameraSlots.filter((s) => s.el !== el);
    this.placeSurface();
  };

  private placeSurface() {
    const surface = this.surface;
    if (!surface) return;
    const top = this.cameraSlots[this.cameraSlots.length - 1];
    if (top) surface.mount(top.el, top.density);
    else surface.park();
  }

  // ---------------------------------------------------------------------------
  // Lifetime
  // ---------------------------------------------------------------------------

  start() {
    if (this.started) return;
    this.started = true;
    this.machine = initialState();
    this.view = {
      ...SERVER_VIEW,
      machine: this.machine,
      model: this.tracker ? this.readyModel(this.tracker) : INITIAL_MODEL,
      // A reload mid-visit keeps this visitor's best times.
      bestTimes: this.readBestTimes(),
    };
    this.forcedDelegate = parseDelegate(window.location.search);

    const onKeyDown = (e: KeyboardEvent) => this.onKeyDown(e);
    const onKeyUp = (e: KeyboardEvent) => {
      if (this.keysDown.delete(e.code)) this.updateSteer();
    };
    const onBlur = () => {
      this.keysDown.clear();
      this.updateSteer();
    };
    const onVisibility = () => {
      if (document.hidden) this.dispatch({ type: "hidden" });
    };
    // Capture phase: runs before dialogs handle Escape, so closing Settings never also resumes the game.
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    this.disposers.push(
      () => window.removeEventListener("keydown", onKeyDown, true),
      () => window.removeEventListener("keyup", onKeyUp, true),
      () => window.removeEventListener("blur", onBlur),
      () => document.removeEventListener("visibilitychange", onVisibility),
    );
    this.bindGameEvents();

    audio.arm();
    holdFaceTracker();
    // Warm the face model up while the visitor reads the intro.
    void this.ensureTracker().catch(() => {});
    this.notify();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.disposers.forEach((fn) => fn());
    this.disposers = [];
    this.events.clear();
    this.cancelCountdown();
    window.clearTimeout(this.toastTimer);
    window.clearTimeout(this.practiceTimer);
    this.stopCamera();
    this.surface?.destroy();
    this.surface = null;
    this.destroyHost();
    unlistenFaceTracker(this.onModelProgress);
    this.trackerPromise = null;
    releaseFaceTracker();
    audio.release();
    this.resetVisitor();
    this.queue = [];
    this.machine = initialState();
    this.view = { ...SERVER_VIEW, machine: this.machine };
  }

  // ---------------------------------------------------------------------------
  // Actions for the UI
  // ---------------------------------------------------------------------------

  /** A user gesture: unlock audio, then hand the event to the machine. */
  act = (event: MachineEvent) => {
    audio.ensure();
    audio.play("click", { gain: 0.6 });
    this.dispatch(event);
  };

  openSettings = () => {
    if (this.machine.phase === "playing" || this.machine.phase === "countdown") this.dispatch({ type: "pause" });
    this.setView({ settingsOpen: true });
  };

  closeSettings = () => this.setView({ settingsOpen: false });

  /** On-screen roll buttons (keyboard mode on touch devices): held like arrow keys. */
  touchSteer = (dir: -1 | 1, down: boolean) => {
    const code = dir < 0 ? "TouchLeft" : "TouchRight";
    if (down) {
      audio.ensure();
      this.keysDown.add(code);
      if (this.machine.phase === "practice") this.dispatch({ type: "practice-task", task: dir < 0 ? "left" : "right" });
    } else {
      this.keysDown.delete(code);
    }
    this.updateSteer();
  };

  /** On-screen jump button. */
  touchJump = () => {
    audio.ensure();
    const phase = this.machine.phase;
    if (phase === "playing" || phase === "practice") this.input.pressJump();
  };

  /** "GPU" or "CPU" once the face model is running, for readouts. */
  get delegateLabel(): string {
    return this.tracker?.delegate ?? "";
  }

  /** The calibration screen finished: keep this visitor's numbers (in memory only) and move on. */
  finishCalibration = (result: Omit<CalibrationResult, "aspect">) => {
    this.profile = result.profile;
    this.controller?.setProfile(result.profile);
    this.setView({ calibration: { ...result, aspect: this.surface?.aspect ?? 4 / 3 } });
    this.dispatch({ type: "calibrated" });
  };

  // ---------------------------------------------------------------------------
  // The machine
  // ---------------------------------------------------------------------------

  dispatch = (event: MachineEvent) => {
    if (!this.started) return;
    this.queue.push(event);
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      while (this.queue.length) {
        const next = this.queue.shift()!;
        const prev = this.machine;
        const { state, effects } = transition(prev, next, performance.now());
        if (state !== prev) {
          this.machine = state;
          this.dirty = true;
        }
        for (const effect of effects) this.runEffect(effect);
        if (state.phase !== prev.phase) this.onPhaseChange(prev, state);
      }
    } finally {
      this.dispatching = false;
    }
    if (this.dirty) this.notify();
  };

  private onPhaseChange(prev: MachineState, next: MachineState) {
    this.syncStage();
    // Build the world (asleep, hidden) while the visitor calibrates, so practice opens on it.
    if (next.phase === "calibrate") void this.ensureHost();
    audio.duck(next.phase === "paused" || next.phase === "face-lost");
    if (next.phase === "practice") this.practiceHold = { left: 0, right: 0 };
    // Space must jump, not press whichever button kept focus from the last panel.
    if (next.phase === "playing" && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    if (next.phase !== "practice" && next.phase !== "playing" && prev.phase === "playing") this.input.clear();
  }

  private runEffect(effect: Effect) {
    switch (effect.type) {
      case "camera-start":
        void this.startCamera();
        break;
      case "camera-stop":
        this.stopCamera();
        break;
      case "load-practice":
        void this.loadLevel(PRACTICE, -1).then((ok) => ok && this.dispatch({ type: "practice-loaded" }));
        break;
      case "load-level": {
        const { index } = effect;
        void this.loadLevel(LEVELS[index], index).then((ok) => ok && this.dispatch({ type: "level-loaded", index }));
        break;
      }
      case "host":
        if (effect.op === "pause") this.host?.pause();
        else if (effect.op === "resume") this.host?.resume();
        else if (effect.op === "begin") this.host?.begin();
        else this.host?.unloadLevel();
        break;
      case "theme":
        this.host?.setTheme(effect.theme);
        break;
      case "music":
        audio.setMusic(effect.theme);
        break;
      case "sfx":
        audio.play(effect.name);
        break;
      case "run":
        this.runOp(effect.op, effect.index);
        break;
      case "rearm":
        this.controller?.rearm(true);
        break;
      case "clear-input":
        this.input.clear();
        this.updateSteer();
        break;
      case "countdown":
        this.startCountdown(effect.from);
        break;
      case "cancel-countdown":
        this.cancelCountdown();
        break;
      case "practice-finish-soon":
        window.clearTimeout(this.practiceTimer);
        this.practiceTimer = window.setTimeout(() => this.dispatch({ type: "practice-finished" }), PRACTICE_DONE_MS);
        break;
      case "record-level": {
        const { result } = effect;
        this.sparksBanked += result.sparks;
        const level = LEVELS[result.levelIndex];
        const { newBestTime, previousBest } = submitLevel(level.id, result.time, result.sparks);
        this.setView({ bestTimes: this.readBestTimes() });
        this.dispatch({ type: "level-recorded", previousBest, newBestTime });
        break;
      }
      case "finish-run":
        this.dispatch({ type: "summary", summary: this.summarise(effect.outcome) });
        break;
      case "reset-visitor":
        this.resetVisitor();
        break;
      case "toast":
        this.toast(effect.text);
        break;
    }
  }

  private runOp(op: "new" | "level-start" | "restart-level" | "retry-level", index?: number) {
    const run = this.run;
    switch (op) {
      case "new":
        Object.assign(run, newRun());
        this.sparksBanked = 0;
        this.livesAtLevelStart = START_LIVES;
        break;
      case "level-start":
        run.levelIndex = index ?? run.levelIndex;
        run.scoreAtLevelStart = run.score;
        this.livesAtLevelStart = run.lives;
        break;
      case "restart-level":
        run.score = run.scoreAtLevelStart;
        run.lives = this.livesAtLevelStart;
        break;
      case "retry-level":
        run.score = run.scoreAtLevelStart;
        run.lives = START_LIVES;
        break;
    }
  }

  private summarise(outcome: RunSummary["outcome"]): RunSummary {
    const run = this.run;
    const { isBest, previous } = submitScore(run.score);
    if (outcome === "victory") submitRun(run.runTime);
    const played = outcome === "victory" ? LEVELS : LEVELS.slice(0, run.levelIndex + 1);
    const tracking: TrackingStats = {
      fps: this.fpsCount ? this.fpsSum / this.fpsCount : null,
      delegate: this.tracker?.delegate ?? null,
      points: this.lastPoints,
    };
    this.setView({ tracking });
    return {
      outcome,
      score: run.score,
      previousBest: previous,
      isBest,
      levelIndex: run.levelIndex,
      runTime: run.runTime,
      deaths: run.deaths,
      lives: run.lives,
      sparks: this.sparksBanked + (outcome === "game-over" ? run.sparks : 0),
      sparksTotal: played.reduce((n, l) => n + l.sparks.length, 0),
    };
  }

  private resetVisitor() {
    clearRecords();
    resetSettings();
    this.profile = null;
    Object.assign(this.run, newRun());
    this.sparksBanked = 0;
    this.livesAtLevelStart = START_LIVES;
    this.keysDown.clear();
    this.input.clear();
    this.input.keySteer = 0;
    this.fpsSum = 0;
    this.fpsCount = 0;
    this.lastPoints = null;
    window.clearTimeout(this.practiceTimer);
    this.setView({ calibration: null, tracking: INITIAL_TRACKING, settingsOpen: false, bestTimes: {} });
  }

  private readBestTimes(): Partial<Record<number, number>> {
    const levels = getRecords().levels;
    const out: Partial<Record<number, number>> = {};
    LEVELS.forEach((level, index) => {
      const best = levels[String(level.id)]?.bestTime;
      if (best != null) out[index] = best;
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // View
  // ---------------------------------------------------------------------------

  private setView(patch: Partial<Omit<SessionView, "machine">>) {
    this.view = { ...this.view, ...patch };
    this.dirty = true;
    if (!this.dispatching) this.notify();
  }

  private notify() {
    this.dirty = false;
    if (this.view.machine !== this.machine) this.view = { ...this.view, machine: this.machine };
    if (this.started) this.listeners.forEach((fn) => fn());
  }

  private toast(text: string) {
    this.toastId += 1;
    this.setView({ toast: { id: this.toastId, text } });
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.setView({ toast: null }), TOAST_MS);
  }

  private startCountdown(from: number) {
    this.cancelCountdown();
    let n = from;
    const tick = () => {
      if (!this.started) return;
      if (n > 0) {
        this.setView({ countdown: n });
        audio.play("tick");
        n -= 1;
        this.countdownTimer = window.setTimeout(tick, COUNTDOWN_STEP_MS);
        return;
      }
      this.setView({ countdown: 0 });
      audio.play("go");
      this.input.clear();
      this.updateSteer();
      // A mouth still open from "open to start" must close before it can jump.
      this.controller?.rearm(true);
      this.dispatch({ type: "countdown-done" });
      this.countdownTimer = window.setTimeout(() => this.setView({ countdown: null }), GO_SHOWN_MS);
    };
    tick();
  }

  private cancelCountdown() {
    window.clearTimeout(this.countdownTimer);
    if (this.view.countdown !== null) this.setView({ countdown: null });
  }

  // ---------------------------------------------------------------------------
  // Model and camera
  // ---------------------------------------------------------------------------

  private readyModel(tracker: FaceTracker): ModelState {
    return { ...INITIAL_MODEL, status: "ready", stage: "initialise", fraction: 1, delegate: tracker.delegate };
  }

  private readonly onModelProgress = (p: LoadProgress) => {
    const prev = this.view.model;
    if (prev.status === "ready") return;
    // Only republish when the readout would change (whole percent or stage).
    if (prev.status === "loading" && prev.stage === p.stage && Math.round(prev.fraction * 100) === Math.round(p.fraction * 100)) return;
    this.setView({ model: { ...prev, status: "loading", stage: p.stage, fraction: p.fraction, loaded: p.loaded, total: p.total } });
  };

  private ensureTracker(): Promise<FaceTracker> {
    if (this.tracker) return Promise.resolve(this.tracker);
    if (!this.trackerPromise) {
      if (this.view.model.status === "failed") this.setView({ model: INITIAL_MODEL });
      const pending = loadFaceTracker(this.onModelProgress, this.forcedDelegate);
      this.trackerPromise = pending;
      pending.then(
        (tracker) => {
          if (this.trackerPromise !== pending || !this.started) return;
          this.tracker = tracker;
          this.setView({ model: this.readyModel(tracker) });
          // Fetch the game engine next, so the first level never waits for the download.
          void import("../engine/game/host").catch(() => {});
        },
        () => {
          if (this.trackerPromise !== pending) return;
          this.trackerPromise = null;
          if (this.started) this.setView({ model: { ...this.view.model, status: "failed" } });
        },
      );
    }
    return this.trackerPromise;
  }

  private ensureSurface(): CameraSurface {
    if (!this.surface) {
      this.surface = new CameraSurface();
      this.placeSurface();
    }
    return this.surface;
  }

  private async startCamera() {
    const token = ++this.cameraToken;
    let stream: MediaStream;
    try {
      stream = await openCamera();
    } catch (err) {
      if (token === this.cameraToken) this.dispatch({ type: "camera-failed", issue: issueFrom(err) });
      return;
    }
    if (token !== this.cameraToken || !this.started) {
      stopStream(stream);
      return;
    }
    this.stream = stream;
    for (const track of stream.getVideoTracks()) {
      track.addEventListener("ended", () => {
        if (this.stream === stream) this.dispatch({ type: "camera-lost", issue: "ended" });
      });
    }

    const surface = this.ensureSurface();
    try {
      await attachStream(surface.video, stream);
    } catch {
      if (token === this.cameraToken) this.dispatch({ type: "camera-failed", issue: "unknown" });
      return;
    }
    if (token !== this.cameraToken) return;

    let tracker = this.tracker;
    if (!tracker) {
      this.dispatch({ type: "camera-granted" });
      try {
        tracker = await this.ensureTracker();
      } catch {
        if (token === this.cameraToken) this.dispatch({ type: "camera-failed", issue: "model" });
        return;
      }
      if (token !== this.cameraToken) return;
      this.tracker = tracker;
    }

    this.controller?.dispose();
    const controller = new FaceController(tracker);
    this.controller = controller;
    if (this.profile) controller.setProfile(this.profile);
    controller.onFrame((s) => this.onFaceFrame(s));
    controller.onJump(() => this.onFaceJump());
    controller.onError(() => this.dispatch({ type: "camera-lost", issue: "tracking" }));
    controller.start(surface.video);
    this.input.faceActive = true;
    this.fpsSum = 0;
    this.fpsCount = 0;
    this.lastFrameT = 0;
    this.dispatch({ type: "camera-ready" });
  }

  private stopCamera() {
    this.cameraToken += 1;
    this.controller?.dispose();
    this.controller = null;
    stopStream(this.stream);
    this.stream = null;
    this.surface?.detach();
    this.input.faceActive = false;
    this.input.faceSteer = 0;
  }

  private onFaceFrame(s: ControlSnapshot) {
    if (!this.started || !this.controller) return;
    this.input.faceSteer = s.steer;
    this.surface?.draw(s, settings.get().showLandmarks);
    if (s.landmarks) this.lastPoints = s.landmarks.length;
    if (s.fps > 0 && s.hasFace) {
      this.fpsSum += s.fps;
      this.fpsCount += 1;
    }
    this.frameListeners.forEach((fn) => fn(s));

    if (this.machine.phase === "practice") {
      // Seconds of steering, measured in real time so slow tracking doesn't ask for a longer hold.
      const dt = this.lastFrameT ? Math.min(0.2, Math.max(0, (s.t - this.lastFrameT) / 1000)) : 0;
      if (s.steer < -PRACTICE_STEER) this.practiceHold.left += dt;
      if (s.steer > PRACTICE_STEER) this.practiceHold.right += dt;
      if (this.practiceHold.left >= PRACTICE_HOLD_S) this.dispatch({ type: "practice-task", task: "left" });
      if (this.practiceHold.right >= PRACTICE_HOLD_S) this.dispatch({ type: "practice-task", task: "right" });
    }
    this.lastFrameT = s.t;
    this.dispatch({ type: "frame", hasFace: s.hasFace, lost: s.status === "lost" });
  }

  private onFaceJump() {
    this.jumpListeners.forEach((fn) => fn());
    const phase = this.machine.phase;
    if (phase === "playing" || phase === "practice") this.input.pressJump();
    this.dispatch({ type: "mouth" });
  }

  // ---------------------------------------------------------------------------
  // Phaser
  // ---------------------------------------------------------------------------

  private ensureHost(): Promise<GameHost | null> {
    if (!this.hostPromise) {
      const stage = this.stage;
      if (!stage || !this.started) return Promise.resolve(null);
      const token = ++this.hostToken;
      this.hostPromise = (async () => {
        await loadCanvasFonts();
        const { GameHost } = await import("../engine/game/host");
        // Unmounted, or the stage changed, while Phaser was loading: build nothing.
        if (!this.started || this.stage !== stage || this.hostToken !== token) return null;
        const host = new GameHost(stage, this.ctx);
        this.host = host;
        await host.ready;
        if (!this.started || this.host !== host) return null;
        this.syncStage();
        return host;
      })();
    }
    return this.hostPromise;
  }

  private destroyHost() {
    this.hostToken += 1;
    this.host?.destroy();
    this.host = null;
    this.hostPromise = null;
    this.ctx.view.active = false;
  }

  private async loadLevel(level: LevelDef, index: number): Promise<boolean> {
    const host = await this.ensureHost();
    if (!host || !this.started || this.host !== host) return false;
    host.wake();
    await host.loadLevel(level, index);
    return this.started && this.host === host;
  }

  /** The world only runs while it is on screen. */
  private syncStage() {
    if (!this.host) return;
    if (inWorld(this.machine.phase)) this.host.wake();
    else this.host.sleep();
  }

  private bindGameEvents() {
    const ev = this.events;
    ev.on("jump", () => this.dispatch({ type: "practice-task", task: "jump" }));
    ev.on("finished", () => this.dispatch({ type: "level-finished" }));
    ev.on("checkpoint", () => this.toast("Checkpoint"));
    ev.on("died", ({ lives }) => {
      if (this.machine.phase === "practice") this.toast("No lives lost in practice");
      else if (lives > 1) this.toast(`${lives} lives left`);
      else if (lives === 1) this.toast("1 life left");
    });
    ev.on("game-over", () => this.dispatch({ type: "game-over" }));
    ev.on("level-complete", (result) => this.dispatch({ type: "level-complete", result }));
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  private updateSteer() {
    let s = 0;
    for (const k of this.keysDown) s += STEER_KEYS[k] ?? 0;
    this.input.keySteer = Math.max(-1, Math.min(1, s));
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (this.view.settingsOpen || target?.closest("input, select, textarea, [role='dialog']")) return;
    const phase = this.machine.phase;
    const steer = STEER_KEYS[e.code];

    if (steer !== undefined) {
      if (!inWorld(phase)) return;
      e.preventDefault();
      this.keysDown.add(e.code);
      this.updateSteer();
      if (phase === "practice") this.dispatch({ type: "practice-task", task: steer < 0 ? "left" : "right" });
      return;
    }

    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      if (phase === "playing" || phase === "practice") {
        e.preventDefault();
        if (!e.repeat) this.input.pressJump();
        return;
      }
      if (e.code !== "Space" || target?.closest(OWN_KEYS)) return;
      e.preventDefault();
      if (!e.repeat) this.primary();
      return;
    }

    if (e.code === "Enter" || e.code === "NumpadEnter") {
      if (target?.closest(OWN_KEYS) || e.repeat) return;
      this.primary();
      return;
    }

    if (e.code === "KeyP" || e.code === "Escape") {
      if (phase === "playing" || phase === "countdown") this.act({ type: "pause" });
      else if (phase === "paused") this.act({ type: "resume" });
      return;
    }

    if (e.code === "KeyM" && !e.repeat) setSoundOn(!isSoundOn());
  }

  private primary() {
    const event = primaryEvent(this.machine);
    if (event) this.act(event);
  }
}
