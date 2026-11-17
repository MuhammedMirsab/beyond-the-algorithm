import { playBus, type PlayEvent } from "../events";
import { engine } from "./engine";

/** The longest take a visitor can record. */
export const TAKE_CAP_S = 30;

export interface TakeResult {
  channels: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>];
  sampleRate: number;
  duration: number;
  /** Every note, hit and strum, with `t` in seconds from the take's start. */
  events: PlayEvent[];
}

function isChannel(v: unknown): v is Float32Array<ArrayBuffer> {
  return v instanceof Float32Array;
}

/**
 * One take: PCM from the AudioWorklet tap plus every PlayEvent, both on the
 * AudioContext clock (copied from the original app). Kept in memory only and
 * capped at TAKE_CAP_S: the worklet is told when to stop at the start, so the
 * cap is sample-accurate.
 */
export class TakeRecorder {
  private chunksL: Float32Array<ArrayBuffer>[] = [];
  private chunksR: Float32Array<ArrayBuffer>[] = [];
  private events: PlayEvent[] = [];
  private openNotes = new Map<string, PlayEvent>();
  private unsub: (() => void)[] = [];
  private flushed: (() => void) | null = null;
  private endAt = Infinity;
  state: "idle" | "recording" | "stopped" = "idle";
  startedAt = 0;

  private onMsg = (e: MessageEvent) => {
    const m: unknown = e.data;
    if (typeof m !== "object" || m === null || !("type" in m)) return;
    if (m.type === "data" && "l" in m && "r" in m && isChannel(m.l) && isChannel(m.r)) {
      this.chunksL.push(m.l);
      this.chunksR.push(m.r);
    }
    if (m.type === "flushed") this.flushed?.();
  };

  /** Starts capturing at context time `at` (it may be in the future, e.g. the next bar). */
  start(at: number) {
    const cap = engine.capture;
    if (!cap) throw new Error("Recording isn't available in this browser.");
    cap.port.postMessage({ cmd: "reset" });
    cap.port.onmessage = this.onMsg;
    cap.port.postMessage({ cmd: "capture", on: true, at });
    this.endAt = at + TAKE_CAP_S;
    cap.port.postMessage({ cmd: "capture", on: false, at: this.endAt });
    this.startedAt = at;
    this.state = "recording";
    this.unsub.push(
      playBus.play((ev) => this.onEvent(ev)),
      playBus.release((r) => {
        const n = this.openNotes.get(r.id);
        if (n) {
          const end = this.map(r.t) ?? this.elapsed();
          n.dur = Math.max(0.03, end - n.t);
          this.openNotes.delete(r.id);
        }
      }),
    );
  }

  private onEvent(ev: PlayEvent) {
    if (this.state !== "recording") return;
    const t = this.map(ev.t);
    if (t === null) return;
    const copy: PlayEvent = { ...ev, t };
    this.events.push(copy);
    if (ev.id && ev.kind === "note") this.openNotes.set(ev.id, copy);
  }

  /** Context time to take time; null before the start or after the cap. */
  private map(ctxT: number): number | null {
    if (ctxT < this.startedAt - 0.005 || ctxT >= this.endAt) return null;
    return Math.max(0, ctxT - this.startedAt);
  }

  /** Seconds recorded so far (negative while waiting for the start). */
  elapsed(): number {
    return Math.min(TAKE_CAP_S, engine.now - this.startedAt);
  }

  get counting() {
    return this.state === "recording" && engine.now < this.startedAt;
  }

  async stop(): Promise<TakeResult> {
    const cap = engine.capture;
    const ctx = engine.ctx;
    if (!cap || !ctx) throw new Error("Audio stopped while recording.");
    const at = Math.min(engine.now, this.endAt);
    if (this.state === "recording") cap.port.postMessage({ cmd: "capture", on: false, at });
    this.state = "stopped";
    this.unsub.forEach((u) => u());
    this.unsub = [];
    // Wait one render quantum past `at`, then flush.
    await new Promise((r) => setTimeout(r, 60));
    await new Promise<void>((res) => {
      this.flushed = res;
      cap.port.postMessage({ cmd: "flush" });
      setTimeout(res, 1000);
    });
    this.flushed = null;
    cap.port.onmessage = null;
    const total = this.chunksL.reduce((a, c) => a + c.length, 0);
    const L = new Float32Array(new ArrayBuffer(total * 4));
    const R = new Float32Array(new ArrayBuffer(total * 4));
    let o = 0;
    for (let i = 0; i < this.chunksL.length; i++) {
      L.set(this.chunksL[i], o);
      R.set(this.chunksR[i], o);
      o += this.chunksL[i].length;
    }
    this.chunksL = [];
    this.chunksR = [];
    const sr = ctx.sampleRate;
    const duration = total / sr;
    // Close any held notes at the end of the take.
    this.openNotes.forEach((n) => {
      n.dur = Math.max(0.05, duration - n.t);
    });
    this.openNotes.clear();
    return { channels: [L, R], sampleRate: sr, duration, events: this.events.sort((a, b) => a.t - b.t) };
  }

  /** Drops the take (Next player, record again before it finished). */
  cancel() {
    this.unsub.forEach((u) => u());
    this.unsub = [];
    this.state = "stopped";
    const cap = engine.capture;
    if (cap) {
      cap.port.postMessage({ cmd: "reset" });
      cap.port.onmessage = null;
    }
    this.chunksL = [];
    this.chunksR = [];
    this.events = [];
  }
}
