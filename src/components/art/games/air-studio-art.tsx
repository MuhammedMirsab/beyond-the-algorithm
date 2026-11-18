"use client";

import { motion, useInView, useMotionValue, useReducedMotion, useTime, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import type { ArtProps } from "../game-art";

/**
 * Air Studio's picture: a hand as the camera sees it (21 landmarks) over an
 * instrument, and a speed meter, the machine's view of the move.
 *
 * - tile: still, hand raised over a drum. On hover the hand strikes, the drum
 *   lights and a note lifts off.
 * - intro: a wordless loop of how it works. The hand strikes; the meter
 *   climbs past the hit line, the drum flashes and a note flies off; the
 *   lamp by the line goes hollow until the hand slows below the dashed
 *   re-arm line. Each beat the instrument changes: drum, keys, strings.
 *   Runs on one motion clock (no React renders), stops when off screen and
 *   holds the moment of the hit under reduced motion.
 */

const VIEW = "12 18 374 296";

/** An open right hand, palm to the camera, in the hand model's landmark order (0 to 1). */
const SAMPLE: [number, number][] = [
  [0.5, 0.92], [0.39, 0.85], [0.31, 0.74], [0.25, 0.64], [0.2, 0.56],
  [0.4, 0.55], [0.37, 0.4], [0.355, 0.3], [0.345, 0.21],
  [0.49, 0.53], [0.49, 0.36], [0.49, 0.25], [0.49, 0.15],
  [0.58, 0.55], [0.6, 0.4], [0.61, 0.3], [0.62, 0.22],
  [0.66, 0.6], [0.7, 0.49], [0.72, 0.42], [0.74, 0.35],
];

const CX = 170;
const WRIST_Y = 182;
const HAND_SCALE = 194;
const HAND: [number, number][] = SAMPLE.map(([x, y]) => [CX + (x - 0.5) * HAND_SCALE, WRIST_Y + (y - 0.92) * HAND_SCALE]);
const PALM_IDX = [0, 5, 9, 13, 17];
const PALM_R = 15;
const PALM: [number, number] = [PALM_IDX.reduce((a, i) => a + HAND[i][0], 0) / 5, PALM_IDX.reduce((a, i) => a + HAND[i][1], 0) / 5];

const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

/* ── The loop's timing (one strike per cycle) ────────────────────── */

const CYCLE_MS = 2100;
/** Phases within a cycle (0 to 1). */
const LIFT_END = 0.3;
const CONTACT = 0.4;
const HOLD_END = 0.46;
const RISE_END = 0.96;
/** How far the hand drops, in view units. */
const DROP = 46;

/** The meter: hit line and re-arm line, as shares of full scale. */
const HIT_LINE = 0.62;
const REARM_LINE = 0.22;
const PEAK_AT = CONTACT;
const SPEED_FLOOR = 0.08;
/** When the speed crosses the hit line: the moment the sound plays (the real detector fires on the crossing). */
const HIT_AT = LIFT_END + ((HIT_LINE - SPEED_FLOOR) / (1 - SPEED_FLOOR)) * (PEAK_AT - LIFT_END);
const DECAY_END = 0.56;
/** When the falling speed passes the re-arm line: ready for the next hit. */
const REARM_AT = PEAK_AT + (1 - REARM_LINE) * (DECAY_END - PEAK_AT);

/** The still frame (reduced motion, off screen): just after the hit. */
const STILL_MS = (HIT_AT + 0.05) * CYCLE_MS;

const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const phaseOf = (t: number) => (((t % CYCLE_MS) + CYCLE_MS) % CYCLE_MS) / CYCLE_MS;

/** The hand's vertical offset: a small lift (wind-up), a fast accelerating drop, a beat on the target, then a slow rise. */
function handOffset(p: number) {
  if (p < LIFT_END) return -7 * easeInOut(p / LIFT_END);
  if (p < CONTACT) {
    const k = (p - LIFT_END) / (CONTACT - LIFT_END);
    return -7 + (DROP + 7) * k * k;
  }
  if (p < HOLD_END) return DROP;
  if (p < RISE_END) return DROP * (1 - easeInOut((p - HOLD_END) / (RISE_END - HOLD_END)));
  return 0;
}

/** Downward speed, 0 to 1 of the meter. A resting hand still wobbles a little, well under the re-arm line. */
function speedAt(p: number, t: number) {
  const rest = 0.05 + 0.03 * Math.sin(t / 90) * Math.sin(t / 37);
  if (p >= LIFT_END && p < PEAK_AT) return SPEED_FLOOR + (1 - SPEED_FLOOR) * ((p - LIFT_END) / (PEAK_AT - LIFT_END));
  if (p >= PEAK_AT && p < DECAY_END) return Math.max(rest, 1 - (p - PEAK_AT) / (DECAY_END - PEAK_AT));
  return rest;
}

/** 1 at the hit, fading out. */
function hitFade(p: number, length: number) {
  if (p < HIT_AT || p > HIT_AT + length) return 0;
  const k = (p - HIT_AT) / length;
  return (1 - k) * (1 - k);
}

/** Which instrument this cycle shows (0 drum, 1 keys, 2 strings), with a short cross-fade at the turn. */
function instOpacity(i: number, t: number) {
  const n = Math.floor(t / CYCLE_MS);
  const idx = ((n % 3) + 3) % 3;
  if (idx !== i) return 0;
  const p = phaseOf(t);
  return Math.min(1, p / 0.06, (1 - p) / 0.04);
}

/* ── Shapes ───────────────────────────────────────────────────────── */

function Hand() {
  return (
    <>
      {BONES.map(([a, b]) => (
        <path key={`${a}-${b}`} d={`M${HAND[a][0]} ${HAND[a][1]}L${HAND[b][0]} ${HAND[b][1]}`} stroke="currentColor" strokeWidth={3.6} strokeLinecap="round" />
      ))}
      {HAND.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={5} fill="white" stroke="currentColor" strokeWidth={2.6} />
      ))}
    </>
  );
}

