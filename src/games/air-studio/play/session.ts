import { backing, BACKING_STYLES, styleById } from "../engine/audio/backing";
import { engine } from "../engine/audio/engine";
import { PIECE_LABEL } from "../engine/audio/instruments/drums";
import { TAKE_CAP_S, TakeRecorder, type TakeResult } from "../engine/audio/recorder";
import { TakePlayer } from "../engine/audio/take-player";
import { MAX_BPM, MIN_BPM, transport } from "../engine/audio/transport";
import { playBus, type PlayEvent } from "../engine/events";
import { drawHands, type Controller } from "../engine/instruments/common";
import { createController, instrumentInfo } from "../engine/instruments/index";
import { C, input, rgba, rr } from "../engine/instruments/palette";
import { noteName } from "../engine/music";
import { LessonJudge, type Feedback } from "../engine/practice/judge";
import { LESSONS, type Lesson } from "../engine/practice/lessons";
import { freeReport, practiceReport, WINDOWS, type PerformanceReport, type TimingLevel } from "../engine/practice/scoring";
import { applyPatch, CAMERA_LATENCY_MS, settings, type InstrumentId, type Settings, type SettingsPatch } from "../engine/settings";
import { REF_SIZE, type TraceSample, type TrackFrame } from "../engine/tracking/hands";
import { resetViewport, strikeThreshold } from "../engine/tracking/reach";
import { tracker, type TrackerState } from "../engine/tracking/tracker";
import { HandCheck, type ReachState } from "./hand-check";

export type InputMode = "camera" | "mouse";

/** Where the visitor is, after the intro. */
export type View = "camera" | "check" | "pick" | "play" | "lessons" | "lesson" | "result";

/** "click" or a backing style id. */
export type PlayAlongChoice = string;

export interface TakeInfo {
  id: number;
  duration: number;
  events: number;
  report: PerformanceReport;
  /** Recorded to a beat: loops on whole bars, and has a timing score. */
  gridded: boolean;
  instruments: InstrumentId[];
}

export interface LessonRun {
  lesson: Lesson;
  level: TimingLevel;
  bpm: number;
}

export interface LessonResult {
  lesson: Lesson;
  level: TimingLevel;
  report: PerformanceReport;
  /** Best score this visitor has on this lesson (including this run). */
  best: number;
  /** This run beat an earlier one. */
  improved: boolean;
  /** What the visitor did, for the reveal under the result. */
  story: Story;
}

export interface SessionStats {
  /** Notes, hits and strums played this visit. */
  events: number;
  /** Fastest hit or strum, in hand lengths per second. */
  fastest: number | null;
  instruments: InstrumentId[];
  /** Hand model frames per second, averaged while the camera ran. */
  fps: number | null;
  /** The most recent lesson's report, for the reveal. */
  lesson: PerformanceReport | null;
  /** The 21 points of a hand the camera saw recently (mirrored, 0 to 1), for the reveal. */
  hand: { x: number; y: number }[] | null;
}

/** What the visitor did, captured for "How the AI did it". */
export interface Story {
  mode: InputMode | null;
  stats: SessionStats;
  /** Where the hand model ran: "GPU" or "CPU" (null without the camera). */
  delegate: string | null;
  /** The last few seconds of a fingertip's height, raw and smoothed (camera only). */
  trace: TraceSample[];
  /** Camera picture width / height, to draw the hand in its true shape. */
  aspect: number;
}

export type Problem = { kind: "audio" } | { kind: "instrument"; id: InstrumentId } | null;

export interface StudioView {
  mode: InputMode | null;
  view: View;
  tracker: TrackerState;
  instrument: InstrumentId | null;
  loading: { id: InstrumentId; progress: number } | null;
  /** Something failed to start: audio or an instrument. */
  problem: Problem;
  check: { both: number; reach: ReachState };
  playAlong: { choice: PlayAlongChoice; bpm: number; running: boolean; starting: boolean };
  rec: { state: "idle" | "waiting" | "recording" | "saving"; error: string | null };
  take: TakeInfo | null;
  takeMode: "off" | "listen" | "loop";
  /** Bumped when a take finishes recording, so the screen can show it. */
  takeShown: number;
  lesson: LessonRun | null;
  feedback: Feedback | null;
  progress: { hits: number; judged: number; total: number } | null;
  /** Beats left in a count-in (lesson or recording), else null. */
  countIn: number | null;
  result: LessonResult | null;
  bests: Record<string, number>;
}

