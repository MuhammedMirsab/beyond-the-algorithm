"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/cn";
import { lerp } from "../engine/music";
import type { Pt, TraceSample } from "../engine/tracking/hands";
import { OneEuro } from "../engine/tracking/one-euro";
import type { StrikeStory } from "../play/session";
import { crossings, exampleSpeeds, strikeSegments, type SpeedSample } from "../play/strike-states";
import { REARM_FRACTION } from "../engine/tracking/gestures";

/**
 * The pictures for "How it works". Each one is a small motion graphic that
 * replays while it is on screen, drawn from the visitor's own numbers when
 * there are any (anything made up says "Example"), and a complete still
 * picture under reduced motion. Nothing moves while it is off screen.
 */

const W = 320;
const H = 180;

/** Plays while at least a third of it is on screen, never under reduced motion. */
function usePlaying() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const reduce = useReducedMotion();
  return { ref, play: inView && !reduce };
}

function Well({ children, label, tag, className, innerRef }: { children: ReactNode; label: string; tag?: string; className?: string; innerRef: Ref<HTMLDivElement> }) {
  return (
    <div ref={innerRef} role="img" aria-label={label} className={cn("relative", className)}>
      {children}
      {tag ? <span className="type-label absolute right-3 top-2.5 text-fg-subtle">{tag}</span> : null}
    </div>
  );
}

/**
 * The part of a chart that hasn't "happened" yet is hidden by a curtain in
 * the well's colour, pulled to the right by a playhead.
 */
function Sweep({ x0, x1, top, bottom, period, until }: { x0: number; x1: number; top: number; bottom: number; period: number; until: number }) {
  return (
    <motion.g
      initial={{ x: 0 }}
      animate={{ x: [0, x1 - x0, x1 - x0] }}
      transition={{ duration: period, times: [0, until, 1], ease: "linear", repeat: Infinity }}
    >
      <rect x={x0} y={top - 2} width={x1 - x0 + 6} height={bottom - top + 4} className="fill-sunken" />
      <line x1={x0} x2={x0} y1={top} y2={bottom} className="stroke-game" strokeWidth={1.5} />
    </motion.g>
  );
}

/** Pops in when the playhead reaches `at` (0 to 1 of the sweep), stays for the rest of the loop. */
function PopAt({ at, period, until, play, children }: { at: number; period: number; until: number; play: boolean; children: ReactNode }) {
  if (!play) return <g>{children}</g>;
  const t = Math.max(0.001, Math.min(0.95, at * until));
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: [0, 0, 1, 1], scale: [0.4, 0.4, 1, 1] }}
      transition={{ duration: period, times: [0, t, Math.min(0.999, t + 0.035), 1], ease: "easeOut", repeat: Infinity }}
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
    >
      {children}
    </motion.g>
  );
}

/* ── 1. Points ───────────────────────────────────────────────────── */

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

/** An open right hand, palm to the camera, in the model's landmark order: a stand-in before the camera has seen one. */
export const SAMPLE_HAND: Pt[] = [
  [0.5, 0.92], [0.39, 0.85], [0.31, 0.74], [0.25, 0.64], [0.2, 0.56],
  [0.4, 0.55], [0.37, 0.4], [0.355, 0.3], [0.345, 0.21],
  [0.49, 0.53], [0.49, 0.36], [0.49, 0.25], [0.49, 0.15],
  [0.58, 0.55], [0.6, 0.4], [0.61, 0.3], [0.62, 0.22],
  [0.66, 0.6], [0.7, 0.49], [0.72, 0.42], [0.74, 0.35],
].map(([x, y]) => ({ x, y }));

