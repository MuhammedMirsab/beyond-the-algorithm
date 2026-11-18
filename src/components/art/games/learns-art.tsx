"use client";

import {
  animate,
  cubicBezier,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import type { ArtProps } from "../game-art";

/**
 * See how AI learns. The tile: a pile of cups and a pile of pens teach the
 * model, then it labels a cup it has never seen (hovering fans the examples
 * out). The intro: a wordless loop of what the model really does: each photo
 * becomes a grid of numbers, the numbers become a dot on a map, dots of the
 * same kind land together, and a new photo lands in the right group.
 */
export function LearnsArt({ mode = "tile" }: ArtProps) {
  return mode === "intro" ? <LearnsIntro /> : <LearnsTile />;
}

function Cup() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M-20 -16h34v24a14 14 0 0 1-14 14h-6a14 14 0 0 1-14-14z" fill="currentColor" fillOpacity={0.12} />
      <path d="M14 -10h4a8 8 0 0 1 0 16h-4" />
      <path d="M-12 -28c0-4 4-4 4-8M-2 -28c0-4 4-4 4-8" strokeWidth={3} strokeOpacity={0.6} />
    </g>
  );
}

function Pen() {
  return (
    <g transform="rotate(-38)" fill="none" stroke="currentColor" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round">
      <rect x={-6} y={-30} width={12} height={46} rx={4} fill="currentColor" fillOpacity={0.12} />
      <path d="M-6 16l6 14 6-14" />
      <path d="M-6 -18h12" />
    </g>
  );
}

/* ── Tile: a still picture with one hover motion ─────────────────────── */

function Stack({ x, label, children }: { x: number; label: string; children: ReactNode }) {
  const cards = [
    { angle: -12, hover: "group-hover/tile:-rotate-[9deg] group-hover/tile:-translate-x-2" },
    { angle: -4, hover: "" },
    { angle: 5, hover: "group-hover/tile:rotate-[9deg] group-hover/tile:translate-x-2" },
  ];
  return (
    <g transform={`translate(${x} 136)`}>
      {cards.map((card, i) => (
        <g key={card.angle} transform={`rotate(${card.angle})`}>
          <g className={card.hover ? `art-move ${card.hover}` : undefined}>
            <rect x={-42} y={-42} width={84} height={84} rx={14} fill="white" fillOpacity={0.96} stroke="currentColor" strokeOpacity={0.18} strokeWidth={1.5} />
            {i === cards.length - 1 ? children : null}
          </g>
        </g>
      ))}
      <g transform="translate(0 70)">
        <rect x={-30} y={-14} width={60} height={28} rx={14} fill="currentColor" />
        <text y={5.5} textAnchor="middle" fontSize={14} fontWeight={760} fill="white" style={{ fontFamily: "var(--font-mona)" }}>
          {label}
        </text>
      </g>
    </g>
  );
}

function LearnsTile() {
  return (
    <svg viewBox="22 40 432 200" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <Stack x={78} label="cup">
        <Cup />
      </Stack>
      <Stack x={190} label="pen">
        <Pen />
      </Stack>

      <path d="M252 130h44m-12-11 12 11-12 11" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />

      {/* A new photo, and the model's answer. */}
      <g transform="translate(374 116)">
        <rect x={-62} y={-66} width={124} height={124} rx={18} fill="white" fillOpacity={0.96} />
        <g transform="translate(0 -6) scale(1.35)">
          <Cup />
        </g>
        <g transform="translate(0 84)">
          <rect x={-62} y={-16} width={124} height={32} rx={16} fill="white" fillOpacity={0.96} />
          <text x={-46} y={5.5} fontSize={14} fontWeight={760} fill="currentColor" style={{ fontFamily: "var(--font-mona)" }}>
            cup
          </text>
          <rect x={-8} y={-4} width={58} height={8} rx={4} fill="currentColor" fillOpacity={0.15} />
          <rect x={-8} y={-4} width={58} height={8} rx={4} fill="currentColor" className="art-move scale-x-[0.72] group-hover/tile:scale-x-[0.94]" style={{ transformOrigin: "left center" }} />
        </g>
      </g>
    </svg>
  );
}

/* ── Intro: the looping breakdown ────────────────────────────────────── */

const LOOP = 9.6;
/** The frame shown before the loop starts and under reduced motion: both groups and the answer. */
const STILL_AT = 7.9;
const FADE_OUT = 8.6;
const GONE = 8.9;