/** Play along starts on the pop band, at its own tempo. */
const DEFAULT_PLAY_ALONG = "pop";

const INITIAL: StudioView = {
  mode: null,
  view: "camera",
  tracker: { status: "off" },
  instrument: null,
  loading: null,
  problem: null,
  check: { both: 0, reach: { status: "idle" } },
  playAlong: { choice: DEFAULT_PLAY_ALONG, bpm: styleById(DEFAULT_PLAY_ALONG).bpm, running: false, starting: false },
  rec: { state: "idle", error: null },
  take: null,
  takeMode: "off",
  takeShown: 0,
  lesson: null,
  feedback: null,
  progress: null,
  countIn: null,
  result: null,
  bests: {},
};

const EMPTY_STATS: SessionStats = { events: 0, fastest: null, instruments: [], fps: null, lesson: null, hand: null };

/** While measuring: how far the hands have gone. Afterwards: the reach box that will be used. */
function drawReach(g: CanvasRenderingContext2D, check: HandCheck, w: number, h: number) {
  const box = check.reach.status === "done" ? check.reach.box : check.reach.status === "measuring" ? check.extent : null;
  if (!box) return;
  g.strokeStyle = rgba(C.game, check.reach.status === "done" ? 1 : 0.85);
  g.lineWidth = 2;
  g.setLineDash(check.reach.status === "done" ? [] : [8, 6]);
  rr(g, box.x0 * w, box.y0 * h, (box.x1 - box.x0) * w, (box.y1 - box.y0) * h, 14);
  g.stroke();
  g.setLineDash([]);
}

const fallbackLabel = (k: string) => (k === "*" ? "Any pad" : (PIECE_LABEL[k] ?? (/^\d+$/.test(k) ? noteName(Number(k)) : k)));

/**
 * One visitor's studio: camera or simulated hands, the instrument, the audio
 * engine, Play along, the one take and the lessons. It runs outside React
 * and publishes a snapshot (useSyncExternalStore); per-frame work (gestures,
 * drawing) never touches React state.
 *
 * mount() and unmount() bracket the component's life and survive StrictMode.
 * reset() is Next player: camera off, audio closed, everything forgotten.
 */
export class StudioSession {
  private view: StudioView = INITIAL;
  private listeners = new Set<() => void>();
  private unsubs: (() => void)[] = [];
  private controller: Controller | null = null;
  private loadToken = 0;
  private recorder: TakeRecorder | null = null;
  private recMeta: { bpm: number; gridded: boolean; barLength: number | null; latencyMs: number } | null = null;
  private take: { info: TakeInfo; result: TakeResult; player: TakePlayer } | null = null;
  private takeCount = 0;
  private check: HandCheck | null = null;
  private judge: LessonJudge | null = null;
  private lessonToken = 0;
  /** The visitor's own values for everything a lesson changed, restored when practice ends. */
  private saved: SettingsPatch = {};
  private statsValue: SessionStats = EMPTY_STATS;
  private fpsAvg: number | null = null;
  private lastFpsSample = 0;
  private lastHandCopy = 0;

  /* ── React bindings ────────────────────────────────────────────── */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.view;

  getServerSnapshot = () => INITIAL;

  private set(patch: Partial<StudioView>) {
    const was = this.view.view;
    this.view = { ...this.view, ...patch };
    const now = this.view.view;
    // Leaving the instrument (picker, lessons, results): let go of held notes.
    if ((was === "play" || was === "lesson") && now !== "play" && now !== "lesson") this.controller?.panic();
    this.listeners.forEach((fn) => fn());
  }

  get stats(): SessionStats {
    return { ...this.statsValue, fps: this.fpsAvg === null ? null : Math.round(this.fpsAvg) };
  }

