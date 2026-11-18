"use client";

import { motion, useInView, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, type RefObject } from "react";
import type { ArtProps } from "../game-art";

/**
 * A face as the model sees it: landmark points, with the eye line that
 * steers. The tile is a still picture whose hover tilts the head, the
 * platform and the ball. The intro is a looping, wordless breakdown: the
 * head tilts, the eye line's angle opens up, the ball rolls that way; the
 * mouth opens, the lip gap lights up, the ball jumps.
 */
/** Two decimals, so server and browser maths render identical attributes. */
const round = (v: number) => Math.round(v * 100) / 100;

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, n: number, from = 0, to = Math.PI * 2) {
  return Array.from({ length: n }, (_, i) => {
    const a = from + ((to - from) * i) / (to - from >= Math.PI * 2 ? n : n - 1);
    return [round(cx + Math.cos(a) * rx), round(cy + Math.sin(a) * ry)] as const;
  });
}

const OVAL = ellipsePoints(0, 0, 56, 72, 34);
const LEFT_EYE = ellipsePoints(-22, -14, 10, 5.5, 8);
const RIGHT_EYE = ellipsePoints(22, -14, 10, 5.5, 8);
const LEFT_BROW = ellipsePoints(-23, -24, 14, 7, 5, Math.PI * 1.15, Math.PI * 1.85);
const RIGHT_BROW = ellipsePoints(23, -24, 14, 7, 5, Math.PI * 1.15, Math.PI * 1.85);
const NOSE: (readonly [number, number])[] = [
  [0, -10],
  [0, -1],
  [0, 8],
  [-6, 14],
  [0, 16],
  [6, 14],
];
const MOUTH = ellipsePoints(0, 38, 15, 10, 12);
/** For the intro, the mouth as two lips that part. */
const UPPER_LIP = ellipsePoints(0, 36, 16, 7, 7, Math.PI, Math.PI * 2);
const LOWER_LIP = ellipsePoints(0, 36, 16, 7, 7, 0, Math.PI);

export function FaceControlArt({ mode = "tile" }: ArtProps) {
  return mode === "intro" ? <FaceControlIntro /> : <FaceControlTile />;
}

