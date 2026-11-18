"use client";

import { motion, useInView, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { HowItWorks } from "@/components/game/panels";
import { Modal } from "@/components/ui/dialog";
import type { InkImage } from "../engine/exportImage";
import { CLOUD_SIZE, letterAnatomy, type LetterAnatomy, type LetterBox } from "../engine/letters";
import { LEXICON } from "../engine/recognition/lexicon";
import type { CloudPoint, StrokeXY } from "../engine/recognition/pdollar";
import { readingSegments, recognizeStrokes, type Recognition } from "../engine/recognition/recognize";
import { inDisplayCase } from "../engine/words";
import { TEMPLATES } from "../engine/recognition/templates";
import { HAND_CONNECTIONS } from "../engine/gesture";
import { HandDiagram } from "./hand-diagram";

/** What happened on the visitor's last read, so the steps can show it. */
export interface ReadingStory {
  ink: InkImage;
  result: Recognition;
  /** The reading was rude and is not shown. */
  hidden: boolean;
  boxes: LetterBox[];
  words: number;
  /** The strokes as the recogniser got them (surface pixels), in the order they were written. */
  strokes: StrokeXY[];
  /** The first letter taken apart, when the reading lines up letter for letter. */
  anatomy: LetterAnatomy | null;
}

interface StoryProps {
  story?: ReadingStory | null;
  /** Frames per second the hand model actually ran at, when the camera was on. */
  fps?: number | null;
  /** Whether a fingertip in the air wrote the ink (false: mouse or touch). */
  usedCamera?: boolean;
}

export const TITLE = "How it read your writing";
export const INTRO = "Everything happens on this device. Nothing is sent anywhere, so it works without the internet.";

const SHAPES = Object.values(TEMPLATES).reduce((n, variants) => n + variants.length, 0);
const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* ── Example writing, for before anything is written ─────────────── */

/** "HI" as a mouse would write it (surface pixels), read by the real recogniser. */
const EXAMPLE_STROKES: StrokeXY[] = [
  [[300, 150], [300, 320]],
  [[390, 150], [390, 320]],
  [[300, 236], [390, 236]],
  [[470, 150], [470, 320]],
];

let example: { strokes: StrokeXY[]; result: Recognition; anatomy: LetterAnatomy | null } | null = null;

function exampleStory() {
  if (!example) {
    const result = inDisplayCase(recognizeStrokes(EXAMPLE_STROKES));
    example = { strokes: EXAMPLE_STROKES, result, anatomy: letterAnatomy(EXAMPLE_STROKES, result.text) };
  }
  return example;
}

/* ── Drawing helpers ─────────────────────────────────────────────── */

interface Fit {
  /** Maps a surface point into the 240 x 180 picture box. */
  x: (v: number) => number;
  y: (v: number) => number;
  scale: number;
}

/** Fits points into a 240 x 180 box with padding, keeping their shape. */
function fitTo(points: [number, number][], pad = 22): Fit {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - minX);
  const h = Math.max(1, Math.max(...ys) - minY);
  const scale = Math.min((240 - pad * 2) / w, (180 - pad * 2) / h);
  const ox = (240 - w * scale) / 2;
  const oy = (180 - h * scale) / 2;
  return { x: (v) => ox + (v - minX) * scale, y: (v) => oy + (v - minY) * scale, scale };
}

const pathOf = (stroke: StrokeXY, fit: Fit) =>
  stroke.length === 1
    ? `M${fit.x(stroke[0][0]).toFixed(1)} ${fit.y(stroke[0][1]).toFixed(1)}h0.01`
    : stroke.map(([x, y], i) => `${i ? "L" : "M"}${fit.x(x).toFixed(1)} ${fit.y(y).toFixed(1)}`).join("");

/** A 0..1 clock that loops while on screen and holds `still` under reduced motion. */
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