const EASE_MOVE = cubicBezier(0.77, 0, 0.175, 1);
const EASE_OUT = cubicBezier(0.22, 1, 0.36, 1);

type Key = readonly [time: number, value: number];

function useTrack(clock: MotionValue<number>, keys: readonly Key[], ease = EASE_MOVE) {
  return useTransform(
    clock,
    keys.map((k) => k[0]),
    keys.map((k) => k[1]),
    { ease },
  );
}

/** Plays while on screen, pauses off screen, holds the still frame under reduced motion. */
function useLoopClock(ref: RefObject<Element | null>) {
  const clock = useMotionValue(STILL_AT);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { amount: 0.2 });

  useEffect(() => {
    if (reduce) {
      clock.set(STILL_AT);
      return;
    }
    if (!inView) return;
    let stopped = false;
    let controls: { stop: () => void } | null = null;
    const run = (from: number) => {
      controls = animate(clock, [from, LOOP], {
        duration: LOOP - from,
        ease: "linear",
        onComplete: () => {
          if (!stopped) run(0);
        },
      });
    };
    run(clock.get() >= LOOP - 0.05 ? 0 : clock.get());
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [reduce, inView, clock]);

  return clock;
}

/** Where photos are taken (left) and the map of numbers (right). */
const SLOT = { x: 102, y: 172 };
const CARD = 112;
const MAP = { x: 206, y: 6, w: 262, h: 330 };
const CLUSTER = { cup: { x: 290, y: 104 }, pen: { x: 390, y: 238 } };

type Kind = keyof typeof CLUSTER;

/** The six example photos, in the order they are shown, and where each one's dot lands. */
const PHOTOS: { kind: Kind; at: number; dx: number; dy: number }[] = [
  { kind: "cup", at: 0.3, dx: -20, dy: -6 },
  { kind: "pen", at: 0.9, dx: 18, dy: 12 },
  { kind: "cup", at: 1.5, dx: 16, dy: -16 },
  { kind: "pen", at: 2.1, dx: -16, dy: -8 },
  { kind: "cup", at: 2.7, dx: 0, dy: 18 },
  { kind: "pen", at: 3.3, dx: 4, dy: 24 },
];
const TEST = { at: 5.3, dx: -4, dy: 2 };
const RINGS_AT = 4.35;

/** A tiny "1,280 numbers" grid: 4 x 4 dots of different sizes, the same for a kind. */
function NumberGrid({ kind }: { kind: Kind }) {
  const sizes =
    kind === "cup"
      ? [5, 2, 4, 1.5, 3, 5.5, 2, 4, 1.5, 4.5, 3, 2, 5, 2.5, 1.5, 4]
      : [2, 4.5, 1.5, 5, 4, 2, 5.5, 2, 3, 1.5, 4, 5, 2, 4.5, 3, 1.5];
  return (
    <g>
      {sizes.map((r, i) => (
        <circle key={i} cx={-27 + (i % 4) * 18} cy={-27 + Math.floor(i / 4) * 18} r={r} fill="currentColor" />
      ))}
    </g>
  );
}

function Glyph({ kind, scale = 1.4 }: { kind: Kind; scale?: number }) {
  return <g transform={`scale(${scale})`}>{kind === "cup" ? <Cup /> : <Pen />}</g>;
}