function Note() {
  return (
    <>
      <path d="M7 -2V-36C13 -31 21 -29 23 -21" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx={0} cy={0} rx={9} ry={6.6} transform="rotate(-20)" fill="white" stroke="currentColor" strokeWidth={2.6} />
    </>
  );
}

const DRUM_TOP_Y = 248;
/** Where the note leaves the instrument: its left, away from the meter. */
const NOTE_AT: [number, number] = [CX - 104, 228];
const DRUM_RX = 80;
const DRUM_RY = 15;

function DrumBody() {
  return (
    <>
      <path
        d={`M${CX - DRUM_RX} ${DRUM_TOP_Y}v30a${DRUM_RX} ${DRUM_RY} 0 0 0 ${DRUM_RX * 2} 0v-30`}
        fill="currentColor"
        fillOpacity={0.9}
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      {/* Tension rods. */}
      {[-52, -18, 18, 52].map((dx) => (
        <path key={dx} d={`M${CX + dx} ${DRUM_TOP_Y + 13 + Math.abs(dx) * -0.05}v24`} stroke="white" strokeOpacity={0.5} strokeWidth={2} strokeLinecap="round" />
      ))}
      <ellipse cx={CX} cy={DRUM_TOP_Y} rx={DRUM_RX} ry={DRUM_RY} fill="white" stroke="currentColor" strokeWidth={2.6} />
    </>
  );
}

const KEY_W = 30;
const KEYS = 6;
const KEY_X0 = CX - (KEY_W * KEYS) / 2;
const KEY_Y = 238;
const KEY_H = 52;
/** The white key under the hand. */
const HIT_KEY = 3;