function Frame({ children, label, example }: { children: ReactNode; label: string; example: boolean }) {
  return (
    <div role="img" aria-label={label} className="dot-field relative aspect-[4/3] w-full">
      {children}
      {example ? <span className="type-label absolute left-3 top-2.5 text-fg-subtle">Example</span> : null}
    </div>
  );
}

/* ── 1. The fingertip trace ──────────────────────────────────────── */

/**
 * The visitor's own strokes, replayed in the order they wrote them. The dot
 * is the fingertip: filled while the pen is down, a ring while a pinch has
 * it lifted and it travels to the next stroke (the dashed line).
 */
function TraceVisual({ strokes, example, hand }: { strokes: StrokeXY[]; example: boolean; hand: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const fit = useMemo(() => fitTo(strokes.flat()), [strokes]);
  // Time budget per stroke and per lift, proportional to length so the pen moves at one speed.
  const plan = useMemo(() => {
    const len = (s: StrokeXY) => s.reduce((n, p, i) => (i ? n + Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) : n), 0);
    const parts: { kind: "ink" | "lift"; from: number; to: number; stroke: number }[] = [];
    let at = 0;
    strokes.forEach((s, i) => {
      if (i > 0) {
        const a = strokes[i - 1][strokes[i - 1].length - 1];
        const b = s[0];
        const d = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.6 + 40;
        parts.push({ kind: "lift", from: at, to: at + d, stroke: i });
        at += d;
      }
      const d = Math.max(30, len(s));
      parts.push({ kind: "ink", from: at, to: at + d, stroke: i });
      at += d;
    });
    const total = at;
    return { parts: parts.map((p) => ({ ...p, from: p.from / total, to: p.to / total })) };
  }, [strokes]);
  // 85% of the loop draws, the rest holds the finished word.
  const t = useLoop(ref, 1400 + strokes.length * 650, 0.92);
  const drawn = useTransform(t, (v) => clamp01(v / 0.85));

  return (
    <div ref={ref}>
      <Frame label={example ? "An example of writing being traced" : "Your writing, traced in the order you wrote it"} example={example}>
        <svg viewBox="0 0 240 180" aria-hidden className="absolute inset-0 size-full">
          {strokes.map((s, i) => (
            <TraceStroke key={i} d={pathOf(s, fit)} part={plan.parts.find((p) => p.kind === "ink" && p.stroke === i)!} drawn={drawn} />
          ))}
          {plan.parts
            .filter((p) => p.kind === "lift")
            .map((p) => {
              const a = strokes[p.stroke - 1][strokes[p.stroke - 1].length - 1];
              const b = strokes[p.stroke][0];
              return <LiftLine key={p.stroke} a={[fit.x(a[0]), fit.y(a[1])]} b={[fit.x(b[0]), fit.y(b[1])]} part={p} drawn={drawn} />;
            })}
          <Fingertip strokes={strokes} fit={fit} parts={plan.parts} drawn={drawn} hand={hand} />
        </svg>
      </Frame>
    </div>
  );
}

function TraceStroke({ d, part, drawn }: { d: string; part: { from: number; to: number }; drawn: MotionValue<number> }) {
  const length = useTransform(drawn, (v) => clamp01((v - part.from) / (part.to - part.from)));
  const shown = useTransform(length, (v) => (v > 0 ? 1 : 0));
  return (
    <motion.path d={d} fill="none" className="stroke-fg" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" style={{ pathLength: length, opacity: shown }} />
  );
}

function LiftLine({ a, b, part, drawn }: { a: [number, number]; b: [number, number]; part: { from: number; to: number }; drawn: MotionValue<number> }) {
  const k = useTransform(drawn, (v) => clamp01((v - part.from) / (part.to - part.from)));
  const x2 = useTransform(k, (v) => a[0] + (b[0] - a[0]) * v);
  const y2 = useTransform(k, (v) => a[1] + (b[1] - a[1]) * v);
  const shown = useTransform(k, (v) => (v > 0 ? 0.55 : 0));
  return <motion.line x1={a[0]} y1={a[1]} x2={x2} y2={y2} className="stroke-game" strokeWidth={1.5} strokeDasharray="3 4" style={{ opacity: shown }} />;
}

