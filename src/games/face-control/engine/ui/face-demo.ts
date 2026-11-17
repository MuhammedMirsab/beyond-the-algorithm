import { canvasFont } from "../game/fonts";
import { BALL_COLORS, THEMES } from "../game/themes";

/**
 * Animated, illustrative explainer: a "landmark face" (dots where a face
 * tracker places points) over a tiny game view whose ball reacts the way the
 * real game does. It is a scripted animation, used to show each calibration
 * pose; the real tracking runs on the camera next to it.
 */
export type DemoMode = "hero" | "neutral" | "tilt-left" | "tilt-right" | "mouth" | "mesh";

interface Pose {
  tilt: number; // degrees, + = player's right
  mouth: number; // 0..1
  label: string;
}

interface Key {
  t: number;
  tilt?: number;
  mouth?: number;
  label?: string;
}

const SCRIPTS: Record<Exclude<DemoMode, "mesh">, { length: number; keys: Key[] }> = {
  hero: {
    length: 9.4,
    keys: [
      { t: 0, tilt: 0, mouth: 0, label: "LOOK STRAIGHT · BALL WAITS" },
      { t: 1.0, tilt: 16, label: "TILT RIGHT → ROLL RIGHT" },
      { t: 2.9, mouth: 1, label: "OPEN MOUTH → JUMP" },
      { t: 3.45, mouth: 0 },
      { t: 4.4, label: "TILT RIGHT → ROLL RIGHT" },
      { t: 4.9, tilt: 0, label: "BACK TO NEUTRAL → SLOW DOWN" },
      { t: 6.2, tilt: -16, label: "TILT LEFT → ROLL LEFT" },
      { t: 8.2, tilt: 0, label: "LOOK STRAIGHT · BALL WAITS" },
    ],
  },
  neutral: {
    length: 4,
    keys: [{ t: 0, tilt: 0, mouth: 0, label: "LOOK STRAIGHT" }],
  },
  "tilt-left": {
    length: 4.2,
    keys: [
      { t: 0, tilt: 0, mouth: 0, label: "NEUTRAL" },
      { t: 0.9, tilt: -17, label: "TILT LEFT" },
      { t: 3.0, tilt: 0, label: "NEUTRAL" },
    ],
  },
  "tilt-right": {
    length: 4.2,
    keys: [
      { t: 0, tilt: 0, mouth: 0, label: "NEUTRAL" },
      { t: 0.9, tilt: 17, label: "TILT RIGHT" },
      { t: 3.0, tilt: 0, label: "NEUTRAL" },
    ],
  },
  mouth: {
    length: 3.6,
    keys: [
      { t: 0, tilt: 0, mouth: 0, label: "MOUTH CLOSED" },
      { t: 1.0, mouth: 1, label: "MOUTH OPEN → JUMP" },
      { t: 1.6, mouth: 0 },
      { t: 2.6, label: "MOUTH CLOSED" },
    ],
  },
};

const ease = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u));

/** Value of one property at time t, easing from the previous key value over `dur` seconds. */
function track(keys: Key[], t: number, prop: "tilt" | "mouth", dur: number) {
  let prev = 0;
  let cur = 0;
  let start = 0;
  let found = false;
  for (const k of keys) {
    if (k.t > t) break;
    const v = k[prop];
    if (v === undefined) continue;
    prev = found ? cur : v;
    cur = v;
    start = k.t;
    found = true;
  }
  return prev + (cur - prev) * ease((t - start) / dur);
}

function poseAt(mode: Exclude<DemoMode, "mesh">, t: number): Pose {
  const { keys } = SCRIPTS[mode];
  let label = "";
  for (const k of keys) {
    if (k.t > t) break;
    if (k.label) label = k.label;
  }
  return { tilt: track(keys, t, "tilt", 0.38), mouth: track(keys, t, "mouth", 0.18), label };
}

// --- The landmark face -------------------------------------------------------

