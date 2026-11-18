"use client";

import { motion, useInView, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { Camera } from "lucide-react";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { HowItWorks } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { formatDegrees, formatRatio } from "../engine/format";
import { DEFAULT_PROFILE, type CalibrationProfile } from "../engine/vision/calibration";
import { jumpThresholds } from "../engine/vision/face-controller";
import type { FaceStatsSummary, TiltTrace } from "../engine/vision/face-stats";
import { LM } from "../engine/vision/face-metrics";
import { OneEuroFilter } from "../engine/vision/one-euro";
import type { CalibrationResult, FaceControlSession, TrackingStats } from "../play/session";
import { tokenColor } from "./canvas-colors";
import { useSettings } from "./hooks";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A 0..1 clock that loops while the picture is on screen and stops when it
 * isn't. Under reduced motion it holds `still`, a frame that tells the story.
 */
function useLoop(ref: RefObject<Element | null>, ms: number, still: number): MotionValue<number> {
  const inView = useInView(ref, { amount: 0.35 });
  const reduce = useReducedMotion();
  const t = useMotionValue(still);
  useEffect(() => {
    if (!inView || reduce) {
      if (reduce) t.set(still);
      return;
    }
    let raf = 0;
    const start = performance.now() - t.get() * ms;
    const tick = (now: number) => {
      t.set(((now - start) % ms) / ms);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, ms, still, t]);
  return t;
}

/** Steering as the controller computes it: tilt over range, a neutral zone, then a gentle curve. */
function steerFor(tilt: number, range: number, sensitivity: number, deadZone: number) {
  const n = clamp(tilt / (range / sensitivity), -1, 1);
  const mag = Math.abs(n) <= deadZone ? 0 : (Math.abs(n) - deadZone) / (1 - deadZone);
  return Math.sign(n) * Math.pow(mag, 1.2);
}

function Example({ show }: { show: boolean }) {
  return show ? <span className="type-label absolute left-3 top-2.5 text-fg-subtle">Example</span> : null;
}

/* ── 1. The points ───────────────────────────────────────────────── */

/** A plain dot face for visitors who played with the keys: an example, not anyone's points. */
function exampleFace(): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const ring = (cx: number, cy: number, rx: number, ry: number, n: number, a0 = 0, a1 = Math.PI * 2) => {
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / (a1 - a0 >= Math.PI * 2 ? n : n - 1);
      pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
  };
  ring(0.5, 0.5, 0.3, 0.4, 40);
  ring(0.39, 0.42, 0.06, 0.025, 12);
  ring(0.61, 0.42, 0.06, 0.025, 12);
  ring(0.39, 0.36, 0.08, 0.03, 7, Math.PI * 1.1, Math.PI * 1.9);
  ring(0.61, 0.36, 0.08, 0.03, 7, Math.PI * 1.1, Math.PI * 1.9);
  for (let i = 0; i < 6; i++) pts.push({ x: 0.5, y: 0.44 + i * 0.035 });
  ring(0.5, 0.71, 0.1, 0.045, 18);
  ring(0.5, 0.71, 0.065, 0.012, 12);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) pts.push({ x: 0.28 + c * 0.073 + (r % 2) * 0.036, y: 0.2 + r * 0.05 });
  return pts;
}

/**
 * The visitor's own points at their neutral pose: no photo, only the numbers
 * the model produced. They appear from the middle out, then the four points
 * the game actually uses light up: two eye corners and the inner lips.
 */