  /** A snapshot of what this visitor did, for the reveal. */
  story(): Story {
    const state = tracker.state;
    return {
      mode: this.view.mode,
      stats: this.stats,
      delegate: state.status === "running" ? state.delegate : null,
      trace: this.view.mode === "camera" ? tracker.trace() : [],
      aspect: tracker.aspect,
    };
  }

  /** Dismiss a problem notice; without an instrument, back to the picker. */
  clearProblem = () => {
    this.set({ problem: null, view: this.view.instrument ? this.view.view : "pick" });
  };

  /** The current instrument's controller, for readouts. */
  get instrumentController() {
    return this.controller;
  }

  /* ── Lifetime ──────────────────────────────────────────────────── */

  mount() {
    if (this.unsubs.length) return;
    backing.select(DEFAULT_PLAY_ALONG);
    this.unsubs.push(
      tracker.onState(this.onTrackerState),
      tracker.onFrame(this.onFrame),
      playBus.play(this.onPlay),
    );
  }

  unmount() {
    this.reset();
    this.unsubs.forEach((fn) => fn());
    this.unsubs = [];
  }

  /** Next player: stop the camera and the sound, forget this visitor. */
  reset() {
    this.loadToken++;
    this.lessonToken++;
    this.recorder?.cancel();
    this.recorder = null;
    this.recMeta = null;
    this.take?.player.stop();
    this.take = null;
    transport.stop();
    backing.reset();
    this.judge = null;
    this.controller?.dispose();
    this.controller = null;
    this.check = null;
    tracker.stop();
    engine.close();
    settings.reset();
    backing.select(DEFAULT_PLAY_ALONG);
    resetViewport();
    this.saved = {};
    this.statsValue = EMPTY_STATS;
    this.fpsAvg = null;
    this.view = INITIAL;
    this.listeners.forEach((fn) => fn());
  }

  /* ── Input ─────────────────────────────────────────────────────── */

  /** From a click: start the audio (browsers allow it only after a click), then ask for the camera. */
  chooseCamera = () => {
    this.startAudio();
    this.check = null;
    input.mouse = false;
    this.set({ mode: "camera", view: "camera", problem: null });
    void tracker.start();
  };

  /** From a click: simulated hands (mouse is the right hand). */
  chooseMouse = () => {
    this.startAudio();
    this.check = null;
    tracker.startSim();
    input.mouse = true;
    settings.update("tracking", { latencyMs: 0 });
    this.set({ mode: "mouse", view: this.view.instrument ? "play" : "pick", problem: null });
  };

  private startAudio() {
    engine.ensure().catch((err: unknown) => {
      console.error("[air-studio] audio failed to start", err);
      if (engine.ctx === null) this.set({ problem: { kind: "audio" } });
    });
  }

  private onTrackerState = () => {
    const state = tracker.state;
    const patch: Partial<StudioView> = { tracker: state };
    if (state.status === "running" && this.view.view === "camera") {
      settings.update("tracking", { latencyMs: CAMERA_LATENCY_MS });
      patch.view = this.view.instrument ? "play" : "check";
      if (!this.view.instrument) {
        this.check = new HandCheck();
        patch.check = { both: 0, reach: { status: "idle" } };
      }
    }
    if (state.status === "error" && this.view.mode === "camera") {
      // Back to the camera screen to say what happened; the instrument stays loaded.
      if (this.view.lesson || this.view.view === "lessons" || this.view.view === "result") Object.assign(patch, this.endPractice());
      patch.view = "camera";
    }
    this.set(patch);
  };

  /* ── Frames ────────────────────────────────────────────────────── */

  private onFrame = (f: TrackFrame) => {
    const v = this.view.view;
    if (v === "play" || v === "lesson") this.controller?.update(f, f.time);
    // Keep a recent camera hand for the reveal: 21 pairs of numbers, never a picture.
    if (f.hands.length && tracker.state.status === "running" && f.time - this.lastHandCopy > 250) {
      this.lastHandCopy = f.time;
      const h = f.Right ?? f.hands[0];
      if (h.lm.length === 21) this.statsValue = { ...this.statsValue, hand: h.lm.map((p) => ({ x: p.x, y: p.y })) };
    }
    const check = this.check;
    if (check && this.view.view === "check") {
      const box = check.onFrame(f);
      if (box) settings.update("tracking", { reach: box });
      const both = Math.round(check.bothProgress * 20) / 20;
      if (both !== this.view.check.both || check.reach !== this.view.check.reach) this.set({ check: { both, reach: check.reach } });
    }
  };