interface Pt {
  x: number;
  y: number;
  key?: boolean;
}

function faceModel(mouth: number, blink: number, dense: boolean) {
  const pts: Pt[] = [];
  const oval: Pt[] = [];
  const n = dense ? 44 : 34;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let x = Math.sin(a) * 0.8;
    const y = -Math.cos(a) * 1.02 + mouth * 0.06 * Math.max(0, -Math.cos(a));
    const yy = Math.max(0, -Math.cos(a));
    x *= 1 - 0.24 * yy * yy * (y > 0 ? 1 : 0);
    oval.push({ x, y });
  }
  pts.push(...oval);
  const eye = (cx: number) => {
    const ring: Pt[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ring.push({ x: cx + Math.cos(a) * 0.15, y: -0.17 + Math.sin(a) * 0.055 * blink });
    }
    return ring;
  };
  const eyeR = eye(-0.33);
  const eyeL = eye(0.33);
  pts.push(...eyeR, ...eyeL);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const u = i / 4;
      pts.push({ x: side * (0.16 + u * 0.32), y: -0.36 - Math.sin(u * Math.PI) * 0.07 + u * 0.02 });
    }
  }
  for (let i = 0; i < 4; i++) pts.push({ x: 0, y: -0.1 + i * 0.1 });
  pts.push({ x: -0.09, y: 0.24 }, { x: 0, y: 0.27 }, { x: 0.09, y: 0.24 });
  const lipsOuter: Pt[] = [];
  const lipsInner: Pt[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    lipsOuter.push({ x: Math.cos(a) * 0.27, y: 0.5 + Math.sin(a) * (0.085 + mouth * 0.11) + mouth * 0.04 });
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    lipsInner.push({ x: Math.cos(a) * 0.19, y: 0.5 + Math.sin(a) * (0.012 + mouth * 0.15) + mouth * 0.04 });
  }
  pts.push(...lipsOuter, ...lipsInner);
  if (dense) {
    // Cheek / forehead points so the mesh reads as a surface.
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 7; c++) {
        const x = -0.6 + c * 0.2 + (r % 2) * 0.1;
        const y = -0.78 + r * 0.17;
        if (Math.abs(x) < 0.72 - r * 0.02 && !(y > -0.3 && y < -0.05 && Math.abs(x) > 0.15 && Math.abs(x) < 0.5)) pts.push({ x, y });
      }
    }
    for (const side of [-1, 1])
      for (let i = 0; i < 6; i++) pts.push({ x: side * (0.42 + (i % 2) * 0.12), y: 0.05 + i * 0.12 });
  }
  return { pts, oval, eyeR, eyeL, lipsOuter, lipsInner };
}

// --- Renderer ------------------------------------------------------------------

export interface DemoColors {
  /** Canvas fill, or null to leave it transparent. */
  bg: string | null;
  ink: string;
  faint: string;
  accent: string;
  label: string;
}

const LIGHT: DemoColors = { bg: "#ECE6DC", ink: "#16130F", faint: "rgba(22,19,15,0.16)", accent: "#FF5B23", label: "#6B6359" };

export interface DemoOptions {
  colors?: Partial<DemoColors>;
  /** Draw the scripted TILT / MOUTH numbers. Off where a number could be mistaken for a measurement. */
  readouts?: boolean;
}

/** The moment of each script that best shows its pose, used as a still frame under reduced motion. */
const STILL_T: Record<DemoMode, number> = { hero: 1.6, neutral: 0, "tilt-left": 2, "tilt-right": 2, mouth: 1.3, mesh: 0 };