/** A pointing hand in MediaPipe's 21-point layout, moved so the index tip (point 8) is at the origin, at 60% size. */
const HAND_POINTS: [number, number][] = [
  [50, 96], [38, 89], [29, 80], [23, 71], [18, 63],
  [40, 60], [38, 44], [37, 33], [36, 21],
  [50, 59], [51, 47], [51, 40], [51, 34],
  [59, 61], [61, 51], [61, 45], [61, 40],
  [67, 65], [70, 57], [71, 52], [72, 47],
].map(([x, y]) => [(x - 36) * 0.6, (y - 21) * 0.6]);

function Fingertip({
  strokes,
  fit,
  parts,
  drawn,
  hand,
}: {
  strokes: StrokeXY[];
  fit: Fit;
  parts: { kind: "ink" | "lift"; from: number; to: number; stroke: number }[];
  drawn: MotionValue<number>;
  /** Draw the hand the fingertip belongs to (camera writing), not just the tip (mouse or touch). */
  hand: boolean;
}) {
  const where = (v: number): { x: number; y: number; down: boolean } => {
    const part = parts.find((p) => v >= p.from && v <= p.to) ?? parts[parts.length - 1];
    const k = clamp01((v - part.from) / (part.to - part.from));
    if (part.kind === "lift") {
      const a = strokes[part.stroke - 1][strokes[part.stroke - 1].length - 1];
      const b = strokes[part.stroke][0];
      return { x: fit.x(a[0] + (b[0] - a[0]) * k), y: fit.y(a[1] + (b[1] - a[1]) * k), down: false };
    }
    const s = strokes[part.stroke];
    if (s.length === 1) return { x: fit.x(s[0][0]), y: fit.y(s[0][1]), down: true };
    const lens = s.slice(1).map((p, i) => Math.hypot(p[0] - s[i][0], p[1] - s[i][1]));
    let left = k * lens.reduce((n, l) => n + l, 0);
    for (let i = 0; i < lens.length; i++) {
      if (left <= lens[i] || i === lens.length - 1) {
        const u = lens[i] ? clamp01(left / lens[i]) : 0;
        return { x: fit.x(s[i][0] + (s[i + 1][0] - s[i][0]) * u), y: fit.y(s[i][1] + (s[i + 1][1] - s[i][1]) * u), down: true };
      }
      left -= lens[i];
    }
    const last = s[s.length - 1];
    return { x: fit.x(last[0]), y: fit.y(last[1]), down: true };
  };
  const cx = useTransform(drawn, (v) => where(v).x);
  const cy = useTransform(drawn, (v) => where(v).y);
  const fill = useTransform(drawn, (v) => (where(v).down && v < 1 ? 1 : 0));
  const ring = useTransform(drawn, (v) => (!where(v).down && v < 1 ? 1 : 0));
  return (
    <g>
      {hand ? (
        <motion.g style={{ x: cx, y: cy }} className="text-fg-subtle">
          {HAND_CONNECTIONS.map(([a, b]) => (
            <line key={`${a}-${b}`} x1={HAND_POINTS[a][0]} y1={HAND_POINTS[a][1]} x2={HAND_POINTS[b][0]} y2={HAND_POINTS[b][1]} stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
          ))}
          {HAND_POINTS.map(([x, y], i) => (i === 8 ? null : <circle key={i} cx={x} cy={y} r={1.6} fill="currentColor" />))}
        </motion.g>
      ) : null}
      <motion.circle cx={cx} cy={cy} r={6} className="fill-game" style={{ opacity: fill }} />
      <motion.circle cx={cx} cy={cy} r={7} fill="none" className="stroke-game" strokeWidth={2} style={{ opacity: ring }} />
    </g>
  );
}

/* ── 2. The split into letters ───────────────────────────────────── */

