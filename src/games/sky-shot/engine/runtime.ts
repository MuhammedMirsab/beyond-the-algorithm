/**
 * Runs Sky Shot: one requestAnimationFrame loop that
 *   1. runs hand tracking whenever the camera has a new frame,
 *   2. steps the game on a fixed 120 Hz clock,
 *   3. draws the 320 x 180 world (scaled up crisp by CSS) and, on a second
 *      full-resolution canvas, the yellow laser dot that shows where the
 *      hand points.
 * The mouse (and Space) work too, for staff and when no camera is present.
 */
import { HandAim, pickHand, type Landmark, type Point } from "./aim";
import { Sfx } from "./audio";
import { HandTracker } from "./tracker";
import { H, W } from "./sprites";
import { World, type RunSummary, type WorldEvents } from "./world";

export type { RunSummary };

export type CameraStatus = "starting" | "loading-model" | "ready" | "no-camera" | "no-tracking";

export interface RuntimeStatus {
  camera: CameraStatus;
  /** A hand is being tracked right now. */
  hand: boolean;
  delegate?: "GPU" | "CPU";
}

const STEP = 1 / 120;
/** Hand counts as present this long after the last detection. */
const HAND_GRACE_MS = 350;

export class Runtime {
  readonly world: World;
  private readonly sfx = new Sfx();
  private readonly aimer = new HandAim();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly octx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private disposed = false;

  private stream: MediaStream | null = null;
  private tracker: HandTracker | null = null;
  private lastVideoTime = -1;