export class FaceDemo {
  private readonly ctx: CanvasRenderingContext2D;
  private raf = 0;
  private visible = false;
  private last = 0;
  private time = 0;
  private acc = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private readonly io: IntersectionObserver;
  private readonly ro: ResizeObserver;
  private readonly colors: DemoColors;
  private readonly readouts: boolean;
  private readonly reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Mini-game state (fixed-step so the scripted jump always clears the spike).
  private sim = { x: 0, vx: 0, y: 0, vy: 0, roll: 0, prevMouth: 0 };
  private loopStartX = 0;
  private loopIndex = -1;
  private marks = { spike: 0, spark1: 0, spark2: 0 };
  private taken = { spark1: false, spark2: false };
  private bursts: { x: number; y: number; t: number }[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly mode: DemoMode,
    options: DemoOptions = {},
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.colors = { ...LIGHT, ...options.colors };
    this.readouts = options.readouts ?? true;
    if (mode !== "mesh") this.planLoop();
    // Reduced motion: one still frame of the pose, no animation loop.
    if (this.reduced) this.time = STILL_T[mode];
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.io = new IntersectionObserver((entries) => {
      this.visible = entries.some((e) => e.isIntersecting);
      if (this.visible) this.start();
      else this.stop();
    });
    this.io.observe(canvas);
    this.resize();
  }

  destroy() {
    this.stop();
    this.io.disconnect();
    this.ro.disconnect();
  }