  private onPlay = (e: PlayEvent) => {
    const s = this.statsValue;
    const handLengths = e.speed !== undefined ? e.speed / REF_SIZE : null;
    this.statsValue = {
      ...s,
      events: s.events + 1,
      fastest: handLengths !== null ? Math.max(s.fastest ?? 0, handLengths) : s.fastest,
      instruments: s.instruments.includes(e.inst) ? s.instruments : [...s.instruments, e.inst],
    };
    const j = this.judge;
    const run = this.view.lesson;
    if (j && run && this.view.view === "lesson" && e.inst === run.lesson.inst) {
      const feedback = j.onEvent(e);
      this.set({ feedback, progress: { hits: j.hits, judged: j.targets.filter((t) => t.verdict).length, total: j.targets.length } });
    }
  };

  /** Draws the instrument, the hands and any check overlay into the stage canvas (frame coordinates). */
  draw(g: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const v = this.view.view;
    if (this.controller && (v === "play" || v === "lesson")) this.controller.draw(g, w, h, now);
    if (v === "check" && this.check) drawReach(g, this.check, w, h);
    const f = tracker.frame;
    if (now - f.time < 300) {
      const point = this.view.instrument && v !== "check" ? instrumentInfo(this.view.instrument).point : "palm";
      drawHands(g, f, w, h, { point });
    }
  }

  /** Once per animation frame, from the stage. */
  tick(now: number) {
    const ctxNow = engine.now;
    // Average the hand model's frame rate while the camera runs.
    if (tracker.state.status === "running" && now - this.lastFpsSample > 1000) {
      this.lastFpsSample = now;
      const fps = tracker.metrics.fps;
      if (fps > 0) this.fpsAvg = this.fpsAvg === null ? fps : this.fpsAvg * 0.8 + fps * 0.2;
    }
    // Recording: the count-in, then the cap.
    const r = this.recorder;
    if (r && r.state === "recording") {
      if (this.view.rec.state === "waiting" && ctxNow >= r.startedAt) this.set({ rec: { state: "recording", error: null }, countIn: null });
      else if (this.view.rec.state === "waiting") {
        const left = Math.max(1, Math.ceil((r.startedAt - ctxNow) / transport.beatDur));
        if (left !== this.view.countIn) this.set({ countIn: left });
      }
      if (r.elapsed() >= TAKE_CAP_S) void this.stopRecording();
    }
    // Lesson: count-in, misses, targets, the end.
    const j = this.judge;
    const run = this.view.lesson;
    if (j && run && this.view.view === "lesson") {
      const pos = transport.position(ctxNow);
      const countIn = transport.running && pos.countIn ? transport.sig.beatsPerBar - pos.beatInBar : null;
      if (countIn !== this.view.countIn) this.set({ countIn });
      const missed = j.tick(ctxNow);
      if (missed.length) {
        const last = missed[missed.length - 1];
        this.set({
          feedback: { verdict: "miss", label: this.labelOf(last.key), at: now },
          progress: { hits: j.hits, judged: j.targets.filter((t) => t.verdict).length, total: j.targets.length },
        });
      }
      const next = j.next();
      this.controller?.setTargets(run.lesson.anyKey ? [] : next.filter((t) => t.time - ctxNow < (60 / run.bpm) * 2).map((t) => t.key));
      if (ctxNow > j.endTime + 0.4) this.finishLesson();
    }
  }

  /** A target or event key by name ("C4", "Snare"). */
  labelOf = (k: string) => (k === "*" ? "Any pad" : (this.controller?.label(k) ?? fallbackLabel(k)));

  /** Seconds recorded so far, for the dock's clock (null when not recording). */
  recordingElapsed(): number | null {
    const r = this.recorder;
    if (!r || r.state !== "recording") return null;
    return Math.max(0, r.elapsed());
  }