/* A guitar lying across, neck to the left: one outline for both bouts. */
const GTR_Y = 266;
const BOUT_A = { x: CX - 28, r: 34 };
const BOUT_B = { x: CX + 40, r: 44 };
const BOUT_D = BOUT_B.x - BOUT_A.x;
const BOUT_JOIN = (BOUT_D * BOUT_D + BOUT_A.r * BOUT_A.r - BOUT_B.r * BOUT_B.r) / (2 * BOUT_D);
const BOUT_H = Math.sqrt(BOUT_A.r * BOUT_A.r - BOUT_JOIN * BOUT_JOIN);
const BOUT_X = BOUT_A.x + BOUT_JOIN;
const GTR_BODY = `M${BOUT_X} ${GTR_Y - BOUT_H}A${BOUT_A.r} ${BOUT_A.r} 0 1 0 ${BOUT_X} ${GTR_Y + BOUT_H}A${BOUT_B.r} ${BOUT_B.r} 0 1 0 ${BOUT_X} ${GTR_Y - BOUT_H}Z`;
const SOUND_HOLE = { x: CX + 16, r: 13 };
const STRINGS_FROM = CX - 128;
const STRINGS_TO = CX + 58;
const STRING_YS = [-6, -2, 2, 6].map((d) => GTR_Y + d);

function GuitarBody() {
  return (
    <>
      <rect x={CX - 150} y={GTR_Y - 14} width={26} height={28} rx={6} fill="currentColor" />
      <rect x={CX - 128} y={GTR_Y - 9} width={74} height={18} fill="white" stroke="currentColor" strokeWidth={2.4} />
      <path d={GTR_BODY} fill="white" stroke="currentColor" strokeWidth={2.6} strokeLinejoin="round" />
      <circle cx={SOUND_HOLE.x} cy={GTR_Y} r={SOUND_HOLE.r} fill="currentColor" />
      <rect x={CX + 54} y={GTR_Y - 12} width={8} height={24} rx={2} fill="currentColor" />
    </>
  );
}

/** The meter's track. */
const METER_X = 336;
const METER_TOP = 70;
const METER_BOTTOM = 278;
const meterY = (v: number) => METER_BOTTOM - v * (METER_BOTTOM - METER_TOP);

function MeterFrame() {
  return (
    <>
      {/* Down arrow: the meter reads downward speed. */}
      <path d={`M${METER_X} 34v20M${METER_X - 7} 47l7 7 7-7`} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={METER_X - 8} y={METER_TOP} width={16} height={METER_BOTTOM - METER_TOP} rx={8} fill="currentColor" fillOpacity={0.12} />
      {/* The hit line, and the dashed re-arm line under it. */}
      <path d={`M${METER_X - 18} ${meterY(HIT_LINE)}h36`} stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" />
      <path d={`M${METER_X - 16} ${meterY(REARM_LINE)}h32`} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeDasharray="4 5" />
      {/* The lamp's rim. Its dot is lit while a hit can count, and out while it waits for the hand to slow down. */}
      <circle cx={METER_X + 30} cy={meterY(HIT_LINE)} r={7} fill="white" stroke="currentColor" strokeWidth={2.6} />
    </>
  );
}

/* ── Intro: the loop ──────────────────────────────────────────────── */