function FaceControlTile() {
  return (
    <svg viewBox="72 40 396 196" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {/* Head */}
      <g transform="translate(150 126) rotate(-13)">
        <g className="art-move group-hover/tile:rotate-[26deg]">
          {OVAL.map(([x, y], i) => (
            <circle key={`o${i}`} cx={x} cy={y} r={3.1} fill="currentColor" />
          ))}
          {[...LEFT_BROW, ...RIGHT_BROW].map(([x, y], i) => (
            <circle key={`b${i}`} cx={x} cy={y} r={2.6} fill="currentColor" fillOpacity={0.8} />
          ))}
          {[...LEFT_EYE, ...RIGHT_EYE].map(([x, y], i) => (
            <circle key={`e${i}`} cx={x} cy={y} r={2.3} fill="currentColor" />
          ))}
          {NOSE.map(([x, y], i) => (
            <circle key={`n${i}`} cx={x} cy={y} r={2.3} fill="currentColor" fillOpacity={0.8} />
          ))}
          {MOUTH.map(([x, y], i) => (
            <circle key={`m${i}`} cx={x} cy={y} r={2.6} fill="currentColor" />
          ))}
          {/* The eye line: the number that steers. */}
          <path d="M-52 -14H52" stroke="white" strokeWidth={4} strokeLinecap="round" />
          <circle cx={-22} cy={-14} r={5.5} fill="white" stroke="currentColor" strokeWidth={2.5} />
          <circle cx={22} cy={-14} r={5.5} fill="white" stroke="currentColor" strokeWidth={2.5} />
          {/* The mouth gap: the number that jumps. */}
          <path d="M0 29v18" stroke="white" strokeWidth={3.5} strokeLinecap="round" />
        </g>
      </g>

      {/* Level reference */}
      <path d="M86 112H214" stroke="currentColor" strokeOpacity={0.35} strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" />

      {/* Platform and ball */}
      <g transform="translate(370 186)">
        <g transform="rotate(-12)">
          <g className="art-move group-hover/tile:rotate-[24deg]">
            <rect x={-86} y={-6} width={172} height={12} rx={6} fill="currentColor" />
          </g>
        </g>
        <g className="art-move group-hover/tile:translate-x-[116px]">
          <circle cx={-58} cy={-6} r={17} fill="white" stroke="currentColor" strokeWidth={3.5} />
          <path d="M-66 -12a10 10 0 0 1 10-4" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" fill="none" />
        </g>
        <g className="art-move group-hover/tile:opacity-0">
          <path d="M-28 -30h20M-24 -20h14M-30 -10h22" stroke="currentColor" strokeOpacity={0.5} strokeWidth={3} strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

/* ── The intro loop ──────────────────────────────────────────────── */

/** One loop, in seconds: tilt right and roll, jump the spikes, take the spark; tilt left, roll back, jump again. */
const LOOP = 8;
/** The frame held under reduced motion: head tilted right, mouth open, ball over the spikes. */
const STILL = 2.2;

const easeIn = (u: number) => u * u * u;
const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const linear = (u: number) => u;

/** Piecewise keyframes on the loop clock (seconds), one easing per segment. */
function useKeys(t: MotionValue<number>, times: number[], values: number[], eases?: ((u: number) => number)[]) {
  return useTransform(t, times, values, { ease: eases ?? easeInOut, clamp: true });
}

/**
 * Keeps an SVG transform attribute in step with a motion value. SVG rotates
 * and scales around the group's own origin this way, which CSS transforms on
 * SVG (relative to the bounding box) can't do reliably. The first value is
 * rendered in the markup, so the server's still frame already has it.
 */
function useSvgTransform(ref: RefObject<SVGGElement | null>, value: MotionValue<number>, format: (v: number) => string) {
  useMotionValueEvent(value, "change", (v) => ref.current?.setAttribute("transform", format(v)));
}

/** Face position and the eye-line pivot (the midpoint between the eyes). */
const FACE = { x: 200, y: 106, eyeY: -14 };
const PLATFORM = { y: 262, left: 62, right: 338 };
const BALL_R = 15;
const BALL_Y = PLATFORM.y - 5 - BALL_R;

const headTransform = (deg: number) => `rotate(${deg.toFixed(2)})`;
const flipTransform = (facing: number) => `scale(${facing} 1)`;
/** Platform units to SVG: the ball travels from -90 (left end) to 85 (right end); the spikes sit at 0. */
const bx = (x: number) => 200 + x * 1.32;
const starTransform = (shown: number) => `translate(${bx(84)} ${BALL_Y - 2}) scale(${(0.6 + shown * 0.4).toFixed(3)})`;

function FaceControlIntro() {
  const ref = useRef<SVGSVGElement>(null);
  const head = useRef<SVGGElement>(null);
  const flip = useRef<SVGGElement>(null);
  const star = useRef<SVGGElement>(null);
  const inView = useInView(ref, { amount: 0.25 });
  const reduce = useReducedMotion();
  const t = useMotionValue(STILL);

  useEffect(() => {
    if (!inView || reduce) {
      if (reduce) t.set(STILL);
      return;
    }
    let raf = 0;
    const start = performance.now() - t.get() * 1000;
    const tick = (now: number) => {
      t.set((((now - start) / 1000) % LOOP + LOOP) % LOOP);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, t]);

  // Head tilt in degrees (+ = toward the visitor's right, as in a mirror).
  const tilt = useKeys(t, [0, 0.6, 1.0, 3.0, 3.4, 4.4, 4.8, 6.8, 7.2, LOOP], [0, 0, 16, 16, 0, 0, -16, -16, 0, 0]);
  // Ball along the platform: from rest, across the spikes at a steady speed, easing to a stop.
  const x = useKeys(
    t,
    [0, 1.0, 1.9, 2.5, 3.4, 4.6, 5.5, 6.1, 7.2, LOOP],
    [-90, -90, -35, 35, 85, 85, 35, -35, -90, -90],
    [linear, easeIn, linear, easeOut, linear, easeIn, linear, easeOut, linear],
  );
  const lift = useKeys(t, [0, 1.9, 2.2, 2.5, 5.5, 5.8, 6.1, LOOP], [0, 0, -38, 0, 0, -38, 0, 0], [linear, easeOut, easeIn, linear, easeOut, easeIn, linear]);
  // The mouth opens just before each jump: crossing the jump line is what fires it.
  const mouth = useKeys(t, [0, 1.72, 1.9, 2.3, 2.5, 5.32, 5.5, 5.9, 6.1, LOOP], [0, 0, 1, 1, 0, 0, 1, 1, 0, 0]);
  const spark = useKeys(t, [0, 3.1, 3.3, 6.9, 7.5, LOOP], [1, 1, 0, 0, 1, 1]);
  const burst = useKeys(t, [0, 3.1, 3.55, LOOP], [0, 0, 1, 1], [linear, easeOut, linear]);
  const streaks = useKeys(t, [0, 1.3, 1.8, 2.8, 3.2, 4.9, 5.4, 6.4, 6.8, LOOP], [0, 0, 0.55, 0.55, 0, 0, 0.55, 0.55, 0, 0]);

  const ballX = useTransform(x, bx);
  const ballY = useTransform(lift, (v) => BALL_Y + v);
  const roll = useTransform(x, (v) => (v * 1.32 * 180) / (Math.PI * BALL_R));
  const facing = useTransform(t, (s): number => (s < 4 ? 1 : -1));
  const shadowScale = useTransform(lift, (v) => 1 + v / 70);
  const arc = useTransform(tilt, (deg) => {
    const a = (deg * Math.PI) / 180;
    const r = 70;
    const cx = FACE.x;
    const cy = FACE.y + FACE.eyeY;
    const ex = cx + Math.cos(a) * r;
    const ey = cy + Math.sin(a) * r;
    return `M ${cx + r} ${cy} A ${r} ${r} 0 0 ${deg >= 0 ? 1 : 0} ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  });
  const arcOpacity = useTransform(tilt, (deg) => Math.min(1, Math.abs(deg) / 6));
  const upper = useTransform(mouth, (m) => -3 * m);
  const lower = useTransform(mouth, (m) => 9 * m);
  const gapY1 = useTransform(mouth, (m) => 36 - 3 * m);
  const gapY2 = useTransform(mouth, (m) => 36 + 9 * m);
  useSvgTransform(head, tilt, headTransform);
  useSvgTransform(flip, facing, flipTransform);
  useSvgTransform(star, spark, starTransform);
  const burstR = useTransform(burst, (v) => 8 + v * 26);
  const burstOpacity = useTransform(burst, (v) => (v <= 0 || v >= 1 ? 0 : 1 - v));

  return (
    <svg ref={ref} viewBox="20 18 360 276" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {/* The level: where the eye line would be if the head were straight. */}
      <path
        d={`M${FACE.x - 96} ${FACE.y + FACE.eyeY}H${FACE.x + 96}`}
        stroke="currentColor"
        strokeOpacity={0.35}
        strokeWidth={2}
        strokeDasharray="2 6"
        strokeLinecap="round"
      />
      {/* The angle the game reads. */}
      <motion.path d={arc} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" style={{ opacity: arcOpacity }} />

      {/* The head, pivoting on the point between the eyes. */}
      <g transform={`translate(${FACE.x} ${FACE.y + FACE.eyeY})`}>
        <g ref={head} transform={headTransform(tilt.get())}>
          <g transform={`translate(0 ${-FACE.eyeY})`}>
            {OVAL.map(([cx, cy], i) => (
              <circle key={`o${i}`} cx={cx} cy={cy} r={3.1} fill="currentColor" />
            ))}
            {[...LEFT_BROW, ...RIGHT_BROW].map(([cx, cy], i) => (
              <circle key={`b${i}`} cx={cx} cy={cy} r={2.6} fill="currentColor" fillOpacity={0.8} />
            ))}
            {[...LEFT_EYE, ...RIGHT_EYE].map(([cx, cy], i) => (
              <circle key={`e${i}`} cx={cx} cy={cy} r={2.3} fill="currentColor" />
            ))}
            {NOSE.map(([cx, cy], i) => (
              <circle key={`n${i}`} cx={cx} cy={cy} r={2.3} fill="currentColor" fillOpacity={0.8} />
            ))}
            <motion.g style={{ y: upper }}>
              {UPPER_LIP.map(([cx, cy], i) => (
                <circle key={`u${i}`} cx={cx} cy={cy} r={2.6} fill="currentColor" />
              ))}
            </motion.g>
            <motion.g style={{ y: lower }}>
              {LOWER_LIP.map(([cx, cy], i) => (
                <circle key={`l${i}`} cx={cx} cy={cy} r={2.6} fill="currentColor" />
              ))}
            </motion.g>
            {/* The lip gap: the number that jumps. */}
            <motion.line x1={0} x2={0} y1={gapY1} y2={gapY2} stroke="white" strokeWidth={4} strokeLinecap="round" style={{ opacity: mouth }} />
            {/* The eye line: the number that steers. */}
            <path d="M-54 -14H54" stroke="white" strokeWidth={4} strokeLinecap="round" />
            <circle cx={-22} cy={-14} r={5.5} fill="white" stroke="currentColor" strokeWidth={2.5} />
            <circle cx={22} cy={-14} r={5.5} fill="white" stroke="currentColor" strokeWidth={2.5} />
          </g>
        </g>
      </g>

      {/* The world: a platform with spikes in the middle and a spark at the far end. */}
      <rect x={PLATFORM.left} y={PLATFORM.y - 5} width={PLATFORM.right - PLATFORM.left} height={11} rx={5.5} fill="currentColor" />
      <path d="M186 257l7-15 7 15M200 257l7-15 7 15" fill="currentColor" />
      <motion.g style={{ opacity: spark }}>
        <g ref={star} transform={starTransform(spark.get())}>
          <path
            d="M0 -13L3.4 -3.4 13 0 3.4 3.4 0 13 -3.4 3.4 -13 0 -3.4 -3.4Z"
            fill="white"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinejoin="round"
          />
        </g>
      </motion.g>
      <motion.circle cx={bx(84)} cy={BALL_Y - 2} r={burstR} fill="none" stroke="white" strokeWidth={2.5} style={{ opacity: burstOpacity }} />

      {/* The ball, its shadow and its speed. */}
      <motion.ellipse cx={ballX} cy={PLATFORM.y - 6} rx={13} ry={2.6} fill="currentColor" fillOpacity={0.25} style={{ scale: shadowScale }} />
      <motion.g style={{ x: ballX, y: ballY }}>
        <motion.g style={{ opacity: streaks }}>
          <g ref={flip} transform={flipTransform(facing.get())}>
            <path d="M-40 -8h14M-44 1h18M-38 10h12" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
          </g>
        </motion.g>
        <motion.g style={{ rotate: roll }}>
          <circle r={BALL_R} fill="white" stroke="currentColor" strokeWidth={3.5} />
          <path d="M-9 -5a10 10 0 0 1 10-5" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" fill="none" />
          <circle cx={0} cy={8} r={2.2} fill="currentColor" />
        </motion.g>
      </motion.g>
    </svg>
  );
}