  private start() {
    if (this.raf) return;
    if (this.reduced) {
      this.draw();
      return;
    }
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(this.reduced ? dt * 0.6 : dt);
      this.draw();
    };
    this.raf = requestAnimationFrame(frame);
  }

  private stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(10, rect.width);
    this.h = Math.max(10, rect.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.draw();
  }

  /** Dry-runs one loop to find where the scripted jump and pickups happen. */
  private planLoop() {
    if (this.mode === "mesh") return;
    const length = SCRIPTS[this.mode].length;
    const s = { x: 0, vx: 0, y: 0, vy: 0, roll: 0, prevMouth: 0 };
    let jumpX = 0;
    let jumpVx = 0;
    const dt = 1 / 120;
    for (let t = 0; t < length; t += dt) {
      const p = poseAt(this.mode, t);
      const before = s.vy;
      this.integrate(s, p, dt);
      if (before === 0 && s.vy < 0) {
        jumpX = s.x;
        jumpVx = s.vx;
      }
      if (Math.abs(t - 4.2) < dt / 2) this.marks.spark1 = s.x;
      if (Math.abs(t - 7.3) < dt / 2) this.marks.spark2 = s.x;
    }
    // Spike sits under the apex of the jump.
    this.marks.spike = jumpX + jumpVx * 0.36;
  }

  private integrate(s: FaceDemo["sim"], p: Pose, dt: number) {
    const target = (p.tilt / 16) * 150;
    s.vx += (target - s.vx) * (1 - Math.exp(-(Math.abs(p.tilt) > 1 ? 4.5 : 3) * dt));
    s.x += s.vx * dt;
    s.roll += (s.vx * dt) / 13;
    if (p.mouth > 0.55 && s.prevMouth <= 0.55 && s.y === 0) s.vy = -330;
    s.prevMouth = p.mouth;
    if (s.y < 0 || s.vy < 0) {
      s.vy += 900 * dt;
      s.y += s.vy * dt;
      if (s.y >= 0) {
        s.y = 0;
        s.vy = 0;
      }
    }
  }

  private step(dt: number) {
    if (this.mode === "mesh") {
      this.time += dt;
      return;
    }
    const length = SCRIPTS[this.mode].length;
    this.acc += dt;
    const fixed = 1 / 120;
    while (this.acc >= fixed) {
      this.acc -= fixed;
      const loop = Math.floor(this.time / length);
      if (loop !== this.loopIndex) {
        this.loopIndex = loop;
        this.loopStartX = this.sim.x;
        this.taken = { spark1: false, spark2: false };
        this.sim.prevMouth = 0;
      }
      const lt = this.time - loop * length;
      this.integrate(this.sim, poseAt(this.mode, lt), fixed);
      this.time += fixed;
      if (this.mode === "hero") {
        for (const key of ["spark1", "spark2"] as const) {
          const sx = this.loopStartX + this.marks[key];
          if (!this.taken[key] && Math.abs(this.sim.x - sx) < 8) {
            this.taken[key] = true;
            this.bursts.push({ x: sx, y: 0, t: this.time });
          }
        }
      }
    }
    this.bursts = this.bursts.filter((b) => this.time - b.t < 0.45);
  }

  private draw() {
    const { ctx, w, h } = this;
    if (!w || !h) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (this.colors.bg) {
      ctx.fillStyle = this.colors.bg;
      ctx.fillRect(0, 0, w, h);
    }

    if (this.mode === "mesh") {
      this.drawMesh();
      return;
    }
    const length = SCRIPTS[this.mode].length;
    const pose = poseAt(this.mode, this.time % length);

    if (this.mode === "hero") {
      const split = w * 0.38;
      this.drawFacePanel(pose, 0, 0, split, h, true);
      this.drawGame(pose, split, 0, w - split, h, true);
      ctx.fillStyle = "rgba(22,19,15,0.12)";
      ctx.fillRect(split, 0, 1, h);
    } else {
      const gameH = Math.round(h * 0.3);
      this.drawFacePanel(pose, 0, 0, w, h - gameH, false);
      this.drawGame(pose, 0, h - gameH, w, gameH, false);
    }
  }

  private drawFacePanel(pose: Pose, x: number, y: number, w: number, h: number, hero: boolean) {
    const { ctx, colors } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const scale = Math.min(w * 0.36, h * 0.3);
    const cx = x + w / 2;
    const cy = y + h * (hero ? 0.47 : 0.5);
    const blink = this.blink();
    this.drawFace(cx, cy, scale, pose.tilt, pose.mouth, blink, false);

    // Readouts.
    if (!this.readouts) {
      ctx.restore();
      return;
    }
    const fs = Math.max(10, Math.round(scale * 0.11));
    ctx.font = canvasFont(500, fs);
    ctx.fillStyle = colors.label;
    ctx.textBaseline = "top";
    const pad = Math.max(10, w * 0.05);
    if (this.mode === "mouth") {
      const ratio = (0.04 + pose.mouth * 0.32).toFixed(2);
      ctx.fillText(`MOUTH ${ratio}`, x + pad, y + pad);
    } else {
      const sign = pose.tilt > 0.5 ? "+" : pose.tilt < -0.5 ? "−" : " ";
      ctx.fillText(`TILT ${sign}${Math.abs(pose.tilt).toFixed(0).padStart(2, "0")}°`, x + pad, y + pad);
      if (hero) ctx.fillText(`MOUTH ${(0.04 + pose.mouth * 0.32).toFixed(2)}`, x + pad, y + pad + fs * 1.4);
    }
    ctx.textAlign = "right";
    ctx.fillText(hero ? "YOU" : "", x + w - pad, y + pad);
    ctx.textAlign = "left";
    ctx.restore();
  }

  private blink() {
    const t = this.time % 4.3;
    return t > 4.12 ? 0.15 : 1;
  }

  private drawFace(cx: number, cy: number, s: number, tiltDeg: number, mouth: number, blink: number, dense: boolean) {
    const { ctx, colors } = this;
    const model = faceModel(mouth, blink, dense);
    const a = (tiltDeg * Math.PI) / 180;
    const pivotY = 0.55;
    const tf = (p: Pt) => {
      const dx = p.x;
      const dy = p.y - pivotY;
      return {
        x: cx + (dx * Math.cos(a) - dy * Math.sin(a)) * s,
        y: cy + (dx * Math.sin(a) + dy * Math.cos(a) + pivotY) * s,
      };
    };
    // Faint contour lines give the dots a shape.
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.faint;
    for (const ring of [model.oval, model.eyeR, model.eyeL, model.lipsOuter, model.lipsInner]) {
      ctx.beginPath();
      ring.forEach((p, i) => {
        const q = tf(p);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    if (mouth > 0.05) {
      ctx.fillStyle = colors.faint;
      ctx.beginPath();
      model.lipsInner.forEach((p, i) => {
        const q = tf(p);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = colors.ink;
    const r = Math.max(1.2, s * 0.018);
    for (const p of model.pts) {
      const q = tf(p);
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Measurement overlays in the signal colour: eye line (tilt) and lip gap (mouth).
    const e1 = tf({ x: -0.48, y: -0.17 });
    const e2 = tf({ x: 0.48, y: -0.17 });
    const ext = 0.32;
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = Math.max(1.5, s * 0.016);
    ctx.setLineDash([s * 0.05, s * 0.04]);
    ctx.beginPath();
    ctx.moveTo(e1.x - (e2.x - e1.x) * ext, e1.y - (e2.y - e1.y) * ext);
    ctx.lineTo(e2.x + (e2.x - e1.x) * ext, e2.y + (e2.y - e1.y) * ext);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.accent;
    for (const e of [e1, e2]) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    const top = tf({ x: 0, y: 0.5 - 0.012 - mouth * 0.15 + mouth * 0.04 });
    const bottom = tf({ x: 0, y: 0.5 + 0.012 + mouth * 0.15 + mouth * 0.04 });
    ctx.beginPath();
    ctx.arc(top.x, top.y, r * 1.8, 0, Math.PI * 2);
    ctx.arc(bottom.x, bottom.y, r * 1.8, 0, Math.PI * 2);
    ctx.fill();
    if (mouth > 0.1) {
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(bottom.x, bottom.y);
      ctx.stroke();
    }
  }

  private drawGame(pose: Pose, x: number, y: number, w: number, h: number, hero: boolean) {
    const { ctx } = this;
    const t = THEMES.dawn;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const sky = ctx.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, t.sky[0]);
    sky.addColorStop(1, t.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, w, h);

    const unit = hero ? h / 300 : h / 110;
    const groundY = y + h * (hero ? 0.74 : 0.7);
    const ballR = 13 * unit;
    const ballScreenX = x + w * (hero ? 0.4 : 0.5);
    const camX = this.sim.x * unit;

    if (hero) {
      ctx.beginPath();
      ctx.arc(x + w * 0.76, y + h * 0.28, h * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = t.orb.color;
      ctx.fill();
      t.layers.slice(0, 2).forEach((color, i) => {
        const f = [0.15, 0.35][i];
        const base = groundY - h * [0.2, 0.08][i];
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        for (let px = 0; px <= w + 8; px += 8) {
          const wx = (px + camX * f) / (h * 0.5);
          ctx.lineTo(x + px, base - Math.sin(wx * 1.3 + i) * h * 0.05 - Math.sin(wx * 0.6) * h * 0.04);
        }
        ctx.lineTo(x + w, y + h);
        ctx.closePath();
        ctx.fill();
      });
    }

    // Ground platform with lip and moving tick marks (so you can see the ball travel).
    ctx.fillStyle = t.platform.body;
    ctx.fillRect(x, groundY, w, y + h - groundY);
    ctx.fillStyle = t.platform.top;
    ctx.fillRect(x, groundY, w, 7 * unit);
    ctx.fillStyle = t.platform.lip;
    ctx.fillRect(x, groundY, w, Math.max(1.5, 1.6 * unit));
    ctx.fillStyle = "rgba(247,217,185,0.16)";
    const tick = 46 * unit;
    for (let px = -((camX % tick) + tick) % tick; px < w; px += tick) ctx.fillRect(x + px, groundY + 16 * unit, 18 * unit, 2 * unit);

    const toScreen = (wx: number) => ballScreenX + (wx - this.sim.x) * unit;

    if (hero) {
      // Spike under the jump and two sparks on the path.
      const sx = toScreen(this.loopStartX + this.marks.spike);
      const sw = 30 * unit;
      for (let i = 0; i < 2; i++) {
        const px = sx - sw / 2 + i * (sw / 2);
        ctx.fillStyle = t.hazard;
        ctx.beginPath();
        ctx.moveTo(px, groundY);
        ctx.lineTo(px + sw / 4, groundY - 16 * unit);
        ctx.lineTo(px + sw / 4, groundY);
        ctx.fill();
        ctx.fillStyle = t.hazardDark;
        ctx.beginPath();
        ctx.moveTo(px + sw / 4, groundY - 16 * unit);
        ctx.lineTo(px + sw / 2, groundY);
        ctx.lineTo(px + sw / 4, groundY);
        ctx.fill();
      }
      for (const key of ["spark1", "spark2"] as const) {
        if (this.taken[key]) continue;
        const px = toScreen(this.loopStartX + this.marks[key]);
        this.star(px, groundY - ballR - 2 * unit + Math.sin(this.time * 3) * 2 * unit, 8 * unit);
      }
      for (const b of this.bursts) {
        const k = (this.time - b.t) / 0.45;
        ctx.strokeStyle = `rgba(255,191,46,${1 - k})`;
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.arc(toScreen(b.x), groundY - ballR, (6 + k * 22) * unit, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Ball shadow + ball.
    const by = groundY - ballR + this.sim.y * unit;
    const lift = Math.min(1, -this.sim.y / 70);
    ctx.fillStyle = `rgba(0,0,0,${0.22 * (1 - lift * 0.7)})`;
    ctx.beginPath();
    ctx.ellipse(ballScreenX, groundY, ballR * (1 - lift * 0.4), ballR * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    this.ball(ballScreenX, by, ballR, this.sim.roll);

    // Caption strip.
    if (pose.label && hero) {
      const fs = Math.max(10, Math.round(h * 0.042));
      ctx.font = canvasFont(600, fs);
      const tw = ctx.measureText(pose.label).width;
      const pad = fs * 0.7;
      ctx.fillStyle = "rgba(22,19,15,0.88)";
      ctx.beginPath();
      ctx.roundRect(x + pad, y + pad, tw + pad * 1.6, fs * 2, 4);
      ctx.fill();
      ctx.fillStyle = "#F7E6D2";
      ctx.textBaseline = "middle";
      ctx.fillText(pose.label, x + pad * 1.8, y + pad + fs);
    }
    ctx.restore();
  }

  private ball(x: number, y: number, r: number, roll: number) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.save();
    ctx.rotate(roll);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = BALL_COLORS.base;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.fillStyle = BALL_COLORS.band;
    ctx.fillRect(-r, -r * 0.21, r * 2, r * 0.42);
    ctx.beginPath();
    ctx.arc(0, -r * 0.62, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r * 1.4);
    g.addColorStop(0, "rgba(255,255,255,0.35)");
    g.addColorStop(0.4, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(70,18,0,0.45)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private star(x: number, y: number, r: number) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(255,191,46,0.25)";
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.32;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = THEMES.dawn.spark;
    ctx.fill();
    ctx.restore();
  }

  private drawMesh() {
    const { ctx, w, h, colors } = this;
    const t = this.time;
    const tilt = Math.sin(t * 0.7) * 9;
    const mouth = Math.max(0, Math.sin(t * 0.9 - 1.2)) ** 3 * 0.8;
    const s = Math.min(w, h) * 0.34;
    this.drawFace(w / 2, h * 0.47, s, tilt, mouth, this.blink(), true);
    if (!this.readouts) return;
    ctx.font = canvasFont(500, Math.max(10, Math.round(s * 0.075)));
    ctx.fillStyle = colors.label;
    ctx.textBaseline = "bottom";
    ctx.fillText(`ROLL ${tilt >= 0 ? "+" : "−"}${Math.abs(tilt).toFixed(1)}°`, w * 0.08, h * 0.95);
    ctx.textAlign = "right";
    ctx.fillText(`MOUTH ${(0.04 + mouth * 0.32).toFixed(2)}`, w * 0.92, h * 0.95);
    ctx.textAlign = "left";
  }
}