function PhotoCard({ clock, kind, at }: { clock: MotionValue<number>; kind: Kind; at: number }) {
  const opacity = useTrack(
    clock,
    [
      [0, 0],
      [at, 0],
      [at + 0.18, 1],
      [at + 0.44, 1],
      [at + 0.6, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const scale = useTrack(
    clock,
    [
      [0, 0.85],
      [at, 0.85],
      [at + 0.2, 1],
      [at + 0.44, 1],
      [at + 0.6, 0.3],
      [LOOP, 0.3],
    ],
    EASE_OUT,
  );
  const glyph = useTrack(
    clock,
    [
      [0, 1],
      [at + 0.2, 1],
      [at + 0.34, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const numbers = useTrack(
    clock,
    [
      [0, 0],
      [at + 0.22, 0],
      [at + 0.36, 1],
      [LOOP, 1],
    ],
    EASE_OUT,
  );
  return (
    <g transform={`translate(${SLOT.x} ${SLOT.y})`}>
      <motion.g style={{ opacity, scale }}>
        <rect x={-CARD / 2} y={-CARD / 2} width={CARD} height={CARD} rx={18} fill="white" fillOpacity={0.97} />
        <motion.g style={{ opacity: glyph }}>
          <Glyph kind={kind} />
        </motion.g>
        <motion.g style={{ opacity: numbers }}>
          <NumberGrid kind={kind} />
        </motion.g>
      </motion.g>
    </g>
  );
}

/** One photo's numbers as one dot, flying from the photo to its place on the map. */
function Dot({ clock, kind, at, dx, dy, test = false }: { clock: MotionValue<number>; kind: Kind; at: number; dx: number; dy: number; test?: boolean }) {
  const leave = at + (test ? 0.55 : 0.42);
  const land = leave + 0.55;
  const target = { x: CLUSTER[kind].x + dx, y: CLUSTER[kind].y + dy };
  const x = useTrack(clock, [
    [0, SLOT.x],
    [leave, SLOT.x],
    [land, target.x],
    [LOOP, target.x],
  ]);
  const y = useTrack(clock, [
    [0, SLOT.y],
    [leave, SLOT.y],
    [land, target.y],
    [LOOP, target.y],
  ]);
  const opacity = useTrack(
    clock,
    [
      [0, 0],
      [leave, 0],
      [leave + 0.08, 1],
      [FADE_OUT, 1],
      [GONE, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const scale = useTrack(
    clock,
    [
      [0, 1.6],
      [leave, 1.6],
      [land, 1],
      [LOOP, 1],
    ],
    EASE_OUT,
  );
  return (
    <motion.g style={{ x, y, opacity, scale }}>
      {test ? (
        <>
          <circle r={11} fill="white" stroke="currentColor" strokeWidth={3} />
          <circle r={5} fill="currentColor" />
        </>
      ) : kind === "cup" ? (
        <circle r={8} fill="currentColor" />
      ) : (
        <circle r={7} fill="white" stroke="currentColor" strokeWidth={3.5} />
      )}
    </motion.g>
  );
}

/** A ring around each group, and a label made of the group's own picture. */
function Group({ clock, kind, lit = false }: { clock: MotionValue<number>; kind: Kind; lit?: boolean }) {
  const c = CLUSTER[kind];
  const draw = useTrack(
    clock,
    [
      [0, 0],
      [RINGS_AT, 0],
      [RINGS_AT + 0.5, 1],
      [LOOP, 1],
    ],
    EASE_OUT,
  );
  const show = useTrack(
    clock,
    [
      [0, 0],
      [RINGS_AT - 0.02, 0],
      [RINGS_AT, 1],
      [FADE_OUT, 1],
      [GONE, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const label = useTrack(
    clock,
    [
      [0, 0],
      [RINGS_AT + 0.4, 0],
      [RINGS_AT + 0.7, 1],
      [FADE_OUT, 1],
      [GONE, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const glow = useTrack(
    clock,
    [
      [0, 0],
      [6.45, 0],
      [6.7, 1],
      [FADE_OUT, 1],
      [GONE, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const labelAt = kind === "cup" ? { x: c.x, y: c.y - 64 } : { x: c.x, y: c.y + 68 };
  return (
    <g>
      <motion.ellipse
        cx={c.x}
        cy={c.y}
        rx={46}
        ry={40}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        style={{ pathLength: draw, opacity: show }}
      />
      {lit ? (
        <motion.ellipse cx={c.x} cy={c.y} rx={46} ry={40} fill="currentColor" fillOpacity={0.14} stroke="currentColor" strokeWidth={4} style={{ opacity: glow }} />
      ) : null}
      <motion.g style={{ opacity: label }}>
        <rect x={labelAt.x - 22} y={labelAt.y - 18} width={44} height={36} rx={18} fill="currentColor" />
        <g transform={`translate(${labelAt.x} ${labelAt.y + 1}) scale(0.5)`} color="white" style={{ color: "white" }}>
          {kind === "cup" ? <Cup /> : <Pen />}
        </g>
      </motion.g>
    </g>
  );
}

/** The new photo: it keeps its place, sends its dot to the map, then shows the answer. */
function TestCard({ clock }: { clock: MotionValue<number> }) {
  const at = TEST.at;
  const opacity = useTrack(
    clock,
    [
      [0, 0],
      [at, 0],
      [at + 0.18, 1],
      [FADE_OUT, 1],
      [GONE, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const scale = useTrack(
    clock,
    [
      [0, 0.85],
      [at, 0.85],
      [at + 0.2, 1],
      [LOOP, 1],
    ],
    EASE_OUT,
  );
  const numbers = useTrack(
    clock,
    [
      [0, 0],
      [at + 0.3, 0],
      [at + 0.42, 1],
      [at + 0.75, 1],
      [at + 0.95, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const glyph = useTrack(
    clock,
    [
      [0, 1],
      [at + 0.3, 1],
      [at + 0.42, 0.15],
      [at + 0.75, 0.15],
      [at + 0.95, 1],
      [LOOP, 1],
    ],
    EASE_OUT,
  );
  const unsure = useTrack(
    clock,
    [
      [0, 1],
      [6.55, 1],
      [6.7, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const answer = useTrack(
    clock,
    [
      [0, 0],
      [6.6, 0],
      [6.85, 1],
      [FADE_OUT, 1],
      [GONE, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const answerY = useTrack(
    clock,
    [
      [0, -8],
      [6.6, -8],
      [6.85, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  return (
    <g transform={`translate(${SLOT.x} ${SLOT.y})`}>
      <motion.g style={{ opacity, scale }}>
        <rect x={-CARD / 2} y={-CARD / 2} width={CARD} height={CARD} rx={18} fill="white" fillOpacity={0.97} stroke="currentColor" strokeWidth={3} />
        <motion.g style={{ opacity: glyph }}>
          <Glyph kind="cup" />
        </motion.g>
        <motion.g style={{ opacity: numbers }}>
          <NumberGrid kind="cup" />
        </motion.g>
        <g transform={`translate(${CARD / 2 - 4} ${-CARD / 2 + 4})`}>
          <circle r={15} fill="currentColor" />
          <motion.path
            style={{ opacity: unsure }}
            d="M-4.2 -3.8a4.4 4.4 0 1 1 6.3 4c-1.5.8-2.1 1.6-2.1 3.2M0 7.6v0.2"
            fill="none"
            stroke="white"
            strokeWidth={3.2}
            strokeLinecap="round"
          />
          <motion.path
            style={{ opacity: answer }}
            d="M-6.5 0.5l4.5 4.5 8.5-9"
            fill="none"
            stroke="white"
            strokeWidth={3.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </motion.g>
      {/* The answer: the group it landed in. */}
      <motion.g style={{ opacity: answer, y: answerY }}>
        <g transform={`translate(0 ${CARD / 2 + 32})`}>
          <rect x={-30} y={-19} width={60} height={38} rx={19} fill="currentColor" />
          <g transform="translate(0 1) scale(0.55)" style={{ color: "white" }}>
            <Cup />
          </g>
        </g>
      </motion.g>
    </g>
  );
}

/** Viewfinder corners around the photo slot. */
function Viewfinder() {
  const half = CARD / 2 + 12;
  const c = 16;
  const { x, y } = SLOT;
  const d = [
    `M${x - half} ${y - half + c}V${y - half}H${x - half + c}`,
    `M${x + half - c} ${y - half}H${x + half}V${y - half + c}`,
    `M${x + half} ${y + half - c}V${y + half}H${x + half - c}`,
    `M${x - half + c} ${y + half}H${x - half}V${y + half - c}`,
  ].join("");
  return <path d={d} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.55} />;
}

function LearnsIntro() {
  const ref = useRef<SVGSVGElement | null>(null);
  const clock = useLoopClock(ref);
  const id = useId().replace(/:/g, "");
  return (
    <svg ref={ref} viewBox="24 0 452 342" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <pattern id={`${id}-grid`} width={18} height={18} patternUnits="userSpaceOnUse">
          <circle cx={9} cy={9} r={1.3} fill="currentColor" fillOpacity={0.22} />
        </pattern>
      </defs>
      <Viewfinder />
      <rect x={MAP.x} y={MAP.y} width={MAP.w} height={MAP.h} rx={22} fill="white" fillOpacity={0.9} />
      <rect x={MAP.x} y={MAP.y} width={MAP.w} height={MAP.h} rx={22} fill={`url(#${id}-grid)`} />
      <Group clock={clock} kind="cup" lit />
      <Group clock={clock} kind="pen" />
      {PHOTOS.map((p, i) => (
        <PhotoCard key={i} clock={clock} kind={p.kind} at={p.at} />
      ))}
      <TestCard clock={clock} />
      {PHOTOS.map((p, i) => (
        <Dot key={i} clock={clock} kind={p.kind} at={p.at} dx={p.dx} dy={p.dy} />
      ))}
      <Dot clock={clock} kind="cup" at={TEST.at} dx={TEST.dx} dy={TEST.dy} test />
    </svg>
  );
}