function Scene({ time }: { time: MotionValue<number> }) {
  const handY = useTransform(time, (t) => handOffset(phaseOf(t)));
  const trail1 = useTransform(time, (t) => handOffset(phaseOf(t - 45)));
  const trail2 = useTransform(time, (t) => handOffset(phaseOf(t - 90)));
  const trailOn = useTransform(time, (t) => {
    const p = phaseOf(t);
    return p > LIFT_END + 0.03 && p < CONTACT + 0.03 ? 1 : 0;
  });
  const trail1Y = useTransform(trail1, (v) => PALM[1] + v);
  const trail2Y = useTransform(trail2, (v) => PALM[1] + v);
  const trail1Opacity = useTransform(trailOn, (v) => v * 0.45);
  const trail2Opacity = useTransform(trailOn, (v) => v * 0.22);

  const speed = useTransform(time, (t) => speedAt(phaseOf(t), t));
  const barY = useTransform(speed, (v) => meterY(v));
  const barH = useTransform(speed, (v) => Math.max(0, METER_BOTTOM - meterY(v)));
  const barOpacity = useTransform(speed, (v) => (v >= HIT_LINE ? 1 : 0.4));
  const lampOn = useTransform(time, (t) => {
    const p = phaseOf(t);
    return p >= HIT_AT && p < REARM_AT ? 0 : 1;
  });

  const flash = useTransform(time, (t) => hitFade(phaseOf(t), 0.2));
  const ringOpacity = useTransform(time, (t) => hitFade(phaseOf(t), 0.24));
  const ringRx = useTransform(time, (t) => {
    const p = phaseOf(t);
    const k = p < HIT_AT ? 0 : Math.min(1, (p - HIT_AT) / 0.24);
    return DRUM_RX + 6 + easeOut(k) * 26;
  });
  const ringRy = useTransform(ringRx, (rx) => DRUM_RY + (rx - DRUM_RX) * 0.32);

  // The note: off the target, up and to the right, then gone.
  const noteK = useTransform(time, (t) => {
    const p = phaseOf(t);
    return p < HIT_AT ? -1 : (p - HIT_AT) / 0.42;
  });
  const noteX = useTransform(noteK, (k) => (k < 0 ? 0 : -easeOut(Math.min(1, k)) * 26));
  const noteY = useTransform(noteK, (k) => (k < 0 ? 0 : -easeOut(Math.min(1, k)) * 96));
  const noteRotate = useTransform(noteK, (k) => (k < 0 ? 10 : 10 - Math.min(1, k) * 22));
  const noteOpacity = useTransform(noteK, (k) => (k < 0 || k > 1 ? 0 : k < 0.12 ? k / 0.12 : k > 0.6 ? (1 - k) / 0.4 : 1));

  const drumOn = useTransform(time, (t) => instOpacity(0, t));
  const keysOn = useTransform(time, (t) => instOpacity(1, t));
  const stringsOn = useTransform(time, (t) => instOpacity(2, t));
  const keyDip = useTransform(flash, (f) => f * 5);
  const stringsLit = useTransform(flash, (f) => f * 0.25);
  const stringPaths = useTransform(time, (t) => {
    const p = phaseOf(t);
    const since = p - HIT_AT;
    const amp = since < 0 || since > 0.5 ? 0 : 4.5 * Math.exp(-since * 9);
    return STRING_YS.map((y, i) => {
      const a = amp * Math.sin(t / 22 + i * 1.3);
      return `M${STRINGS_FROM} ${y}Q${SOUND_HOLE.x} ${y + a * 2} ${STRINGS_TO} ${y}`;
    }).join("");
  });
  const ringR = useTransform(ringRx, (rx) => SOUND_HOLE.r + (rx - DRUM_RX) * 0.9);

  return (
    <>
      {/* The instruments, one per beat. */}
      <motion.g style={{ opacity: drumOn }}>
        <DrumBody />
        <motion.ellipse cx={CX} cy={DRUM_TOP_Y} rx={DRUM_RX - 2} ry={DRUM_RY - 1.5} fill="currentColor" style={{ opacity: flash }} />
        <motion.ellipse cx={CX} cy={DRUM_TOP_Y} rx={ringRx} ry={ringRy} fill="none" stroke="currentColor" strokeWidth={2.6} style={{ opacity: ringOpacity }} />
      </motion.g>
      <motion.g style={{ opacity: keysOn }}>
        {Array.from({ length: KEYS }, (_, i) =>
          i === HIT_KEY ? null : (
            <rect key={i} x={KEY_X0 + i * KEY_W} y={KEY_Y} width={KEY_W} height={KEY_H} rx={4} fill="white" stroke="currentColor" strokeWidth={2.4} />
          ),
        )}
        <motion.g style={{ y: keyDip }}>
          <rect x={KEY_X0 + HIT_KEY * KEY_W} y={KEY_Y} width={KEY_W} height={KEY_H} rx={4} fill="white" stroke="currentColor" strokeWidth={2.4} />
          <motion.rect x={KEY_X0 + HIT_KEY * KEY_W + 3} y={KEY_Y + 3} width={KEY_W - 6} height={KEY_H - 6} rx={2} fill="currentColor" style={{ opacity: flash }} />
        </motion.g>
        {[1, 2, 4, 5].map((d) => (
          <rect key={d} x={KEY_X0 + d * KEY_W - 8} y={KEY_Y} width={16} height={28} rx={3} fill="currentColor" />
        ))}
        <motion.rect x={KEY_X0 - 8} y={KEY_Y - 8} width={KEY_W * KEYS + 16} height={KEY_H + 16} rx={10} fill="none" stroke="currentColor" strokeWidth={2.4} style={{ opacity: ringOpacity }} />
      </motion.g>
      <motion.g style={{ opacity: stringsOn }}>
        <GuitarBody />
        <motion.path d={GTR_BODY} fill="currentColor" style={{ opacity: stringsLit }} />
        <motion.path d={stringPaths} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        <motion.circle cx={SOUND_HOLE.x} cy={GTR_Y} r={ringR} fill="none" stroke="currentColor" strokeWidth={2.4} style={{ opacity: ringOpacity }} />
      </motion.g>

      {/* The palm's path during the strike: where the camera saw it a moment ago. */}
      <motion.circle cx={PALM[0]} cy={trail2Y} r={PALM_R} fill="none" stroke="currentColor" strokeWidth={2.4} style={{ opacity: trail2Opacity }} />
      <motion.circle cx={PALM[0]} cy={trail1Y} r={PALM_R} fill="none" stroke="currentColor" strokeWidth={2.4} style={{ opacity: trail1Opacity }} />

      {/* The hand, with the palm ring the drums play from. */}
      <motion.g style={{ y: handY }}>
        <Hand />
        <circle cx={PALM[0]} cy={PALM[1]} r={PALM_R} fill="none" stroke="currentColor" strokeWidth={3.4} />
      </motion.g>

      {/* The note. */}
      <motion.g style={{ x: noteX, y: noteY, opacity: noteOpacity }}>
        <g transform={`translate(${NOTE_AT[0]} ${NOTE_AT[1]})`}>
          <motion.g style={{ rotate: noteRotate }}>
            <Note />
          </motion.g>
        </g>
      </motion.g>

      {/* The machine's view: downward speed against the hit line. */}
      <MeterFrame />
      <motion.rect x={METER_X - 8} width={16} rx={8} fill="currentColor" height={barH} style={{ y: barY, opacity: barOpacity }} />
      <motion.circle cx={METER_X + 30} cy={meterY(HIT_LINE)} r={3.6} fill="currentColor" style={{ opacity: lampOn }} />
    </>
  );
}