function PointsVisual({ points, aspect, example }: { points: { x: number; y: number }[]; aspect: number; example: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const inView = useInView(wrap, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || points.length === 0) return;
    const dot = tokenColor(canvas, "--color-fg", 0.75, "rgba(240, 242, 246, 0.75)");
    const accent = tokenColor(canvas, "--game", 1, "rgba(198, 243, 107, 1)");
    // Camera pixels, mirrored like the preview. The example face is already upright.
    const px = points.map((p) => (example ? { x: p.x, y: p.y } : { x: (1 - p.x) * aspect, y: p.y }));
    const cx = px.reduce((n, p) => n + p.x, 0) / px.length;
    const cy = px.reduce((n, p) => n + p.y, 0) / px.length;
    const order = px.map((p, i) => ({ i, d: Math.hypot(p.x - cx, p.y - cy) })).sort((a, b) => a.d - b.d);
    const keys: [number, number][] = example
      ? []
      : [
          [LM.rightEyeOuter, LM.leftEyeOuter],
          [13, 14],
        ];
    let raf = 0;
    let started = 0;

    const draw = (reveal: number, glow: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const xs = px.map((p) => p.x);
      const ys = px.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const bw = Math.max(...xs) - minX || 1;
      const bh = Math.max(...ys) - minY || 1;
      const pad = 16;
      const scale = Math.min((rect.width - pad * 2) / bw, (rect.height - pad * 2) / bh);
      const ox = (rect.width - bw * scale) / 2;
      const oy = (rect.height - bh * scale) / 2;
      const at = (i: number) => ({ x: ox + (px[i].x - minX) * scale, y: oy + (px[i].y - minY) * scale });

      const shown = Math.round(reveal * order.length);
      ctx.fillStyle = dot;
      ctx.beginPath();
      for (let k = 0; k < shown; k++) {
        const p = at(order[k].i);
        ctx.moveTo(p.x + 1.1, p.y);
        ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
      }
      ctx.fill();

      if (glow <= 0) return;
      ctx.globalAlpha = glow;
      ctx.strokeStyle = accent;
      ctx.fillStyle = accent;
      ctx.lineWidth = 2;
      for (const [a, b] of keys) {
        if (!px[a] || !px[b]) continue;
        const p = at(a);
        const q = at(b);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
        for (const r of [p, q]) {
          ctx.beginPath();
          ctx.arc(r.x, r.y, 3.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    if (!inView || reduce) {
      draw(inView || reduce ? 1 : 0, inView || reduce ? 1 : 0);
    } else {
      const tick = (now: number) => {
        started ||= now;
        const k = (now - started) / 1100;
        const reveal = clamp(k, 0, 1);
        const glow = clamp((k - 0.85) / 0.35, 0, 1);
        draw(1 - Math.pow(1 - reveal, 3), glow);
        if (k < 1.2) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    const ro = new ResizeObserver(() => draw(inView || reduce ? 1 : 0, inView || reduce ? 1 : 0));
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [points, aspect, example, inView, reduce]);

  return (
    <div ref={wrap} className="dot-field relative aspect-[4/3] w-full">
      <canvas ref={ref} role="img" aria-label={example ? "An example face as points" : `Your face as ${points.length} points`} className="block size-full" />
      <Example show={example} />
    </div>
  );
}

/* ── 2. The angle ───────────────────────────────────────────────── */

/**
 * The eye line tips to your left tilt, back, then to your right tilt; the arc
 * and number show the angle, and the bar shows the speed that angle gives.
 */
function TiltVisual({ left, right, profile, example }: { left: number; right: number; profile: CalibrationProfile; example: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { deadZone, steerSensitivity } = useSettings();
  const t = useLoop(ref, 5600, 0.32);
  // + = the visitor's right. On screen (mirrored, like a mirror) their right is on the right.
  const tilt = useTransform(t, [0, 0.1, 0.3, 0.42, 0.52, 0.72, 0.84, 1], [0, 0, -left, -left, 0, right, right, 0]);
  const rotate = useTransform(tilt, (v) => v);
  const label = useTransform(tilt, (v) => formatDegrees(v));
  const arc = useTransform(tilt, (v) => {
    const a = (v * Math.PI) / 180;
    const r = 46;
    const x = 120 + Math.cos(a) * r;
    const y = 62 + Math.sin(a) * r;
    return `M ${120 + r} 62 A ${r} ${r} 0 0 ${v >= 0 ? 1 : 0} ${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  const speed = useTransform(tilt, (v) => {
    const range = v < 0 ? profile.rangeLeft : profile.rangeRight;
    return steerFor(v, range, steerSensitivity, deadZone);
  });
  const barLeft = useTransform(speed, (v) => (v < 0 ? `${50 - Math.abs(v) * 50}%` : "50%"));
  const barWidth = useTransform(speed, (v) => `${Math.abs(v) * 50}%`);

  return (
    <div ref={ref} className="dot-field relative flex aspect-[4/3] w-full flex-col justify-center gap-3 px-5">
      <svg viewBox="0 0 240 124" aria-hidden className="w-full overflow-visible">
        <line x1={34} y1={62} x2={206} y2={62} className="stroke-fg/25" strokeWidth={1.5} strokeDasharray="4 5" />
        <motion.path d={arc} fill="none" className="stroke-game" strokeWidth={2} />
        <motion.g style={{ rotate }}>
          <line x1={54} y1={62} x2={186} y2={62} className="stroke-fg" strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={80} cy={62} r={6} className="fill-game" />
          <circle cx={160} cy={62} r={6} className="fill-game" />
        </motion.g>
        <motion.text x={120} y={112} textAnchor="middle" className="fill-fg font-mono text-[15px] font-semibold tabular-nums">
          {label}
        </motion.text>
      </svg>
      <div className="flex items-center gap-2.5">
        <span className="type-label w-12 shrink-0 text-fg-subtle">Speed</span>
        <span className="relative h-2 flex-1 rounded-full bg-fg/10">
          <span className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full bg-fg/15" style={{ width: `${deadZone * 100}%` }} />
          <motion.span className="absolute inset-y-0 rounded-full bg-game" style={{ left: barLeft, width: barWidth }} />
          <span className="absolute -inset-y-1 left-1/2 w-px bg-fg/35" />
        </span>
      </div>
      <Example show={example} />
    </div>
  );
}

/* ── 3. The ratio ───────────────────────────────────────────────── */

/**
 * A mouth opening and closing, the lip gap measured against the eye distance,
 * and the ratio running along a scale past the jump line.
 */
function MouthVisual({ closed, open, openAt, releaseAt, example }: { closed: number; open: number; openAt: number; releaseAt: number; example: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useLoop(ref, 3600, 0.42);
  const ratio = useTransform(t, [0, 0.22, 0.38, 0.52, 0.7, 1], [closed, closed, open, open, closed, closed]);
  const max = Math.max(0.6, open * 1.25);
  const gap = useTransform(ratio, (r) => clamp(r, 0, max) * 62);
  const upperY = useTransform(gap, (g) => 70 - g / 2);
  const lowerY = useTransform(gap, (g) => 70 + g / 2);
  const label = useTransform(ratio, (r) => formatRatio(r));
  const fill = useTransform(ratio, (r) => clamp(r / max, 0, 1));
  const jumping = useTransform(ratio, (r) => (r >= openAt ? 1 : 0));
  const upperLip = useTransform(upperY, (y) => `M 82 70 Q 120 ${(y - 16).toFixed(1)} 158 70 Q 120 ${y.toFixed(1)} 82 70 Z`);
  const lowerLip = useTransform(lowerY, (y) => `M 82 70 Q 120 ${(y + 18).toFixed(1)} 158 70 Q 120 ${y.toFixed(1)} 82 70 Z`);
  const at = (v: number) => `${clamp(v / max, 0, 1) * 100}%`;

  return (
    <div ref={ref} className="dot-field relative flex aspect-[4/3] w-full flex-col justify-center gap-4 px-5">
      <svg viewBox="0 0 240 120" aria-hidden className="w-full overflow-visible">
        {/* Eye distance: the yardstick. */}
        <line x1={70} y1={18} x2={170} y2={18} className="stroke-fg" strokeWidth={2} strokeLinecap="round" />
        <circle cx={70} cy={18} r={4.5} className="fill-fg" />
        <circle cx={170} cy={18} r={4.5} className="fill-fg" />
        {/* Lips. */}
        <motion.path d={upperLip} className="fill-fg/20 stroke-fg/60" strokeWidth={1.5} />
        <motion.path d={lowerLip} className="fill-fg/20 stroke-fg/60" strokeWidth={1.5} />
        <motion.line x1={120} x2={120} y1={upperY} y2={lowerY} className="stroke-game" strokeWidth={3} strokeLinecap="round" />
        <motion.circle cx={120} cy={upperY} r={3.5} className="fill-game" />
        <motion.circle cx={120} cy={lowerY} r={3.5} className="fill-game" />
        <motion.text x={196} y={76} textAnchor="middle" className="fill-fg font-mono text-[15px] font-semibold tabular-nums">
          {label}
        </motion.text>
      </svg>
      <div className="flex flex-col gap-1.5">
        <span className="relative h-2 rounded-full bg-fg/10">
          <motion.span className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-fg/40" style={{ scaleX: fill }} />
          <motion.span className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-game" style={{ scaleX: fill, opacity: jumping }} />
          <span className="absolute -inset-y-1.5 w-0.5 -translate-x-1/2 rounded-full bg-fg" style={{ left: at(openAt) }} />
          <span className="absolute -inset-y-1 w-px -translate-x-1/2 bg-fg/40" style={{ left: at(releaseAt) }} />
        </span>
        <span className="relative h-4">
          <span className="type-label absolute -translate-x-1/2 whitespace-nowrap text-fg" style={{ left: at(openAt) }}>
            Jump {formatRatio(openAt)}
          </span>
        </span>
      </div>
      <Example show={example} />
    </div>
  );
}

/* ── 4. The smoothing ───────────────────────────────────────────── */

/** Example data for keyboard players: a still head with landmark jitter, then a quick tilt, through the real 1€ filter. */
function exampleTrace(): TiltTrace {
  const filter = new OneEuroFilter(1.95, 0.0575);
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  const trace: TiltTrace = { t: [], raw: [], smooth: [] };
  for (let i = 0; i < 90; i++) {
    const s = i / 30;
    const target = s < 1.2 ? 0 : s < 1.6 ? ((s - 1.2) / 0.4) * 14 : 14;
    const raw = target + rand() * 2.6;
    trace.t.push(s);
    trace.raw.push(raw);
    trace.smooth.push(filter.filter(raw, s));
  }
  return trace;
}

function SmoothingVisual({ trace, example }: { trace: TiltTrace; example: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const { raw, smooth } = useMemo(() => {
    const all = [...trace.raw, ...trace.smooth];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const span = Math.max(4, hi - lo);
    const mid = (hi + lo) / 2;
    const end = trace.t[trace.t.length - 1] || 1;
    const path = (ys: number[]) =>
      ys.map((y, i) => `${i ? "L" : "M"} ${((trace.t[i] / end) * 220 + 10).toFixed(1)} ${(60 - ((y - mid) / span) * 88).toFixed(1)}`).join(" ");
    return { raw: path(trace.raw), smooth: path(trace.smooth) };
  }, [trace]);

  return (
    <div ref={ref} className="dot-field relative flex aspect-[4/3] w-full flex-col justify-center gap-3 px-4">
      <svg viewBox="0 0 240 120" aria-hidden className="w-full overflow-visible">
        <motion.path
          d={raw}
          fill="none"
          className="stroke-fg/45"
          strokeWidth={1.4}
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={inView ? { pathLength: 1 } : undefined}
          transition={{ duration: 1.2, ease: EASE_OUT }}
        />
        <motion.path
          d={smooth}
          fill="none"
          className="stroke-game"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={inView ? { pathLength: 1 } : undefined}
          transition={{ duration: 1.2, ease: EASE_OUT, delay: 0.35 }}
        />
      </svg>
      <div className="flex items-center justify-center gap-5">
        <span className="type-label inline-flex items-center gap-2 text-fg-subtle">
          <span aria-hidden className="h-0.5 w-5 rounded-full bg-fg/45" />
          Raw angle
        </span>
        <span className="type-label inline-flex items-center gap-2 text-fg">
          <span aria-hidden className="h-1 w-5 rounded-full bg-game" />
          Smoothed
        </span>
      </div>
      <Example show={example} />
    </div>
  );
}

/* ── The reveal ─────────────────────────────────────────────────── */

const INTRO = "The model never knew who you were. It placed points on a face, and the game turned them into two numbers: an angle and a ratio.";

/**
 * The reveal. With the camera, every number is this visitor's own: their
 * points, how far they tilted, how wide they opened, their jump line, their
 * tracking rate and a few seconds of their own tilt before and after
 * smoothing. Keyboard players see the same steps with clearly marked examples.
 */
export function FaceHowItWorks({
  session,
  calibration,
  stats,
  tracking,
}: {
  session: FaceControlSession;
  /** Null when the visitor never used their face (keyboard play). */
  calibration: CalibrationResult | null;
  stats: FaceStatsSummary | null;
  tracking: TrackingStats;
}) {
  const { jumpSensitivity, deadZone, steerSensitivity } = useSettings();
  const example = useMemo(() => ({ points: exampleFace(), trace: exampleTrace() }), []);
  const own = calibration !== null;
  const profile = calibration?.profile ?? DEFAULT_PROFILE;
  const fps = tracking.fps ? Math.round(tracking.fps) : null;
  const count = tracking.points ?? calibration?.points?.length ?? 478;
  const chip = tracking.delegate === "GPU" ? "graphics chip (GPU)" : tracking.delegate === "CPU" ? "processor (CPU)" : null;

  const left = own ? stats?.left ?? null : null;
  const right = own ? stats?.right ?? null : null;
  const closed = own ? calibration?.measured.mouthClosed ?? null : null;
  const open = own ? stats?.mouthOpen ?? null : null;
  const { openAt, releaseAt } = jumpThresholds(profile, jumpSensitivity);
  // The steering rule in degrees: tilt inside the neutral zone is ignored, full speed at range / sensitivity.
  const reach = (profile.rangeLeft + profile.rangeRight) / 2 / steerSensitivity;
  const neutralDeg = deadZone * reach;
  const fullDeg = Math.round(reach);

  const pointsText = own
    ? `A face model placed ${count} points on your eyes, lips, nose and face outline in every camera picture${fps ? `, about ${fps} times a second` : ""}. It ran on this laptop’s ${chip ?? "own chips"}, not on the internet.`
    : "With the camera on, a face model places 478 points on your eyes, lips, nose and face outline in every camera picture, about 30 times a second, on this laptop.";

  const tiltYou =
    left !== null && right !== null
      ? ` You tilted about ${formatDegrees(left)} left and ${formatDegrees(right)} right.`
      : left !== null
        ? ` You tilted about ${formatDegrees(left)} left.`
        : right !== null
          ? ` You tilted about ${formatDegrees(right)} right.`
          : "";
  const tiltText = `It draws a line through the outer corners of your eyes and measures its angle.${tiltYou} Small wobbles under ${formatDegrees(neutralDeg)} are ignored; past that, more tilt means more speed, with full speed at about ${fullDeg}°.`;

  const mouthYou =
    closed !== null && open !== null
      ? ` Yours measured ${formatRatio(closed)} closed and ${formatRatio(open)} wide open.`
      : closed !== null
        ? ` Closed, yours measured ${formatRatio(closed)}.`
        : "";
  const mouthText = `It divides the gap between your lips by the distance between your eyes, so it works near or far.${mouthYou} Past ${formatRatio(openAt)} the ball jumps, and the mouth must close below ${formatRatio(releaseAt)} before it can jump again.`;

  const ownTrace = own && stats?.trace ? stats.trace : null;
  const smoothText = ownTrace
    ? "The thin line is three seconds of your own tilt, straight from the points: it shakes a little every frame. A 1€ filter smooths it, strongly when you hold still and lightly when you move fast, so the ball is calm but quick."
    : "Points shake a little from frame to frame (the thin line). A 1€ filter smooths the angle, strongly when you hold still and lightly when you move fast, so the ball is calm but quick (the thick line).";

  const steps = [
    {
      title: own ? `${count} points on your face` : "478 points on a face",
      text: pointsText,
      visual: <PointsVisual points={own && calibration?.points?.length ? calibration.points : example.points} aspect={calibration?.aspect ?? 4 / 3} example={!(own && calibration?.points?.length)} />,
    },
    {
      title: "Tilt is one angle",
      text: tiltText,
      // Both sides must be the visitor's own before the moving angle stops being an example.
      visual: <TiltVisual left={left ?? 15} right={right ?? 15} profile={profile} example={left === null || right === null} />,
    },
    {
      title: "Jump is one ratio",
      text: mouthText,
      visual: (
        <MouthVisual
          closed={closed ?? 0.04}
          open={open ?? Math.max(openAt + 0.12, 0.38)}
          openAt={openAt}
          releaseAt={releaseAt}
          example={closed === null || open === null}
        />
      ),
    },
    {
      title: "Smoothing keeps it calm",
      text: smoothText,
      visual: <SmoothingVisual trace={ownTrace ?? example.trace} example={!ownTrace} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <HowItWorks
        title="How the face controls work"
        intro={own ? INTRO : "You played with the keys this time. With the camera on, the game reads your face like this."}
        steps={steps}
      />
      <p className="type-small max-w-[40rem] text-fg-subtle">
        No picture of you was kept. Only these numbers stayed on this laptop, and Next player forgets them.
      </p>
      {!own ? (
        <div>
          <Button variant="secondary" size="lg" icon={<Camera />} onClick={() => session.act({ type: "choose-camera" })}>
            Play with your face
          </Button>
        </div>
      ) : null}
    </div>
  );
}
