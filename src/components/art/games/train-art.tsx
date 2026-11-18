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
import { useEffect, useRef, type RefObject } from "react";
import type { ArtProps } from "../game-art";

/**
 * Train the machine. The tile: a body as 17 points, waving, next to the two
 * moves it was taught (hovering waves the arm). The intro: a wordless loop of
 * the whole game: a stick figure strikes two poses, each snapshot drops into a
 * pile, each pile becomes one pattern, and a new pose is matched to the
 * closest pattern.
 */
export function TrainArt({ mode = "tile" }: ArtProps) {
  return mode === "intro" ? <TrainIntro /> : <TrainTile />;
}

/* ── Tile: a still picture with one hover motion ─────────────────────── */

type Pose = Record<"head" | "ls" | "rs" | "le" | "re" | "lw" | "rw" | "lh" | "rh" | "lk" | "rk" | "la" | "ra", [number, number]>;

const WAVE: Pose = {
  head: [140, 54],
  ls: [116, 92],
  rs: [164, 92],
  le: [96, 128],
  lw: [88, 166],
  re: [192, 74],
  rw: [202, 34],
  lh: [124, 158],
  rh: [156, 158],
  lk: [120, 198],
  rk: [162, 198],
  la: [116, 236],
  ra: [166, 236],
};

const CLAP: Pose = {
  ...WAVE,
  le: [108, 124],
  lw: [136, 118],
  re: [172, 124],
  rw: [144, 118],
};

function Skeleton({ pose, scale = 1, dot = 5, line = 3.4, waveArm = false }: { pose: Pose; scale?: number; dot?: number; line?: number; waveArm?: boolean }) {
  const p = (k: keyof Pose) => pose[k];
  const seg = (a: keyof Pose, b: keyof Pose) => `M${p(a)[0]} ${p(a)[1]}L${p(b)[0]} ${p(b)[1]}`;
  const body = [seg("ls", "rs"), seg("ls", "le"), seg("le", "lw"), seg("ls", "lh"), seg("rs", "rh"), seg("lh", "rh"), seg("lh", "lk"), seg("lk", "la"), seg("rh", "rk"), seg("rk", "ra"), seg("rs", "re")];
  const joints: (keyof Pose)[] = ["ls", "rs", "le", "lw", "re", "lh", "rh", "lk", "rk", "la", "ra"];
  return (
    <g transform={`scale(${scale})`}>
      {body.map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth={line} strokeLinecap="round" />
      ))}
      <g
        className={waveArm ? "art-move group-hover/tile:rotate-[-26deg]" : undefined}
        style={waveArm ? { transformBox: "view-box", transformOrigin: `${p("re")[0]}px ${p("re")[1]}px` } : undefined}
      >
        <path d={seg("re", "rw")} stroke="currentColor" strokeWidth={line} strokeLinecap="round" />
        <circle cx={p("rw")[0]} cy={p("rw")[1]} r={dot} fill="white" stroke="currentColor" strokeWidth={line * 0.72} />
      </g>
      <circle cx={p("head")[0]} cy={p("head")[1]} r={16} fill="white" stroke="currentColor" strokeWidth={line} />
      {joints.map((k) => (
        <circle key={k} cx={p(k)[0]} cy={p(k)[1]} r={dot} fill="white" stroke="currentColor" strokeWidth={line * 0.72} />
      ))}
    </g>
  );
}

function ExampleCard({ y, pose, label, lit }: { y: number; pose: Pose; label: string; lit?: boolean }) {
  return (
    <g transform={`translate(270 ${y})`}>
      <rect width={176} height={76} rx={16} fill="white" fillOpacity={0.95} />
      {lit ? (
        <rect width={176} height={76} rx={16} fill="none" stroke="currentColor" strokeWidth={3} className="art-move opacity-0 group-hover/tile:opacity-100" />
      ) : null}
      <g transform="translate(-14 -2)">
        <Skeleton pose={pose} scale={0.36} dot={9} line={7} />
      </g>
      <text x={74} y={34} fontSize={16} fontWeight={760} fill="currentColor" style={{ fontFamily: "var(--font-mona)" }}>
        {label}
      </text>
      {Array.from({ length: 5 }, (_, i) => (
        <circle key={i} cx={78 + i * 14} cy={54} r={4.5} fill="currentColor" fillOpacity={0.85} />
      ))}
    </g>
  );
}