  /** The lesson's judge, for drawing the timeline. */
  get lessonJudge() {
    return this.judge;
  }

  takePosition(): number | null {
    return this.take?.player.position() ?? null;
  }

  /* ── The hand check ────────────────────────────────────────────── */

  measureReach = () => {
    if (!this.check) this.check = new HandCheck();
    this.check.startReach(performance.now());
    this.set({ check: { both: this.view.check.both, reach: this.check.reach } });
  };

  finishCheck = () => {
    this.check = null;
    this.set({ view: this.view.instrument ? "play" : "pick" });
  };

  /* ── Instruments ───────────────────────────────────────────────── */

  /** Resolves true once the instrument is playing. */
  pickInstrument = async (id: InstrumentId): Promise<boolean> => {
    const ok = await this.loadInstrument(id);
    if (ok && (this.view.view === "pick" || this.view.view === "play")) this.set({ view: "play" });
    return ok;
  };

  /** Resolves true when the instrument is ready to play. */
  private async loadInstrument(id: InstrumentId): Promise<boolean> {
    const token = ++this.loadToken;
    this.set({ loading: { id, progress: 0 }, problem: null });
    try {
      await engine.ensure();
    } catch {
      if (token === this.loadToken) this.set({ loading: null, problem: { kind: "audio" } });
      return false;
    }
    if (token !== this.loadToken) return false;
    // The current instrument keeps playing until the new one is ready.
    let c: Controller | null = null;
    try {
      c = createController(id);
      await c.load((progress) => {
        if (token === this.loadToken) this.set({ loading: { id, progress } });
      });
    } catch (err) {
      console.error("[air-studio] instrument failed to load", err);
      c?.dispose();
      if (token === this.loadToken) this.set({ loading: null, problem: { kind: "instrument", id } });
      return false;
    }
    if (token !== this.loadToken) {
      c.dispose();
      return false;
    }
    this.controller?.dispose();
    this.controller = c;
    const s = settings.get()[id];
    engine.setInstrumentFx(s.fx);
    engine.setInstrumentVolume(s.volume);
    this.set({ instrument: id, loading: null });
    return true;
  }

  /* ── Play along: the click or a band ───────────────────────────── */

  choosePlayAlong = (choice: PlayAlongChoice) => {
    if (choice !== "click") backing.select(choice);
    else settings.update("metronome", { sig: "4/4" });
    const running = this.view.playAlong.running;
    this.set({ playAlong: { ...this.view.playAlong, choice, bpm: settings.get().metronome.bpm } });
    if (running) void this.startPlayAlong();
  };

  setTempo = (bpm: number) => {
    const next = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
    settings.update("metronome", { bpm: next });
    this.set({ playAlong: { ...this.view.playAlong, bpm: next } });
  };

  startPlayAlong = async () => {
    const { choice } = this.view.playAlong;
    this.set({ playAlong: { ...this.view.playAlong, starting: true } });
    this.stopTake();
    try {
      await engine.ensure();
      backing.detach();
      if (choice !== "click") {
        if (backing.style.id !== choice) backing.select(choice);
        await backing.attach();
      }
      await transport.start(0, choice === "click");
      this.set({ playAlong: { ...this.view.playAlong, running: true, starting: false, bpm: transport.bpm } });
    } catch (err) {
      console.error("[air-studio] play along failed", err);
      backing.detach();
      transport.stop();
      this.set({ playAlong: { ...this.view.playAlong, running: false, starting: false } });
    }
  };

  stopPlayAlong = () => {
    transport.stop();
    backing.detach();
    this.set({ playAlong: { ...this.view.playAlong, running: false, starting: false } });
  };

  /* ── The take ──────────────────────────────────────────────────── */