/** The ink with one box per letter group, dropping in left to right, tagged with what each was read as. */
function SplitVisual({ strokes, text, example }: { strokes: StrokeXY[]; text: string | null; example: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const fit = useMemo(() => fitTo(strokes.flat(), 30), [strokes]);
  const groups = useMemo(() => readingSegments(strokes).flat(), [strokes]);
  const chars = text ? [...text.replace(/\s+/g, "")] : [];
  const labelled = chars.length === groups.length;
  const pad = 8;
  return (
    <div ref={ref}>
      <Frame label={`The ink split into ${plural(groups.length, "letter", "letters")}`} example={example}>
        <svg viewBox="0 0 240 180" aria-hidden className="absolute inset-0 size-full">
          {strokes.map((s, i) => (
            <path key={i} d={pathOf(s, fit)} fill="none" className="stroke-fg" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {groups.map((g, i) => {
            const x = fit.x(g.minX) - pad;
            const y = fit.y(g.minY) - pad;
            const w = (g.maxX - g.minX) * fit.scale + pad * 2;
            const h = (g.maxY - g.minY) * fit.scale + pad * 2;
            return (
              <motion.g
                key={i}
                initial={{ opacity: 0, y: -6 }}
                animate={inView ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.2 + Math.min(i, 4) * 0.18 }}
              >
                <rect x={x} y={y} width={w} height={h} rx={4} fill="none" className="stroke-game" strokeWidth={1.6} strokeDasharray="4 3" />
                {labelled ? (
                  <g transform={`translate(${x + w / 2} ${y})`}>
                    <rect x={-9} y={-9} width={18} height={16} rx={4} className="fill-game" />
                    <text y={3} textAnchor="middle" className="fill-game-ink font-mono text-[11px] font-semibold">
                      {chars[i]}
                    </text>
                  </g>
                ) : null}
              </motion.g>
            );
          })}
        </svg>
      </Frame>
    </div>
  );
}

/* ── 3. One letter as 32 points ──────────────────────────────────── */

/**
 * The first letter: its ink, then 32 evenly spaced dots along it, then the
 * same dots scaled and centred into a standard square. Size and position
 * stop mattering; only the shape is left.
 */
function CloudVisual({ anatomy, example }: { anatomy: LetterAnatomy; example: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useLoop(ref, 5200, 0.95);
  const fit = useMemo(() => fitTo(anatomy.ink.flat(), 34), [anatomy]);
  // The normalised cloud spans about -0.5..0.5; place it in a square on the right.
  const square = { cx: 178, cy: 90, size: 84 };
  const ink = useTransform(t, [0, 0.12, 0.3, 0.36], [1, 1, 0.25, 0.18]);
  const dots = useTransform(t, [0.12, 0.3], [0, 1]);
  const move = useTransform(t, [0.42, 0.7], [0, 1], { ease: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2) });
  const box = useTransform(t, [0.62, 0.72], [0, 1]);
  const from = anatomy.resampled.map((p) => [fit.x(p.x), fit.y(p.y)] as const);
  const to = anatomy.cloud.map((p) => [square.cx + p.x * square.size, square.cy + p.y * square.size] as const);
  // The ink starts left of centre so the square has room on the right.
  const shift = -40;
  return (
    <div ref={ref}>
      <Frame label={`Your letter ${anatomy.char} as ${CLOUD_SIZE} points, scaled and centred`} example={example}>
        <svg viewBox="0 0 240 180" aria-hidden className="absolute inset-0 size-full">
          <motion.g style={{ opacity: ink }} transform={`translate(${shift} 0)`}>
            {anatomy.ink.map((s, i) => (
              <path key={i} d={pathOf(s, fit)} fill="none" className="stroke-fg" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </motion.g>
          <motion.rect
            x={square.cx - square.size / 2 - 8}
            y={square.cy - square.size / 2 - 8}
            width={square.size + 16}
            height={square.size + 16}
            rx={8}
            fill="none"
            className="stroke-fg/30"
            strokeWidth={1.2}
            strokeDasharray="3 4"
            style={{ opacity: box }}
          />
          {from.map(([x, y], i) => (
            <CloudDot key={i} from={[x + shift, y]} to={to[i]} move={move} show={dots} />
          ))}
        </svg>
      </Frame>
    </div>
  );
}

function CloudDot({ from, to, move, show }: { from: readonly [number, number]; to: readonly [number, number]; move: MotionValue<number>; show: MotionValue<number> }) {
  const cx = useTransform(move, (k) => from[0] + (to[0] - from[0]) * k);
  const cy = useTransform(move, (k) => from[1] + (to[1] - from[1]) * k);
  return <motion.circle cx={cx} cy={cy} r={2.6} className="fill-game" style={{ opacity: show }} />;
}

/* ── 4. Matching ─────────────────────────────────────────────────── */

/**
 * Your 32 points over the stored shape they matched best, joined pair by
 * pair the way the matcher paired them, and the closest characters with
 * their total distance: the smallest wins.
 */
function MatchVisual({ anatomy, example }: { anatomy: LetterAnatomy; example: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const square = { cx: 64, cy: 86, size: 92 };
  const at = (p: CloudPoint) => [square.cx + p.x * square.size, square.cy + p.y * square.size] as const;
  const worst = Math.max(...anatomy.candidates.map((c) => c.d), 0.01);
  return (
    <div ref={ref}>
      <Frame label={`Your ${anatomy.char} matched against the stored ${anatomy.char}`} example={example}>
        <svg viewBox="0 0 240 180" aria-hidden className="absolute inset-0 size-full">
          {anatomy.pairs.map(([a, b], i) => {
            const [x1, y1] = at(anatomy.cloud[a]);
            const [x2, y2] = at(anatomy.library[b]);
            return (
              <motion.line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className="stroke-fg/45"
                strokeWidth={1}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={inView ? { pathLength: 1, opacity: 1 } : undefined}
                transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.5 + (i / anatomy.pairs.length) * 0.7 }}
              />
            );
          })}
          {anatomy.library.map((p, i) => {
            const [x, y] = at(p);
            return <circle key={`l${i}`} cx={x} cy={y} r={2.6} className="fill-game" />;
          })}
          {anatomy.cloud.map((p, i) => {
            const [x, y] = at(p);
            return <circle key={`y${i}`} cx={x} cy={y} r={2.3} className="fill-fg" />;
          })}
          {anatomy.candidates.map((c, i) => {
            const y = 54 + i * 34;
            const w = Math.max(6, (c.d / worst) * 74);
            return (
              <g key={c.char} transform={`translate(138 ${y})`}>
                <text x={0} y={4} className={i === 0 ? "fill-game font-sans text-[15px] font-bold" : "fill-fg-muted font-sans text-[15px] font-semibold"}>
                  {c.char}
                </text>
                <motion.rect
                  x={16}
                  y={-4}
                  height={8}
                  rx={4}
                  className={i === 0 ? "fill-game" : "fill-fg/30"}
                  initial={{ width: 0 }}
                  animate={inView ? { width: w } : undefined}
                  transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.3 + i * 0.12 }}
                />
                <text x={16} y={20} className="fill-fg-subtle font-mono text-[9px]">
                  {c.d.toFixed(2)}
                </text>
              </g>
            );
          })}
        </svg>
      </Frame>
    </div>
  );
}

/* ── Copy ────────────────────────────────────────────────────────── */

function handText({ fps, usedCamera = true }: StoryProps): string {
  if (!usedCamera) {
    return "You wrote with the mouse or touch this time. With the camera on, a hand model on this device finds 21 points on your hand about 30 times a second, and point 8, the tip of your index finger, becomes the pen.";
  }
  const rate = fps && fps > 0 ? `${fps} times a second here` : "about 30 times a second";
  return `A hand model on this device finds 21 points on your hand, ${rate}. Point 8, the tip of your index finger, is the pen. A pinch lifts it, so it can move to the next letter without drawing.`;
}

function splitText(story: ReadingStory | null | undefined): string {
  const base = "Strokes that overlap from side to side make one letter. A bigger gap starts a new word.";
  if (!story || !story.boxes.length) return base;
  const words = story.words > 1 ? ` in ${plural(story.words, "word", "words")}` : "";
  return `${base} Your writing made ${plural(story.boxes.length, "letter", "letters")}${words}.`;
}

function cloudText(anatomy: LetterAnatomy | null, example: boolean): string {
  const base = `It walks along the ink and drops ${CLOUD_SIZE} evenly spaced points, then scales and centres them, so big or small, high or low stops mattering. Only the shape is left.`;
  if (!anatomy || example) return base;
  return `${base} This is your ${anatomy.char}.`;
}

function matchText(story: ReadingStory | null | undefined, anatomy: LetterAnatomy | null): string {
  const pairs = `It pairs each point with the nearest point of each of its ${SHAPES} stored shapes and adds up the gaps. The smallest total wins.`;
  const words = `A list of ${LEXICON.length} words then settles look-alikes, like O and D.`;
  if (!story) return `${pairs} ${words}`;
  const ms = `${Math.max(1, Math.round(story.result.ms))} ms`;
  if (story.hidden) return `${pairs} This time it read a word this screen keeps hidden.`;
  if (story.result.kind === "unreadable") return `${pairs} This time no shape was close enough, so it said so instead of guessing.`;
  const runner =
    anatomy && anatomy.candidates.length > 1
      ? ` Your ${anatomy.char}: ${anatomy.candidates[0].d.toFixed(2)}, against ${anatomy.candidates[1].d.toFixed(2)} for ${anatomy.candidates[1].char}.`
      : "";
  return `${pairs}${runner} ${words} It read “${story.result.text}”, ${Math.round(story.result.confidence * 100)}% sure, in ${ms}.`;
}

function steps(props: StoryProps) {
  const { story } = props;
  const example = exampleStory();
  const own = story && !story.hidden && story.strokes.length > 0;
  const strokes = own ? story.strokes : example.strokes;
  const anatomy = own ? story.anatomy : null;
  const shownAnatomy = anatomy ?? example.anatomy;
  const text = own ? (story.result.kind === "text" ? story.result.text : null) : example.result.text;
  const hand = (
    <div className="dot-field grid aspect-[4/3] w-full place-items-center">
      <HandDiagram className="h-[78%] w-auto" />
    </div>
  );
  return [
    {
      title: "It follows your fingertip",
      text: handText(props),
      visual: own || !props.usedCamera ? <TraceVisual strokes={strokes} example={!own} hand={props.usedCamera !== false} /> : hand,
    },
    {
      title: "It splits the ink into letters",
      text: splitText(story),
      visual: <SplitVisual strokes={strokes} text={text} example={!own} />,
    },
    {
      title: `Each letter becomes ${CLOUD_SIZE} points`,
      text: cloudText(anatomy, !anatomy),
      visual: shownAnatomy ? <CloudVisual anatomy={shownAnatomy} example={!anatomy} /> : undefined,
    },
    {
      title: "The closest shape wins",
      text: matchText(story, anatomy),
      visual: shownAnatomy ? <MatchVisual anatomy={shownAnatomy} example={!anatomy} /> : undefined,
    },
  ];
}

/** The reveal under the first result. */
export function AirWriteHowItWorks({ className, ...props }: StoryProps & { className?: string }) {
  return <HowItWorks title={TITLE} intro={INTRO} steps={steps(props)} className={className} />;
}

/** The same steps in a modal, from the header. */
export function HowItWorksModal({ open, onOpenChange, ...props }: StoryProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title={TITLE} description={INTRO}>
      <HowItWorks title={TITLE} heading={false} columns="auto" steps={steps(props)} />
    </Modal>
  );
}