/** The 21 points appear one by one, finger by finger, then the bones join them. */
export function PointsVisual({ points, sample, aspect, fps }: { points: Pt[]; sample: boolean; aspect: number; fps: number | null }) {
  const { ref, play } = usePlaying();
  const box = { w: 180, h: 170 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  // Camera points are fractions of the picture's width and height: stretch x back to the picture's shape.
  const sx = sample ? 1 : aspect;
  const w = (Math.max(...xs) - minX) * sx || 1;
  const h = Math.max(...ys) - minY || 1;
  const scale = Math.min((box.w - 28) / w, (box.h - 28) / h);
  const ox = (box.w - w * scale) / 2;
  const oy = (box.h - h * scale) / 2;
  const at = (p: Pt) => ({ x: ox + (p.x - minX) * sx * scale, y: oy + (p.y - minY) * scale });
  const period = 5.2;
  const tip = points[8];
  return (
    <Well innerRef={ref} label={sample ? "A sample hand: 21 points" : "Your hand as the model saw it: 21 points"} className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-center">
      <svg viewBox={`0 0 ${box.w} ${box.h}`} className="block h-auto w-full">
        <motion.g
          className="stroke-fg/45"
          strokeWidth={1.6}
          strokeLinecap="round"
          initial={false}
          animate={play ? { opacity: [0, 0, 1, 1] } : { opacity: 1 }}
          transition={play ? { duration: period, times: [0, 0.2, 0.3, 1], repeat: Infinity, ease: "easeOut" } : undefined}
        >
          {BONES.map(([a, b]) => {
            const p = at(points[a]);
            const q = at(points[b]);
            return <line key={`${a}-${b}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
          })}
        </motion.g>
        {points.map((p, i) => {
          const c = at(p);
          const isTip = i === 8;
          const start = 0.01 + i * 0.008;
          return (
            <motion.circle
              key={i}
              cx={c.x}
              cy={c.y}
              r={isTip ? 5 : 3.2}
              className={isTip ? "fill-game" : "fill-fg"}
              initial={false}
              animate={play ? { opacity: [0, 0, 1, 1], scale: [0.2, 0.2, 1, 1] } : { opacity: 1, scale: 1 }}
              transition={play ? { duration: period, times: [0, start, start + 0.03, 1], repeat: Infinity, ease: "easeOut" } : undefined}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
          );
        })}
        {!sample && tip ? (
          <text x={at(tip).x + 9} y={at(tip).y - 7} className="fill-game font-mono text-[10px]">
            {`${tip.x.toFixed(2)}, ${tip.y.toFixed(2)}`}
          </text>
        ) : null}
      </svg>
      <div className="flex flex-col items-start gap-1 py-4 pr-4">
        <span className="type-label pb-1 text-fg-subtle">{sample ? "Sample hand" : "Your hand"}</span>
        <span className="font-dots text-[3.25rem] font-extrabold leading-none tabular-nums text-fg [font-variation-settings:'ROND'_70]">21</span>
        <span className="type-label text-fg-subtle">points a hand</span>
        <span className="type-label text-fg-subtle">{fps ? `${fps} times a second` : "about 30 a second"}</span>
      </div>
    </Well>
  );
}

/* ── 2. Smoothing ────────────────────────────────────────────────── */

/**
 * Without camera data: the game's own One-Euro filter run on a made-up
 * fingertip that rests (with webcam-sized wobble) and then moves.
 */
export function exampleTrace(): TraceSample[] {
  const f = new OneEuro(lerp(4, 0.5, 0.5), 6);
  const out: TraceSample[] = [];
  let seed = 7;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647 - 0.5) * 0.012;
  };
  for (let i = 0; i < 80; i++) {
    const t = i * 33;
    const move = i < 40 ? 0 : Math.min(1, (i - 40) / 6);
    const raw = 0.4 + move * 0.05 + noise();
    out.push({ t, raw, smooth: f.filter(raw, 0.033) });
  }
  return out;
}

/** The fingertip's height, raw (thin) and smoothed (gold), drawn as time passes. */
export function SmoothVisual({ trace, example }: { trace: TraceSample[]; example: boolean }) {
  const { ref, play } = usePlaying();
  const pad = { l: 16, r: 14, t: 34, b: 22 };
  const t0 = trace[0].t;
  const t1 = trace[trace.length - 1].t;
  const all = trace.flatMap((s) => [s.raw, s.smooth]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = Math.max(0.02, hi - lo);
  const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((v - lo) / span) * (H - pad.t - pad.b);
  const line = (k: "raw" | "smooth") => trace.map((s) => `${x(s.t).toFixed(1)},${y(s[k]).toFixed(1)}`).join(" ");
  const seconds = ((t1 - t0) / 1000).toFixed(1);
  const period = 4.6;
  return (
    <Well innerRef={ref} label={`${example ? "An example fingertip" : "Your fingertip"} over ${seconds} seconds: the raw points, and the smoothed line`} tag={example ? "Example" : undefined}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
        <polyline points={line("raw")} fill="none" className="stroke-fg/55" strokeWidth={1.3} strokeLinejoin="round" />
        <polyline points={line("smooth")} fill="none" className="stroke-game" strokeWidth={2.8} strokeLinejoin="round" strokeLinecap="round" />
        {play ? <Sweep x0={pad.l} x1={W - pad.r} top={pad.t - 6} bottom={H - pad.b + 6} period={period} until={0.55} /> : null}
        <text x={pad.l} y={H - 6} className="fill-fg-subtle font-mono text-[10px]">
          {`${seconds} s of ${example ? "a" : "your"} fingertip`}
        </text>
      </svg>
      <span className="type-label absolute left-3 top-2.5 flex gap-3">
        <span className="text-fg-subtle">Raw</span>
        <span className="text-game">Smoothed</span>
      </span>
    </Well>
  );
}

/* ── 3 and 4. Speed against the hit line, and the re-arm ─────────── */

interface StrikeData {
  samples: SpeedSample[];
  hits: SpeedSample[];
  threshold: number;
  rearm: number;
  span: number;
  example: boolean;
  simulated: boolean;
}

/** The visitor's strike, or an example at today's threshold. */
export function strikeData(strike: StrikeStory | null, threshold: number): StrikeData {
  if (strike && strike.hits.length) return { ...strike, example: false };
  const samples = exampleSpeeds(threshold);
  return {
    samples,
    hits: crossings(samples, threshold),
    threshold,
    rearm: threshold * REARM_FRACTION,
    span: samples[samples.length - 1].t,
    example: true,
    simulated: false,
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function speedPath(samples: SpeedSample[], x: (t: number) => number, y: (v: number) => number) {
  return samples.map((s, i) => `${i ? "L" : "M"}${x(s.t).toFixed(1)} ${y(Math.max(0, s.v)).toFixed(1)}`).join("");
}

/** Downward speed over a few seconds; each time it crosses the gold line, a hit. */
export function StrikeVisual({ data }: { data: StrikeData }) {
  const { ref, play } = usePlaying();
  const pad = { l: 34, r: 12, t: 30, b: 24 };
  const top = Math.max(data.threshold * 1.6, ...data.samples.map((s) => s.v), ...data.hits.map((h) => h.v)) * 1.05;
  const x = (t: number) => pad.l + (t / Math.max(1, data.span)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (Math.max(0, v) / top) * (H - pad.t - pad.b);
  const d = speedPath(data.samples, x, y);
  const base = H - pad.b;
  const period = Math.max(3.2, data.span / 1000 + 1.4);
  const until = Math.min(0.85, data.span / 1000 / period);
  return (
    <Well
      innerRef={ref}
      tag={data.example ? "Example" : undefined}
      label={`${data.example ? "An example hand" : "Your hand"}: downward speed over ${r1(data.span / 1000)} seconds. ${data.hits.length} hits, each where the speed crossed ${r1(data.threshold)} hand lengths a second.`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
        <path d={`${d}L${x(data.span).toFixed(1)} ${base}L${pad.l} ${base}Z`} className="fill-fg/[0.07]" />
        <path d={d} fill="none" className="stroke-fg/75" strokeWidth={1.8} strokeLinejoin="round" />
        <line x1={pad.l} x2={W - pad.r} y1={base} y2={base} className="stroke-fg/20" strokeWidth={1} />
        <line x1={pad.l} x2={W - pad.r} y1={y(data.threshold)} y2={y(data.threshold)} className="stroke-game" strokeWidth={2} />
        {play ? <Sweep x0={pad.l} x1={W - pad.r} top={pad.t - 8} bottom={base} period={period} until={until} /> : null}
        {data.hits.map((h) => (
          <PopAt key={h.t} at={(x(h.t) - pad.l) / (W - pad.l - pad.r)} period={period} until={until} play={play}>
            <circle cx={x(h.t)} cy={y(data.threshold)} r={5.5} className="fill-game" />
            <rect x={x(h.t) - 15} y={y(data.threshold) - 27} width={30} height={17} rx={8.5} className="fill-game" />
            <text x={x(h.t)} y={y(data.threshold) - 15} textAnchor="middle" className="fill-game-ink text-[10.5px] font-bold">
              Hit
            </text>
          </PopAt>
        ))}
        <text x={pad.l - 6} y={y(data.threshold) + 4} textAnchor="end" className="fill-game font-mono text-[10px]">
          {r1(data.threshold)}
        </text>
        <text x={pad.l - 6} y={base + 4} textAnchor="end" className="fill-fg-subtle font-mono text-[10px]">
          0
        </text>
        <text x={pad.l} y={H - 6} className="fill-fg-subtle font-mono text-[10px]">
          Hand lengths a second, downwards
        </text>
      </svg>
      <span className="type-label absolute left-3 top-2.5 text-fg-subtle">{data.example ? "Speed" : data.simulated ? "Your pretend hand" : "Your hand"}</span>
    </Well>
  );
}

/** One hit up close: after it, the detector waits until the speed falls under the dashed line. */
export function RearmVisual({ data }: { data: StrikeData }) {
  const { ref, play } = usePlaying();
  const hit = data.hits[0];
  const from = Math.max(data.samples[0]?.t ?? 0, (hit?.t ?? 0) - 260);
  const to = Math.min(data.span, (hit?.t ?? 0) + 1000);
  const samples = data.samples.filter((s) => s.t >= from && s.t <= to);
  const hits = data.hits.filter((h) => h.t >= from && h.t <= to);
  const segs = strikeSegments(samples, hits, data.rearm);
  const pad = { l: 34, r: 12, t: 28, b: 44 };
  const top = Math.max(data.threshold * 1.6, ...samples.map((s) => s.v)) * 1.05;
  const x = (t: number) => pad.l + ((t - from) / Math.max(1, to - from)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (Math.max(0, v) / top) * (H - pad.t - pad.b);
  const base = H - pad.b;
  const strip = { y: H - 32, h: 16 };
  const period = 4.2;
  const until = 0.6;
  return (
    <Well
      innerRef={ref}
      tag={data.example ? "Example" : undefined}
      label={`After a hit, the next one can count only once the speed drops below ${r1(data.rearm)} hand lengths a second.`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
        <path d={speedPath(samples, x, y)} fill="none" className="stroke-fg/75" strokeWidth={1.8} strokeLinejoin="round" />
        <line x1={pad.l} x2={W - pad.r} y1={base} y2={base} className="stroke-fg/20" strokeWidth={1} />
        <line x1={pad.l} x2={W - pad.r} y1={y(data.threshold)} y2={y(data.threshold)} className="stroke-game" strokeWidth={2} />
        <line x1={pad.l} x2={W - pad.r} y1={y(data.rearm)} y2={y(data.rearm)} className="stroke-game" strokeWidth={1.6} strokeDasharray="5 5" />
        {segs.map((s) => (
          <g key={s.from}>
            <rect x={x(s.from) + 1} y={strip.y} width={Math.max(0, x(s.to) - x(s.from) - 2)} height={strip.h} rx={strip.h / 2} className={s.state === "ready" ? "fill-game" : "fill-fg/15"} />
            {x(s.to) - x(s.from) > 58 ? (
              <text x={(x(s.from) + x(s.to)) / 2} y={strip.y + 11.5} textAnchor="middle" className={cn("text-[10px] font-semibold", s.state === "ready" ? "fill-game-ink" : "fill-fg-muted")}>
                {s.state === "ready" ? "Ready" : "Waiting"}
              </text>
            ) : null}
          </g>
        ))}
        {play ? <Sweep x0={pad.l} x1={W - pad.r} top={pad.t - 8} bottom={strip.y + strip.h} period={period} until={until} /> : null}
        {hits.map((h) => (
          <PopAt key={h.t} at={(x(h.t) - pad.l) / (W - pad.l - pad.r)} period={period} until={until} play={play}>
            <circle cx={x(h.t)} cy={y(data.threshold)} r={5.5} className="fill-game" />
          </PopAt>
        ))}
        <text x={pad.l - 6} y={y(data.threshold) + 4} textAnchor="end" className="fill-game font-mono text-[10px]">
          {r1(data.threshold)}
        </text>
        <text x={pad.l - 6} y={y(data.rearm) + 4} textAnchor="end" className="fill-game font-mono text-[10px]">
          {r1(data.rearm)}
        </text>
      </svg>
      <span className="type-label absolute left-3 top-2.5 text-fg-subtle">One hit up close</span>
    </Well>
  );
}

/* ── 5. Sound ─────────────────────────────────────────────────────── */

/** A plucked note: quick attack, long decay (a stand-in shape, not a real recording). */
const PLUCK = Array.from({ length: 44 }, (_, i) => {
  const k = i / 43;
  return Math.max(0.04, Math.exp(-k * 3.2) * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7))));
});
/** A drum built from a falling sine (the body) and a burst of noise (the snap). */
const SINE = Array.from({ length: 44 }, (_, i) => Math.exp(-(i / 43) * 4.5) * Math.abs(Math.cos(i * 0.9)));
const NOISE = Array.from({ length: 44 }, (_, i) => {
  const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  return Math.exp(-(i / 43) * 9) * (0.3 + 0.7 * r);
});

function Bars({ values, x0, width, mid, height, className }: { values: number[]; x0: number; width: number; mid: number; height: number; className?: string }) {
  const step = width / values.length;
  return (
    <g className={className}>
      {values.map((v, i) => (
        <rect key={i} x={x0 + i * step} y={mid - (v * height) / 2} width={Math.max(1, step - 1.6)} height={Math.max(1, v * height)} rx={1} />
      ))}
    </g>
  );
}

/**
 * Two ways to make a sound. Recordings: one note, played faster for a
 * higher note. Built live: a falling wave and a burst of noise, mixed into
 * a drum hit. The way the visitor heard is lit.
 */
export function SoundVisual({ recorded, built }: { recorded: string[]; built: string[] }) {
  const { ref, play } = usePlaying();
  const period = 4.8;
  // Before anything was played, both are lit; after, only the kinds the visitor heard.
  const any = recorded.length + built.length > 0;
  const heardRecorded = !any || recorded.length > 0;
  const heardBuilt = !any || built.length > 0;
  const lane = (used: boolean) => (used ? "text-fg" : "text-fg-subtle");
  return (
    <Well innerRef={ref} label="Recordings, sped up or slowed down for each note; and drums built from a wave and noise as you play.">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
        {/* Recordings: the same note, squeezed (played faster) for a higher one. */}
        <text x={16} y={30} className={cn("fill-current text-[12px] font-semibold", lane(heardRecorded))}>
          Recordings
        </text>
        <text x={16} y={46} className="fill-fg-subtle font-mono text-[10px]">
          piano, guitar, bass
        </text>
        <motion.g
          initial={false}
          animate={play ? { scaleX: [1, 1, 0.62, 0.62, 1] } : { scaleX: 1 }}
          transition={play ? { duration: period, times: [0, 0.3, 0.42, 0.75, 0.88], ease: [0.77, 0, 0.175, 1], repeat: Infinity } : undefined}
          style={{ transformBox: "fill-box", transformOrigin: "left center" }}
        >
          <Bars values={PLUCK} x0={182} width={124} mid={44} height={40} className={heardRecorded ? "fill-game" : "fill-fg/40"} />
        </motion.g>
        <motion.text
          x={304}
          y={76}
          textAnchor="end"
          className="fill-fg-subtle font-mono text-[10px]"
          initial={false}
          animate={play ? { opacity: [0, 0, 1, 1, 0] } : { opacity: 0 }}
          transition={play ? { duration: period, times: [0, 0.36, 0.44, 0.74, 0.82], repeat: Infinity } : undefined}
        >
          faster: a higher note
        </motion.text>

        {/* Built live: a wave and noise slide together into one hit. */}
        <text x={16} y={116} className={cn("fill-current text-[12px] font-semibold", lane(heardBuilt))}>
          Built live
        </text>
        <text x={16} y={132} className="fill-fg-subtle font-mono text-[10px]">
          drums, percussion, synth
        </text>
        <motion.g
          initial={false}
          animate={play ? { y: [-14, -14, 0, 0, -14] } : { y: 0 }}
          transition={play ? { duration: period, times: [0, 0.2, 0.34, 0.85, 1], ease: [0.77, 0, 0.175, 1], repeat: Infinity } : undefined}
        >
          <Bars values={SINE} x0={182} width={124} mid={134} height={34} className={heardBuilt ? "fill-game" : "fill-fg/40"} />
        </motion.g>
        <motion.g
          initial={false}
          animate={play ? { y: [14, 14, 0, 0, 14] } : { y: 0 }}
          transition={play ? { duration: period, times: [0, 0.2, 0.34, 0.85, 1], ease: [0.77, 0, 0.175, 1], repeat: Infinity } : undefined}
        >
          <Bars values={NOISE} x0={182} width={124} mid={134} height={34} className="fill-fg/60" />
        </motion.g>
      </svg>
    </Well>
  );
}

/* ── 6. Timing ────────────────────────────────────────────────────── */

const EXAMPLE_OFFSETS = [-14, 32, 6, -48, 71, 9, -22, 104, 18, -6];

/** Each note against the beat (the middle line): late above, early below, the gold band is "on time". */
export function TimingVisual({ offsets, window: win }: { offsets: number[] | null; window: number }) {
  const { ref, play } = usePlaying();
  const example = !offsets || offsets.length < 2;
  const notes = (example ? EXAMPLE_OFFSETS : offsets).slice(0, 14);
  const pad = { l: 46, r: 16, t: 38, b: 24 };
  const mid = (pad.t + H - pad.b) / 2;
  const lim = Math.max(win * 2.2, ...notes.map((o) => Math.abs(o))) * 1.08;
  const yOf = (o: number) => mid - (o / lim) * ((H - pad.t - pad.b) / 2);
  const xOf = (i: number) => pad.l + 10 + (i / Math.max(1, notes.length - 1)) * (W - pad.l - pad.r - 20);
  const period = 4.6;
  const until = 0.6;
  const onTime = notes.filter((o) => Math.abs(o) <= win).length;
  return (
    <Well
      innerRef={ref}
      tag={example ? "Example" : undefined}
      label={`${notes.length} notes against the beat: ${onTime} within ${win} milliseconds, the rest early or late.`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
        <rect x={pad.l} y={yOf(win)} width={W - pad.l - pad.r} height={yOf(-win) - yOf(win)} className="fill-game/15" />
        <line x1={pad.l} x2={W - pad.r} y1={mid} y2={mid} className="stroke-game" strokeWidth={1.5} />
        <text x={pad.l - 6} y={pad.t + 6} textAnchor="end" className="fill-fg-subtle text-[10.5px]">
          Late
        </text>
        <text x={pad.l - 6} y={H - pad.b} textAnchor="end" className="fill-fg-subtle text-[10.5px]">
          Early
        </text>
        <text x={pad.l - 6} y={mid + 4} textAnchor="end" className="fill-game font-mono text-[10px]">
          {`±${win}`}
        </text>
        {notes.map((o, i) => {
          const inside = Math.abs(o) <= win;
          return (
            <PopAt key={i} at={(xOf(i) - pad.l) / (W - pad.l - pad.r)} period={period} until={until} play={play}>
              <line x1={xOf(i)} x2={xOf(i)} y1={mid} y2={yOf(o)} className={inside ? "stroke-game/70" : "stroke-fg/40"} strokeWidth={1.5} />
              <circle cx={xOf(i)} cy={yOf(o)} r={5} className={inside ? "fill-game" : "fill-fg"} />
            </PopAt>
          );
        })}
        {play ? (
          <motion.line
            y1={pad.t - 6}
            y2={H - pad.b + 6}
            x1={pad.l}
            x2={pad.l}
            className="stroke-fg/50"
            strokeWidth={1}
            initial={{ x: 0 }}
            animate={{ x: [0, W - pad.l - pad.r, W - pad.l - pad.r], opacity: [1, 1, 0] }}
            transition={{ duration: period, times: [0, until, Math.min(1, until + 0.08)], ease: "linear", repeat: Infinity }}
          />
        ) : null}
        <text x={pad.l} y={H - 6} className="fill-fg-subtle font-mono text-[10px]">
          {`ms from the beat · ${onTime} of ${notes.length} on time`}
        </text>
      </svg>
      <span className="type-label absolute left-3 top-2.5 text-fg-subtle">{example ? "Timing" : "Your lesson"}</span>
    </Well>
  );
}