  record = async () => {
    if (this.view.rec.state !== "idle") return;
    try {
      await engine.ensure();
    } catch {
      this.set({ rec: { state: "idle", error: "Sound didn't start, so there's nothing to record." } });
      return;
    }
    if (!engine.capture) {
      this.set({ rec: { state: "idle", error: "This browser can't record. Try the latest Chrome or Edge." } });
      return;
    }
    this.stopTake();
    let zero: number;
    const gridded = transport.running;
    if (gridded) {
      // Start on the next bar line, so the take lines up with the beat.
      const cur = transport.stepAt(engine.now + 0.05);
      const nextBar = Math.ceil(cur / transport.stepsPerBar) * transport.stepsPerBar;
      zero = transport.stepTime(nextBar);
    } else {
      zero = engine.now + 0.03;
    }
    this.recMeta = {
      bpm: transport.bpm,
      gridded,
      barLength: gridded ? transport.stepsPerBar * transport.stepDur : null,
      latencyMs: settings.get().tracking.latencyMs,
    };
    const r = new TakeRecorder();
    try {
      r.start(zero);
    } catch (err) {
      this.set({ rec: { state: "idle", error: err instanceof Error ? err.message : "Recording didn't start." } });
      return;
    }
    this.recorder = r;
    const waiting = zero > engine.now + 0.06;
    this.set({ rec: { state: waiting ? "waiting" : "recording", error: null } });
  };

  stopRecording = async () => {
    const r = this.recorder;
    const meta = this.recMeta;
    if (!r || !meta || this.view.rec.state === "saving") return;
    if (engine.now < r.startedAt) {
      // Stopped during the count-in: nothing was recorded.
      r.cancel();
      this.recorder = null;
      this.set({ rec: { state: "idle", error: null }, countIn: null });
      return;
    }
    this.set({ rec: { state: "saving", error: null }, countIn: null });
    let result: TakeResult;
    try {
      result = await r.stop();
    } catch {
      if (this.recorder === r) this.recorder = null;
      this.set({ rec: { state: "idle", error: "The take was lost when the sound stopped." } });
      return;
    }
    if (this.recorder !== r) return; // Next player happened meanwhile.
    this.recorder = null;
    this.takeCount++;
    const report = freeReport({
      title: "Your take",
      events: result.events,
      duration: result.duration,
      bpm: meta.bpm,
      gridDefined: meta.gridded,
      latencyMs: meta.latencyMs,
    });
    const instruments = [...new Set(result.events.map((e) => e.inst))];
    const info: TakeInfo = { id: this.takeCount, duration: result.duration, events: result.events.length, report, gridded: meta.gridded, instruments };
    const player = new TakePlayer(result, meta.barLength);
    player.onEnded = () => this.set({ takeMode: "off" });
    this.take = { info, result, player };
    this.set({ rec: { state: "idle", error: null }, take: info, takeMode: "off", takeShown: this.takeCount });
  };

  /** Listen to the take once, or loop it to play along with it. */
  playTake = async (mode: "listen" | "loop") => {
    const t = this.take;
    if (!t) return;
    // The take already holds the band if one played: a live one would clash.
    if (this.view.playAlong.running) this.stopPlayAlong();
    await t.player.play(mode);
    this.set({ takeMode: mode });
  };

  stopTake = () => {
    this.take?.player.stop();
    if (this.view.takeMode !== "off") this.set({ takeMode: "off" });
  };

  /** How the take loops when played along with: its length, and whole bars when it was recorded to a beat. */
  get takeLoop(): { seconds: number; bars: number | null } | null {
    const p = this.take?.player;
    return p ? { seconds: p.loopLength, bars: p.loopBars } : null;
  }

  /* ── Practice ──────────────────────────────────────────────────── */

  openLessons = () => {
    this.stopLessonRun();
    this.set({ view: "lessons", result: null, feedback: null, progress: null, countIn: null });
  };