function Running() {
  const time = useTime();
  return <Scene time={time} />;
}

function Still() {
  const time = useMotionValue(STILL_MS);
  return <Scene time={time} />;
}

function IntroLoop() {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.2 });
  const reduce = useReducedMotion();
  return (
    <svg ref={ref} viewBox={VIEW} className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {inView && !reduce ? <Running /> : <Still />}
    </svg>
  );
}

/* ── Tile: still, one hover motion ────────────────────────────────── */

function Tile() {
  return (
    <svg viewBox={VIEW} className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <DrumBody />
      {/* On hover the drum lights as the hand lands on it. */}
      <ellipse
        cx={CX}
        cy={DRUM_TOP_Y}
        rx={DRUM_RX - 2}
        ry={DRUM_RY - 1.5}
        fill="currentColor"
        className="opacity-0 transition-opacity delay-200 duration-300 ease-out group-hover/tile:opacity-100"
      />
      <g className="art-move group-hover/tile:translate-y-[40px]">
        <Hand />
        <circle cx={PALM[0]} cy={PALM[1]} r={PALM_R} fill="none" stroke="currentColor" strokeWidth={3.4} />
      </g>
      <g transform={`translate(${NOTE_AT[0]} ${NOTE_AT[1]})`}>
        <g className="art-move opacity-0 group-hover/tile:-translate-y-6 group-hover/tile:-rotate-6 group-hover/tile:opacity-100">
          <Note />
        </g>
      </g>
      <MeterFrame />
      <rect x={METER_X - 8} y={meterY(0.1)} width={16} height={METER_BOTTOM - meterY(0.1)} rx={8} fill="currentColor" fillOpacity={0.4} />
      <circle cx={METER_X + 30} cy={meterY(HIT_LINE)} r={3.6} fill="currentColor" />
    </svg>
  );
}

export function AirStudioArt({ mode = "tile" }: ArtProps) {
  return mode === "intro" ? <IntroLoop /> : <Tile />;
}
