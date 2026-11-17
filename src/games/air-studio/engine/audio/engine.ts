import { isSoundOn, subscribeSound } from "@/lib/sound";
import { settings, type FxSettings } from "../settings";
import { CAPTURE_PROCESSOR, CAPTURE_WORKLET_SOURCE } from "./capture-worklet";
import { FxChain } from "./fx";
import { setDecodeContext } from "./samples";

export type AudioStatus = "off" | "suspended" | "running" | "error";

/**
 * The audio graph, copied from the original app:
 *
 *   instrument -> instFx -> instBus ─┬─> master -> limiter -> speakers
 *                                    └─> recordTap -> capture worklet
 *   backing -> backingFx -> backingBus -> master (and recordTap)
 *   metronome -> metroBus -> master        (never recorded)
 *   your take -> playbackBus -> master     (never recorded)
 *
 * The context is created on the first click (autoplay rules) and closed on
 * Next player and when the game unmounts; ensure() builds a fresh one. The
 * arcade-wide sound switch mutes the master.
 */
class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  private limiter!: DynamicsCompressorNode;
  instBus!: GainNode;
  instFx!: FxChain;
  backingBus!: GainNode;
  backingFx!: FxChain;
  metroBus!: GainNode;
  playbackBus!: GainNode;
  private recordTap!: GainNode;
  private backingToRec!: GainNode;
  capture: AudioWorkletNode | null = null;
  status: AudioStatus = "off";
  private initP: Promise<AudioContext> | null = null;
  /** Bumped by close(), so an init that was still running gives up. */
  private generation = 0;
  private unsubs: (() => void)[] = [];

  /** Must run inside a click or key press the first time (autoplay rules). */
  ensure(): Promise<AudioContext> {
    if (this.ctx && this.initP) {
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
      return this.initP;
    }
    this.initP = this.init(++this.generation);
    return this.initP;
  }

  get ready() {
    return this.ctx !== null && this.ctx.state !== "closed" && this.instFx !== undefined && this.initP !== null;
  }

  private async init(generation: number): Promise<AudioContext> {
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ latencyHint: "interactive" });
    } catch (e) {
      this.status = "error";
      this.initP = null;
      throw e;
    }
    this.ctx = ctx;
    setDecodeContext(ctx);
    ctx.onstatechange = () => {
      if (this.ctx !== ctx) return;
      this.status = ctx.state === "running" ? "running" : ctx.state === "suspended" ? "suspended" : "off";
    };
    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 2;
    this.limiter.ratio.value = 16;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.master.connect(this.limiter).connect(ctx.destination);

    this.instFx = new FxChain(ctx);
    this.instBus = ctx.createGain();
    this.instFx.connect(this.instBus);
    this.instBus.connect(this.master);

    this.backingFx = new FxChain(ctx);
    this.backingFx.set({ reverb: 0.22, delay: 0, delayTime: 0.3, feedback: 0.2, chorus: 0.1 });
    this.backingBus = ctx.createGain();
    this.backingFx.connect(this.backingBus);
    this.backingBus.connect(this.master);

    this.metroBus = ctx.createGain();
    this.metroBus.connect(this.master);
    this.playbackBus = ctx.createGain();
    this.playbackBus.connect(this.master);

    this.recordTap = ctx.createGain();
    this.instBus.connect(this.recordTap);
    this.backingToRec = ctx.createGain();
    this.backingToRec.gain.value = 0;
    this.backingBus.connect(this.backingToRec).connect(this.recordTap);

    this.applyLevels(true);
    this.unsubs.push(
      settings.subscribe(() => this.applyLevels()),
      subscribeSound(() => this.applyLevels()),
    );

    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    try {
      const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET_SOURCE], { type: "application/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      if (generation !== this.generation) throw new Error("Audio was closed while it started.");
      this.capture = new AudioWorkletNode(ctx, CAPTURE_PROCESSOR, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 2,
        channelCountMode: "explicit",
      });
      const mute = ctx.createGain();
      mute.gain.value = 0;
      this.recordTap.connect(this.capture).connect(mute).connect(ctx.destination);
    } catch (e) {
      if (generation !== this.generation) throw e;
      // Everything but recording still works.
      console.error("[air-studio] recorder worklet unavailable", e);
      this.capture = null;
    }
    if (generation !== this.generation) throw new Error("Audio was closed while it started.");
    this.status = ctx.state === "running" ? "running" : "suspended";
    return ctx;
  }

  private applyLevels(immediate = false) {
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed") return;
    const s = settings.get();
    const t = ctx.currentTime;
    const set = (p: AudioParam, v: number, tc: number) => (immediate ? p.setValueAtTime(v, t) : p.setTargetAtTime(v, t, tc));
    set(this.master.gain, isSoundOn() ? s.audio.master : 0, 0.03);
    this.limiter.threshold.value = s.audio.limiter ? -3 : 0;
    this.limiter.ratio.value = s.audio.limiter ? 16 : 1;
    set(this.metroBus.gain, s.metronome.volume, 0.02);
    set(this.backingBus.gain, s.backing.volume, 0.03);
    set(this.backingToRec.gain, s.backing.includeInRecording ? 1 : 0, 0.01);
  }

  setInstrumentFx(fx: FxSettings) {
    if (this.ready) this.instFx.set(fx);
  }

  setInstrumentVolume(volume: number) {
    if (this.ready && this.ctx) this.instBus.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
  }

  get now() {
    return this.ctx?.currentTime ?? 0;
  }

  /** Estimated time from scheduling a sound to it leaving the speakers, seconds. */
  get outputLatency() {
    const c = this.ctx;
    if (!c) return 0;
    return (c.outputLatency || 0) + (c.baseLatency || 0);
  }

  /** Silences and closes the context. Everything built on it is gone; ensure() starts over. */
  close() {
    this.generation++;
    this.unsubs.forEach((fn) => fn());
    this.unsubs = [];
    const ctx = this.ctx;
    this.ctx = null;
    this.initP = null;
    this.capture = null;
    this.status = "off";
    setDecodeContext(null);
    if (ctx && ctx.state !== "closed") {
      try {
        this.master?.gain.setValueAtTime(0, ctx.currentTime);
      } catch {
        /* closing anyway */
      }
      void ctx.close().catch(() => {});
    }
  }
}

export const engine = new AudioEngine();