  startLesson = async (id: string, level: TimingLevel) => {
    const lesson = LESSONS.find((l) => l.id === id);
    if (!lesson) return;
    const token = ++this.lessonToken;
    this.stopLessonRun();
    this.stopTake();
    if (this.view.playAlong.running) this.stopPlayAlong();
    if (this.recorder) await this.stopRecording();
    this.remember(lesson.patch ?? {});
    if (lesson.patch) applyPatch(lesson.patch);
    if (this.view.instrument !== lesson.inst || !this.controller) {
      const ok = await this.loadInstrument(lesson.inst);
      if (!ok || token !== this.lessonToken) return;
    }
    const bpm = Math.round(lesson.bpm * WINDOWS[level].tempo);
    this.remember({ metronome: { bpm: settings.get().metronome.bpm, sig: settings.get().metronome.sig } });
    settings.update("metronome", { bpm, sig: lesson.sig });
    let zero: number;
    try {
      zero = await transport.start(1, true);
    } catch {
      if (token === this.lessonToken) this.set({ problem: { kind: "audio" } });
      return;
    }
    if (token !== this.lessonToken) {
      transport.stop();
      return;
    }
    this.judge = new LessonJudge(lesson, level, zero, 60 / bpm, settings.get().tracking.latencyMs / 1000, this.labelOf);
    this.set({
      view: "lesson",
      lesson: { lesson, level, bpm },
      feedback: null,
      progress: { hits: 0, judged: 0, total: lesson.targets.length },
      countIn: null,
      result: null,
    });
  };

  /** Stop the lesson early: back to the list, no score. */
  stopLesson = () => {
    this.lessonToken++;
    this.stopLessonRun();
    this.set({ view: "lessons", feedback: null, progress: null, countIn: null });
  };

  private stopLessonRun() {
    if (!this.judge) return;
    this.judge = null;
    transport.stop();
    this.controller?.setTargets([]);
  }

  private finishLesson() {
    const j = this.judge;
    const run = this.view.lesson;
    if (!j || !run) return;
    this.judge = null;
    transport.stop();
    this.controller?.setTargets([]);
    j.tick(Infinity);
    const report = practiceReport({
      lessonId: run.lesson.id,
      title: run.lesson.title,
      level: run.level,
      judged: j.targets,
      extras: j.extras,
      wrongPairs: j.wrongPairs,
      duration: Math.max(0, engine.now - transport.zeroTime),
      events: j.events,
      labelOf: this.labelOf,
      bpm: run.bpm,
      sensitivity: settings.get().tracking.sensitivity,
    });
    const overall = report.overall ?? 0;
    const before = this.view.bests[run.lesson.id];
    const best = Math.max(before ?? 0, overall);
    this.statsValue = { ...this.statsValue, lesson: report };
    this.set({
      view: "result",
      result: { lesson: run.lesson, level: run.level, report, best, improved: before !== undefined && overall > before, story: this.story() },
      bests: { ...this.view.bests, [run.lesson.id]: best },
      countIn: null,
    });
  }

  /** Back to free play: the visitor's own settings come back. */
  leavePractice = () => {
    this.set({ ...this.endPractice(), view: this.controller ? "play" : "pick" });
  };

  /** Ends any lesson and puts the visitor's settings back. Returns the view changes. */
  private endPractice(): Partial<StudioView> {
    this.lessonToken++;
    this.stopLessonRun();
    applyPatch(this.saved);
    this.saved = {};
    return {
      lesson: null,
      feedback: null,
      progress: null,
      countIn: null,
      result: null,
      playAlong: { ...this.view.playAlong, bpm: settings.get().metronome.bpm },
    };
  }

  private remember(patch: SettingsPatch) {
    const current = settings.get();
    const keep = <K extends keyof Settings>(key: K) => {
      const values = patch[key];
      if (!values) return;
      const saved: Partial<Settings[K]> = { ...(this.saved[key] ?? {}) };
      for (const name of Object.keys(values) as (keyof Settings[K])[]) {
        if (!(name in saved)) saved[name] = current[key][name];
      }
      this.saved = { ...this.saved, [key]: saved };
    };
    for (const key of Object.keys(patch) as (keyof Settings)[]) keep(key);
  }

  /* ── Small helpers for the screens ─────────────────────────────── */

  /** The strike speed the current sensitivity needs, in hand lengths per second. */
  get strikeSpeedNeeded() {
    return strikeThreshold() / REF_SIZE;
  }

  get playAlongStyles() {
    return BACKING_STYLES;
  }

  styleFor(choice: PlayAlongChoice) {
    return choice === "click" ? null : styleById(choice);
  }
}