function TrainTile() {
  return (
    <svg viewBox="60 18 400 236" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <g transform="translate(14 0)">
        <Skeleton pose={WAVE} waveArm />
      </g>
      <ExampleCard y={42} pose={WAVE} label="Wave" lit />
      <ExampleCard y={140} pose={CLAP} label="Clap" />
    </svg>
  );
}

/* ── Intro: the looping breakdown ────────────────────────────────────── */

/** One loop, in seconds. Every element reads the same clock, so nothing drifts. */
const LOOP = 9.4;
/** The frame shown before the loop starts and under reduced motion: piles, patterns and a match. */
const STILL_AT = 8.3;

const EASE_MOVE = cubicBezier(0.77, 0, 0.175, 1);
const EASE_OUT = cubicBezier(0.22, 1, 0.36, 1);

type Key = readonly [time: number, value: number];

/** A value that follows the shared clock through keyframes (seconds, value). */
function useTrack(clock: MotionValue<number>, keys: readonly Key[], ease = EASE_MOVE) {
  return useTransform(
    clock,
    keys.map((k) => k[0]),
    keys.map((k) => k[1]),
    { ease },
  );
}

/**
 * The loop's clock: plays while the art is on screen, pauses off screen,
 * and holds a meaningful still frame under reduced motion. It starts at the
 * still frame, so the first paint (and a slow connection) shows the whole idea.
 */
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

/** Arm angles in degrees, measured outwards from hanging straight down. Forearm angles are absolute. */
interface Rig {
  lu: number;
  lf: number;
  ru: number;
  rf: number;
}

const DOWN: Rig = { lu: 14, lf: 8, ru: 14, rf: 8 };
/** Pose one: arms up in a Y. Three slightly different snapshots. */
const UP: Rig[] = [
  { lu: 150, lf: 160, ru: 150, rf: 160 },
  { lu: 140, lf: 150, ru: 156, rf: 166 },
  { lu: 157, lf: 170, ru: 142, rf: 151 },
];
/** Pose two: arms out in a T. */
const OUT: Rig[] = [
  { lu: 88, lf: 88, ru: 88, rf: 88 },
  { lu: 80, lf: 76, ru: 95, rf: 99 },
  { lu: 96, lf: 101, ru: 81, rf: 79 },
];
/** The new pose it has never seen: close to the Y, but not the same. */
const TEST: Rig = { lu: 136, lf: 166, ru: 160, rf: 150 };

const average = (rigs: Rig[]): Rig => ({
  lu: rigs.reduce((s, r) => s + r.lu, 0) / rigs.length,
  lf: rigs.reduce((s, r) => s + r.lf, 0) / rigs.length,
  ru: rigs.reduce((s, r) => s + r.ru, 0) / rigs.length,
  rf: rigs.reduce((s, r) => s + r.rf, 0) / rigs.length,
});

/* The figure, in its own coordinates (also used, scaled down, inside the cards). */
const HEAD = { x: 120, y: 64 };
const SHOULDER = { l: { x: 98, y: 102 }, r: { x: 142, y: 102 } };
const HIP = { l: { x: 104, y: 172 }, r: { x: 136, y: 172 } };
const KNEE = { l: { x: 100, y: 226 }, r: { x: 140, y: 226 } };
const ANKLE = { l: { x: 98, y: 280 }, r: { x: 142, y: 280 } };
const UPPER = 38;
const FORE = 36;

