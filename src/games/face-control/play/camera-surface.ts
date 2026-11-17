import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { ControlSnapshot } from "../engine/vision/face-controller";
import { FACE_OVAL, INNER_LIPS, LEFT_EYE, LM, RIGHT_EYE } from "../engine/vision/face-metrics";

/** Outline subset (face oval, eyes, lips) for small previews where 478 dots would blur together. */
const OUTLINE = [...FACE_OVAL, ...LEFT_EYE, ...RIGHT_EYE, ...INNER_LIPS];

export type Density = "all" | "outline";

interface Palette {
  dot: string;
  line: string;
  active: string;
}

/** Normalises any CSS colour for canvas use; falls back when the browser can't parse it. */
function canvasColor(value: string, fallback: string) {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe || !value) return fallback;
  probe.fillStyle = fallback;
  probe.fillStyle = value;
  return String(probe.fillStyle);
}

/**
 * The live camera preview: a mirrored <video> and a canvas showing what the
 * model found (ported from the original camera-view.ts). One instance per
 * game; it moves between the calibration view, the play dock and the results
 * screen so the face controller keeps reading the same video element.
 *
 * Between screens it waits in an invisible 2px holder instead of leaving the
 * document, so the video never pauses.
 */
export class CameraSurface {
  readonly el: HTMLDivElement;
  readonly video: HTMLVideoElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly holder: HTMLDivElement;
  private readonly ro: ResizeObserver;
  private slot: HTMLElement | null = null;
  private density: Density = "all";
  private palette: Palette = { dot: "#c6f36b", line: "#ffffff", active: "#c6f36b" };
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor() {
    this.el = document.createElement("div");
    this.el.setAttribute("aria-hidden", "true");
    Object.assign(this.el.style, { position: "relative", width: "100%", height: "100%", overflow: "hidden" });

    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.autoplay = true;
    Object.assign(this.video.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      transform: "scaleX(-1)",
    });

    this.canvas = document.createElement("canvas");
    Object.assign(this.canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none" });
    this.ctx = this.canvas.getContext("2d");
    this.el.append(this.video, this.canvas);

    this.holder = document.createElement("div");
    this.holder.setAttribute("aria-hidden", "true");
    Object.assign(this.holder.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: "2px",
      height: "2px",
      opacity: "0",
      overflow: "hidden",
      pointerEvents: "none",
      zIndex: "-1",
    });
    document.body.append(this.holder);
    this.holder.append(this.el);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
  }

  /** Shows the preview inside `slot` (which sets its size and shape). */
  mount(slot: HTMLElement, density: Density) {
    this.density = density;
    if (this.slot !== slot) {
      this.slot = slot;
      slot.append(this.el);
      this.readPalette(slot);
      this.replay();
    }
    this.resize();
  }

  /** Back to the invisible holder while no screen shows the camera. */
  park() {
    if (!this.slot) return;
    this.slot = null;
    this.holder.append(this.el);
    this.replay();
  }

  /** Width / height of the camera picture (4:3 until the stream has started). */
  get aspect() {
    return this.video.videoWidth && this.video.videoHeight ? this.video.videoWidth / this.video.videoHeight : 4 / 3;
  }

  clear() {
    if (!this.ctx) return;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Detaches the stream (camera off). */
  detach() {
    this.video.srcObject = null;
    this.clear();
  }

  destroy() {
    this.ro.disconnect();
    this.detach();
    this.el.remove();
    this.holder.remove();
  }

  private replay() {
    if (this.video.srcObject) void this.video.play().catch(() => {});
  }

  private readPalette(from: HTMLElement) {
    const style = getComputedStyle(from);
    const game = canvasColor(style.getPropertyValue("--game").trim(), "#c6f36b");
    const fg = canvasColor(style.getPropertyValue("--color-fg").trim(), "#ffffff");
    this.palette = { dot: game, line: fg, active: game };
  }

  private resize() {
    const r = this.el.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
  }

  /** Draws the tracked points, the eye line (steering) and the lip gap (jumping). */
  draw(snap: ControlSnapshot, showLandmarks: boolean) {
    const { ctx, w, h } = this;
    if (!ctx || !w || !h || w < 8) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const lms = snap.landmarks;
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!lms || !vw || !vh) return;

    // Map normalised coordinates through object-fit: cover, then mirror.
    const scale = Math.max(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const ox = (w - dw) / 2;
    const oy = (h - dh) / 2;
    const P = (lm: NormalizedLandmark) => ({ x: w - (ox + lm.x * dw), y: oy + lm.y * dh });
    const unit = Math.max(1, w / 260);
    const { dot, line, active } = this.palette;

    if (showLandmarks) {
      const all = this.density === "all";
      const r = (all ? 0.8 : 1.1) * Math.max(0.9, w / 420);
      ctx.fillStyle = dot;
      ctx.globalAlpha = all ? 0.85 : 0.9;
      ctx.beginPath();
      const draw = (p: { x: number; y: number }) => {
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      };
      if (all) for (const lm of lms) draw(P(lm));
      else for (const i of OUTLINE) if (lms[i]) draw(P(lms[i]));
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Steering: the eye line, extended.
    const a = P(lms[LM.rightEyeOuter]);
    const b = P(lms[LM.leftEyeOuter]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    ctx.strokeStyle = line;
    ctx.lineWidth = 2 * unit;
    ctx.setLineDash([5 * unit, 4 * unit]);
    ctx.beginPath();
    ctx.moveTo(a.x - dx * 0.45, a.y - dy * 0.45);
    ctx.lineTo(b.x + dx * 0.45, b.y + dy * 0.45);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = line;
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.6 * unit, 0, Math.PI * 2);
      ctx.fill();
    }

    // Jumping: the inner-lip gap. Thicker and in the game colour past the jump line.
    const up = P(lms[13]);
    const lo = P(lms[14]);
    ctx.strokeStyle = snap.mouthOpen ? active : line;
    ctx.lineWidth = (snap.mouthOpen ? 3 : 2) * unit;
    ctx.beginPath();
    ctx.moveTo(up.x, up.y);
    ctx.lineTo(lo.x, lo.y);
    ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    for (const p of [up, lo]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2 * unit, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