  /** Shown dot (smoothed per render frame) and its target. */
  private dot: Point = { x: 0.5, y: 0.45 };
  private target: Point = { x: 0.5, y: 0.45 };
  private handSeenAt = -1e9;
  private mouseSeenAt = -1e9;
  private prevTip: Point | null = null;
  private cock = 1;
  private rings: { x: number; y: number; t: number; hit: boolean }[] = [];
  private status: RuntimeStatus = { camera: "starting", hand: false };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly overlay: HTMLCanvasElement,
    private readonly video: HTMLVideoElement,
    private readonly onStatus: (s: RuntimeStatus) => void,
    readonly bestKeyRead: () => number,
    private readonly bestKeyWrite: (n: number) => void,
    events: WorldEvents = {},
  ) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false });
    const octx = overlay.getContext("2d");
    if (!ctx || !octx) throw new Error("Canvas unavailable");
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.octx = octx;
    this.world = new World(this.sfx, {
      ...events,
      onGameOver: (run) => {
        if (run.score > this.bestKeyRead()) this.bestKeyWrite(run.score);
        events.onGameOver?.(run);
      },
    });
    this.world.best = bestKeyRead();

    overlay.addEventListener("pointermove", this.onPointerMove);
    overlay.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("keydown", this.onKey);
    this.raf = requestAnimationFrame(this.frame);
    void this.startCamera();
  }

  /* ── Camera and tracking ──────────────────────────────────────────── */

  private async startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60, max: 60 } },
      });
      if (this.disposed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.video.srcObject = stream;
      this.video.muted = true;
      this.video.playsInline = true;
      await this.video.play().catch(() => {});
    } catch (err) {
      console.warn("[sky-shot] camera unavailable", err);
      this.setStatus({ camera: "no-camera" });
      return;
    }
    this.setStatus({ camera: "loading-model" });
    try {
      const tracker = await HandTracker.create();
      if (this.disposed) {
        tracker.close();
        return;
      }
      this.tracker = tracker;
      this.setStatus({ camera: "ready", delegate: tracker.delegate });
    } catch (err) {
      console.warn("[sky-shot] hand tracking unavailable", err);
      this.setStatus({ camera: "no-tracking" });
    }
  }

  private setStatus(patch: Partial<RuntimeStatus>) {
    const next = { ...this.status, ...patch };
    if (next.camera === this.status.camera && next.hand === this.status.hand && next.delegate === this.status.delegate) return;
    this.status = next;
    this.onStatus(next);
  }

  private track(now: number) {
    const v = this.video;
    if (!this.tracker || v.readyState < 2 || v.videoWidth === 0) return;
    if (v.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = v.currentTime;
    let hands: Landmark[][];
    try {
      hands = this.tracker.detect(v, now);
    } catch (err) {
      console.warn("[sky-shot] detect failed", err);
      return;
    }
    const hand = pickHand(hands, this.prevTip);
    if (!hand) return;
    this.prevTip = { x: hand[8].x, y: hand[8].y };
    const reading = this.aimer.update(hand, now, v.videoWidth / v.videoHeight);
    this.handSeenAt = now;
    this.target = reading.aim;
    this.cock = reading.cock;
    if (reading.fired) this.shoot(reading.shotAt);
  }

  /* ── Input ────────────────────────────────────────────────────────── */

  /** "hand" while a hand is tracked, else "mouse": for analytics. */
  inputMode(): "hand" | "mouse" {
    return this.handActive(performance.now()) ? "hand" : "mouse";
  }

  private handActive(now: number) {
    return now - this.handSeenAt < HAND_GRACE_MS;
  }

  private onPointerMove = (e: PointerEvent) => {
    const now = performance.now();
    if (this.handActive(now)) return;
    const r = this.overlay.getBoundingClientRect();
    this.target = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    this.dot = this.target;
    this.mouseSeenAt = now;
  };

  private onPointerDown = (e: PointerEvent) => {
    this.sfx.unlock();
    const r = this.overlay.getBoundingClientRect();
    const p = this.handActive(performance.now()) ? this.dot : { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    this.mouseSeenAt = performance.now();
    this.shoot(p);
  };

  private onKey = (e: KeyboardEvent) => {
    this.sfx.unlock();
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === "Space" || e.key === "Enter") {
      e.preventDefault();
      this.shoot(this.dot);
    }
  };

  private shoot(p: Point) {
    this.sfx.unlock();
    const hit = this.world.fire(p.x * W, p.y * H);
    this.rings.push({ x: p.x, y: p.y, t: 0, hit });
  }

  /* ── Loop ─────────────────────────────────────────────────────────── */

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;

    this.track(now);
    const handOn = this.handActive(now);
    if (handOn !== this.status.hand) this.setStatus({ hand: handOn });

    this.acc += dt;
    while (this.acc >= STEP) {
      this.world.update(STEP);
      this.acc -= STEP;
    }
    this.world.render(this.ctx);

    // The dot eases toward the latest reading so 30 fps tracking still glides at 60 fps.
    const k = 1 - Math.exp(-dt * 28);
    this.dot = { x: this.dot.x + (this.target.x - this.dot.x) * k, y: this.dot.y + (this.target.y - this.dot.y) * k };
    this.drawOverlay(now, dt, handOn);
  };

  private drawOverlay(now: number, dt: number, handOn: boolean) {
    const o = this.overlay;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(o.clientWidth * dpr);
    const ch = Math.round(o.clientHeight * dpr);
    if (o.width !== cw || o.height !== ch) {
      o.width = cw;
      o.height = ch;
    }
    const c = this.octx;
    c.clearRect(0, 0, cw, ch);

    const unit = cw / W; // one game pixel on screen
    for (const r of this.rings) {
      r.t += dt;
      const a = 1 - r.t / 0.35;
      if (a <= 0) continue;
      c.strokeStyle = r.hit ? `rgba(255, 255, 255, ${a})` : `rgba(255, 214, 10, ${a})`;
      c.lineWidth = unit * 0.8;
      c.beginPath();
      c.arc(r.x * cw, r.y * ch, unit * (3 + r.t * 40), 0, Math.PI * 2);
      c.stroke();
    }
    this.rings = this.rings.filter((r) => r.t < 0.35);

    const mouseOn = now - this.mouseSeenAt < 4000;
    if (!handOn && !mouseOn) return;
    const x = this.dot.x * cw;
    const y = this.dot.y * ch;
    const r = unit * 2.4;

    // Laser glow.
    const glow = c.createRadialGradient(x, y, 0, x, y, r * 4);
    glow.addColorStop(0, "rgba(255, 220, 40, 0.55)");
    glow.addColorStop(0.35, "rgba(255, 200, 0, 0.22)");
    glow.addColorStop(1, "rgba(255, 190, 0, 0)");
    c.fillStyle = glow;
    c.beginPath();
    c.arc(x, y, r * 4, 0, Math.PI * 2);
    c.fill();

    // Cross ticks open up while the thumb is cocked, close as it drops.
    const gap = r * (1.4 + (handOn ? this.cock : 1) * 1.2);
    c.strokeStyle = "rgba(20, 16, 10, 0.75)";
    c.lineWidth = unit * 1.4;
    this.ticks(c, x, y, gap, r * 1.6);
    c.strokeStyle = "#ffd60a";
    c.lineWidth = unit * 0.7;
    this.ticks(c, x, y, gap, r * 1.6);

    // Core dot.
    c.fillStyle = "rgba(20, 16, 10, 0.8)";
    c.beginPath();
    c.arc(x, y, r * 0.95, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#ffd60a";
    c.beginPath();
    c.arc(x, y, r * 0.7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fff8cc";
    c.beginPath();
    c.arc(x - r * 0.18, y - r * 0.18, r * 0.28, 0, Math.PI * 2);
    c.fill();
  }

  private ticks(c: CanvasRenderingContext2D, x: number, y: number, gap: number, len: number) {
    c.beginPath();
    c.moveTo(x - gap - len, y);
    c.lineTo(x - gap, y);
    c.moveTo(x + gap, y);
    c.lineTo(x + gap + len, y);
    c.moveTo(x, y - gap - len);
    c.lineTo(x, y - gap);
    c.moveTo(x, y + gap);
    c.lineTo(x, y + gap + len);
    c.stroke();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.overlay.removeEventListener("pointermove", this.onPointerMove);
    this.overlay.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("keydown", this.onKey);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
    this.tracker?.close();
    this.tracker = null;
    this.sfx.close();
  }
}