/** Where the figure stands on the stage (its hips' centre) and how big it is. */
const FIG = { x: 118, y: 196, scale: 1.15 };
const onStage = (p: { x: number; y: number }) => ({ x: FIG.x + (p.x - 120) * FIG.scale, y: FIG.y + (p.y - 172) * FIG.scale });
/** Where snapshots leave the figure from: its chest. */
const CHEST = onStage({ x: 120, y: 150 });

const rad = (deg: number) => (deg * Math.PI) / 180;

function arm(side: "l" | "r", upper: number, fore: number) {
  const s = SHOULDER[side];
  const dir = side === "l" ? -1 : 1;
  const ex = s.x + dir * UPPER * Math.sin(rad(upper));
  const ey = s.y + UPPER * Math.cos(rad(upper));
  return { ex, ey, wx: ex + dir * FORE * Math.sin(rad(fore)), wy: ey + FORE * Math.cos(rad(fore)) };
}

/** Shot times (seconds) for the two poses. */
const SHOTS_UP = [0.95, 1.55, 2.15];
const SHOTS_OUT = [3.05, 3.65, 4.25];
/** The test: the figure strikes a new pose and is matched live. */
const TEST_AT = 6.3;
const MATCH_AT = 7.95;
const STACK_AT = 4.95;
const STACKED = 5.4;
const FADE_OUT = 8.75;
const GONE = 9.05;

/** The figure's arms through the loop: each snapshot catches it in a slightly different pose. */
function rigKeys(part: keyof Rig): Key[] {
  const v = (rig: Rig) => rig[part];
  return [
    [0, v(DOWN)],
    [0.4, v(DOWN)],
    [0.75, v(UP[0])],
    [1.15, v(UP[0])],
    [1.4, v(UP[1])],
    [1.75, v(UP[1])],
    [2.0, v(UP[2])],
    [2.45, v(UP[2])],
    [2.85, v(OUT[0])],
    [3.25, v(OUT[0])],
    [3.5, v(OUT[1])],
    [3.85, v(OUT[1])],
    [4.1, v(OUT[2])],
    [4.5, v(OUT[2])],
    [4.85, v(DOWN)],
    [5.9, v(DOWN)],
    [TEST_AT, v(TEST)],
    [8.6, v(TEST)],
    [8.95, v(DOWN)],
    [LOOP, v(DOWN)],
  ];
}

/** On while the new pose is being matched. */
const TESTING: Key[] = [
  [0, 0],
  [TEST_AT, 0],
  [TEST_AT + 0.2, 1],
  [FADE_OUT, 1],
  [GONE, 0],
  [LOOP, 0],
];

/** A small static body drawn in the figure's own coordinates. */
function Stick({ rig, ink = "currentColor", paper = "white" }: { rig: Rig; ink?: string; paper?: string }) {
  const l = arm("l", rig.lu, rig.lf);
  const r = arm("r", rig.ru, rig.rf);
  const lines: [number, number, number, number][] = [
    [SHOULDER.l.x, SHOULDER.l.y, SHOULDER.r.x, SHOULDER.r.y],
    [SHOULDER.l.x, SHOULDER.l.y, HIP.l.x, HIP.l.y],
    [SHOULDER.r.x, SHOULDER.r.y, HIP.r.x, HIP.r.y],
    [HIP.l.x, HIP.l.y, HIP.r.x, HIP.r.y],
    [HIP.l.x, HIP.l.y, KNEE.l.x, KNEE.l.y],
    [KNEE.l.x, KNEE.l.y, ANKLE.l.x, ANKLE.l.y],
    [HIP.r.x, HIP.r.y, KNEE.r.x, KNEE.r.y],
    [KNEE.r.x, KNEE.r.y, ANKLE.r.x, ANKLE.r.y],
    [SHOULDER.l.x, SHOULDER.l.y, l.ex, l.ey],
    [l.ex, l.ey, l.wx, l.wy],
    [SHOULDER.r.x, SHOULDER.r.y, r.ex, r.ey],
    [r.ex, r.ey, r.wx, r.wy],
  ];
  return (
    <g>
      {lines.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ink} strokeWidth={9} strokeLinecap="round" />
      ))}
      <circle cx={HEAD.x} cy={HEAD.y} r={17} fill={paper} stroke={ink} strokeWidth={9} />
      {[l.wx, r.wx].map((x, i) => (
        <circle key={i} cx={x} cy={i === 0 ? l.wy : r.wy} r={9} fill={paper} stroke={ink} strokeWidth={6} />
      ))}
    </g>
  );
}

/* Cards: drawn around their centre. */
const CARD_W = 100;
const CARD_H = 74;
/** The body spans about 240 units: scaled into the card. */
const CARD_SCALE = 0.26;

function CardFace({ rig, filled = false }: { rig: Rig; filled?: boolean }) {
  return (
    <>
      <rect
        x={-CARD_W / 2}
        y={-CARD_H / 2}
        width={CARD_W}
        height={CARD_H}
        rx={13}
        fill={filled ? "currentColor" : "white"}
        fillOpacity={filled ? 1 : 0.97}
        stroke="currentColor"
        strokeOpacity={filled ? 1 : 0.16}
        strokeWidth={1.5}
      />
      <g transform={`scale(${CARD_SCALE}) translate(-120 -168)`}>
        <Stick rig={rig} ink={filled ? "white" : "currentColor"} paper={filled ? "currentColor" : "white"} />
      </g>
    </>
  );
}

const PILE = { up: { x: 344, y: 96 }, out: { x: 344, y: 262 } };
/** Where each of a pile's three cards lands, then where it sits once the pile is stacked. */
const FAN = [
  { dx: -10, dy: 6, rot: -8, sx: -8, sy: -8 },
  { dx: 0, dy: -2, rot: 2, sx: -4, sy: -4 },
  { dx: 10, dy: 5, rot: 9, sx: 0, sy: 0 },
];

function FlyingCard({ clock, rig, shot, pile, slot }: { clock: MotionValue<number>; rig: Rig; shot: number; pile: { x: number; y: number }; slot: (typeof FAN)[number] }) {
  const land = shot + 0.5;
  const x = useTrack(clock, [
    [0, CHEST.x],
    [shot, CHEST.x],
    [land, pile.x + slot.dx],
    [STACK_AT, pile.x + slot.dx],
    [STACKED, pile.x + slot.sx],
    [LOOP, pile.x + slot.sx],
  ]);
  const y = useTrack(clock, [
    [0, CHEST.y],
    [shot, CHEST.y],
    [land, pile.y + slot.dy],
    [STACK_AT, pile.y + slot.dy],
    [STACKED, pile.y + slot.sy],
    [LOOP, pile.y + slot.sy],
  ]);
  const rotate = useTrack(clock, [
    [0, 0],
    [shot, 0],
    [land, slot.rot],
    [STACK_AT, slot.rot],
    [STACKED, 0],
    [LOOP, 0],
  ]);
  const scale = useTrack(
    clock,
    [
      [0, 0.4],
      [shot, 0.4],
      [land, 1],
      [LOOP, 1],
    ],
    EASE_OUT,
  );
  const opacity = useTrack(
    clock,
    [
      [0, 0],
      [shot, 0],
      [shot + 0.12, 1],
      [FADE_OUT, 1],
      [GONE, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  return (
    <motion.g style={{ x, y, rotate, scale, opacity }}>
      <CardFace rig={rig} />
    </motion.g>
  );
}

/** The averaged pattern: a filled card that lands on top of its pile. */
function PatternCard({ clock, rig, pile, lit }: { clock: MotionValue<number>; rig: Rig; pile: { x: number; y: number }; lit?: boolean }) {
  const show = useTrack(
    clock,
    [
      [0, 0],
      [5.3, 0],
      [5.65, 1],
      [FADE_OUT, 1],
      [GONE, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const scale = useTrack(
    clock,
    [
      [0, 0.92],
      [5.3, 0.92],
      [5.65, 1],
      [LOOP, 1],
    ],
    EASE_OUT,
  );
  const ring = useTrack(
    clock,
    [
      [0, 0],
      [MATCH_AT, 0],
      [MATCH_AT + 0.2, 1],
      [FADE_OUT, 1],
      [GONE, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const badge = useTrack(
    clock,
    [
      [0, 0.6],
      [MATCH_AT, 0.6],
      [MATCH_AT + 0.25, 1],
      [LOOP, 1],
    ],
    EASE_OUT,
  );
  return (
    <g transform={`translate(${pile.x} ${pile.y})`}>
      <motion.g style={{ opacity: show, scale }}>
        <CardFace rig={rig} filled />
      </motion.g>
      {lit ? (
        <motion.g style={{ opacity: ring }}>
          <rect x={-CARD_W / 2 - 6} y={-CARD_H / 2 - 6} width={CARD_W + 12} height={CARD_H + 12} rx={18} fill="none" stroke="currentColor" strokeWidth={3} />
          {/* A CSS transform would replace a transform attribute, so the scale sits inside the translate. */}
          <g transform={`translate(${CARD_W / 2 + 2} ${-CARD_H / 2 - 2})`}>
            <motion.g style={{ scale: badge }}>
              <circle r={13} fill="white" stroke="currentColor" strokeWidth={3} />
              <path d="M-5.5 0.5l3.8 3.8 7.2-7.6" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
            </motion.g>
          </g>
        </motion.g>
      ) : null}
    </g>
  );
}

/** How alike the new pose is to a pattern: a bar under the pattern, with the "not sure" line at 65%. */
function Meter({ clock, pile, value }: { clock: MotionValue<number>; pile: { x: number; y: number }; value: number }) {
  const show = useTrack(
    clock,
    [
      [0, 0],
      [7.2, 0],
      [7.4, 1],
      [FADE_OUT, 1],
      [GONE, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const fill = useTrack(
    clock,
    [
      [0, 0],
      [7.35, 0],
      [7.9, value],
      [LOOP, value],
    ],
    EASE_OUT,
  );
  const left = -CARD_W / 2;
  const top = CARD_H / 2 + 12;
  return (
    <motion.g style={{ opacity: show }} transform={`translate(${pile.x} ${pile.y})`}>
      <rect x={left} y={top} width={CARD_W} height={8} rx={4} fill="currentColor" fillOpacity={0.16} />
      <motion.rect x={left} y={top} width={CARD_W} height={8} rx={4} fill="currentColor" style={{ scaleX: fill, originX: 0 }} />
      <line x1={left + CARD_W * 0.65} x2={left + CARD_W * 0.65} y1={top - 4} y2={top + 12} stroke="white" strokeWidth={2.5} strokeLinecap="round" />
    </motion.g>
  );
}

/** The new pose is compared with both patterns: a strong link to the closest, a faint one to the other. */
function Links({ clock }: { clock: MotionValue<number> }) {
  const draw = useTrack(
    clock,
    [
      [0, 0],
      [6.85, 0],
      [7.3, 1],
      [LOOP, 1],
    ],
    EASE_OUT,
  );
  const show = useTrack(
    clock,
    [
      [0, 0],
      [6.83, 0],
      [6.87, 1],
      [FADE_OUT, 1],
      [GONE, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const faint = useTrack(
    clock,
    [
      [0, 0],
      [6.95, 0],
      [7.3, 0.45],
      [FADE_OUT, 0.45],
      [GONE, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const dot = useTrack(clock, TESTING, EASE_OUT);
  const from = { x: 244, y: CHEST.y + 8 };
  const toUp = { x: PILE.up.x - CARD_W / 2 - 16, y: PILE.up.y + 10 };
  const toOut = { x: PILE.out.x - CARD_W / 2 - 16, y: PILE.out.y - 10 };
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round">
      <motion.circle cx={from.x} cy={from.y} r={6} fill="currentColor" stroke="none" style={{ opacity: dot }} />
      <motion.path d={`M${from.x} ${from.y}L${toUp.x} ${toUp.y}`} strokeWidth={4} style={{ pathLength: draw, opacity: show }} />
      {/* Dashes and pathLength both use the dash pattern, so the weak link fades in instead of drawing. */}
      <motion.path d={`M${from.x} ${from.y}L${toOut.x} ${toOut.y}`} strokeWidth={2.5} strokeDasharray="2 7" style={{ opacity: faint }} />
    </g>
  );
}

/** The answer, at the corner of the viewfinder: a question, then a tick once the pose has matched. */
function Verdict({ clock }: { clock: MotionValue<number> }) {
  const show = useTrack(clock, TESTING, EASE_OUT);
  const unsure = useTrack(
    clock,
    [
      [0, 1],
      [MATCH_AT - 0.1, 1],
      [MATCH_AT + 0.05, 0],
      [LOOP, 0],
    ],
    EASE_OUT,
  );
  const sure = useTrack(
    clock,
    [
      [0, 0],
      [MATCH_AT, 0],
      [MATCH_AT + 0.2, 1],
      [LOOP, 1],
    ],
    EASE_OUT,
  );
  const scale = useTrack(
    clock,
    [
      [0, 0.7],
      [TEST_AT, 0.7],
      [TEST_AT + 0.25, 1],
      [MATCH_AT, 1],
      [MATCH_AT + 0.12, 1.15],
      [MATCH_AT + 0.3, 1],
      [LOOP, 1],
    ],
    EASE_OUT,
  );
  return (
    <g transform={`translate(${SHUTTER.x1} ${SHUTTER.y0})`}>
      <motion.g style={{ opacity: show, scale }}>
        <circle r={18} fill="currentColor" />
        <motion.path
          style={{ opacity: unsure }}
          d="M-4.6 -4.2a4.9 4.9 0 1 1 7 4.4c-1.7.9-2.3 1.8-2.3 3.6M0 8.4v0.2"
          fill="none"
          stroke="white"
          strokeWidth={3.4}
          strokeLinecap="round"
        />
        <motion.path
          style={{ opacity: sure }}
          d="M-7 0.6l4.9 4.9 9.2-9.8"
          fill="none"
          stroke="white"
          strokeWidth={3.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.g>
    </g>
  );
}

const SHUTTER = { x0: 8, y0: 34, x1: 232, y1: 346, c: 20 };

/** Viewfinder corners around the figure: they blink at each snapshot and stay on while it is tested live. */
function Shutter({ clock }: { clock: MotionValue<number> }) {
  const keys: Key[] = [[0, 0]];
  for (const t of [...SHOTS_UP, ...SHOTS_OUT]) keys.push([t - 0.12, 0], [t, 1], [t + 0.3, 0]);
  keys.push([TEST_AT, 0], [TEST_AT + 0.2, 0.6], [FADE_OUT, 0.6], [GONE, 0], [LOOP, 0]);
  const opacity = useTrack(clock, keys, EASE_OUT);
  const b = SHUTTER;
  const d = [
    `M${b.x0} ${b.y0 + b.c}V${b.y0}H${b.x0 + b.c}`,
    `M${b.x1 - b.c} ${b.y0}H${b.x1}V${b.y0 + b.c}`,
    `M${b.x1} ${b.y1 - b.c}V${b.y1}H${b.x1 - b.c}`,
    `M${b.x0 + b.c} ${b.y1}H${b.x0}V${b.y1 - b.c}`,
  ].join("");
  return <motion.path d={d} style={{ opacity }} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />;
}

/** The live figure: arms swing between poses (angles drive the joints, so limbs never stretch). */
function Figure({ clock }: { clock: MotionValue<number> }) {
  const lu = useTrack(clock, rigKeys("lu"));
  const lf = useTrack(clock, rigKeys("lf"));
  const ru = useTrack(clock, rigKeys("ru"));
  const rf = useTrack(clock, rigKeys("rf"));
  const left = useTransform(() => arm("l", lu.get(), lf.get()));
  const right = useTransform(() => arm("r", ru.get(), rf.get()));
  const lex = useTransform(left, (a) => a.ex);
  const ley = useTransform(left, (a) => a.ey);
  const lwx = useTransform(left, (a) => a.wx);
  const lwy = useTransform(left, (a) => a.wy);
  const rex = useTransform(right, (a) => a.ex);
  const rey = useTransform(right, (a) => a.ey);
  const rwx = useTransform(right, (a) => a.wx);
  const rwy = useTransform(right, (a) => a.wy);

  const bones: [number, number, number, number][] = [
    [SHOULDER.l.x, SHOULDER.l.y, SHOULDER.r.x, SHOULDER.r.y],
    [SHOULDER.l.x, SHOULDER.l.y, HIP.l.x, HIP.l.y],
    [SHOULDER.r.x, SHOULDER.r.y, HIP.r.x, HIP.r.y],
    [HIP.l.x, HIP.l.y, HIP.r.x, HIP.r.y],
    [HIP.l.x, HIP.l.y, KNEE.l.x, KNEE.l.y],
    [KNEE.l.x, KNEE.l.y, ANKLE.l.x, ANKLE.l.y],
    [HIP.r.x, HIP.r.y, KNEE.r.x, KNEE.r.y],
    [KNEE.r.x, KNEE.r.y, ANKLE.r.x, ANKLE.r.y],
  ];
  const joint = { r: 5.5, fill: "white", stroke: "currentColor", strokeWidth: 2.6 };
  const fixedJoints = [SHOULDER.l, SHOULDER.r, HIP.l, HIP.r, KNEE.l, KNEE.r, ANKLE.l, ANKLE.r];

  return (
    <g transform={`translate(${FIG.x - 120 * FIG.scale} ${FIG.y - 172 * FIG.scale}) scale(${FIG.scale})`}>
      <g stroke="currentColor" strokeWidth={3.4} strokeLinecap="round">
        {bones.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
        <motion.line x1={SHOULDER.l.x} y1={SHOULDER.l.y} x2={lex} y2={ley} />
        <motion.line x1={lex} y1={ley} x2={lwx} y2={lwy} />
        <motion.line x1={SHOULDER.r.x} y1={SHOULDER.r.y} x2={rex} y2={rey} />
        <motion.line x1={rex} y1={rey} x2={rwx} y2={rwy} />
        <line x1={HEAD.x} y1={HEAD.y + 16} x2={HEAD.x} y2={SHOULDER.l.y} />
        <circle cx={HEAD.x} cy={HEAD.y} r={16} fill="white" />
        {fixedJoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} {...joint} />
        ))}
        <motion.circle cx={lex} cy={ley} {...joint} />
        <motion.circle cx={lwx} cy={lwy} {...joint} />
        <motion.circle cx={rex} cy={rey} {...joint} />
        <motion.circle cx={rwx} cy={rwy} {...joint} />
      </g>
    </g>
  );
}

function TrainIntro() {
  const ref = useRef<SVGSVGElement | null>(null);
  const clock = useLoopClock(ref);
  return (
    <svg ref={ref} viewBox="0 14 412 344" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <Shutter clock={clock} />
      <Figure clock={clock} />
      {UP.map((rig, i) => (
        <FlyingCard key={`up-${i}`} clock={clock} rig={rig} shot={SHOTS_UP[i]} pile={PILE.up} slot={FAN[i]} />
      ))}
      {OUT.map((rig, i) => (
        <FlyingCard key={`out-${i}`} clock={clock} rig={rig} shot={SHOTS_OUT[i]} pile={PILE.out} slot={FAN[i]} />
      ))}
      <PatternCard clock={clock} rig={average(UP)} pile={PILE.up} lit />
      <PatternCard clock={clock} rig={average(OUT)} pile={PILE.out} />
      <Meter clock={clock} pile={PILE.up} value={0.86} />
      <Meter clock={clock} pile={PILE.out} value={0.24} />
      <Links clock={clock} />
      <Verdict clock={clock} />
    </svg>
  );
}
