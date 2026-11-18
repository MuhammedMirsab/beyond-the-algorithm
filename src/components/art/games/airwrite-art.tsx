"use client";

import { motion, useInView, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { useEffect, useRef, type CSSProperties } from "react";
import type { ArtProps } from "../game-art";

/**
 * The 21 hand landmarks with the index fingertip as a pen, finishing the
 * word "hi". The tile is a still picture whose hover rewrites it and dots the
 * i. The intro is a looping, wordless breakdown of what the game does: a
 * fingertip writes "hi" (a pinch lifts the pen between letters), the ink
 * splits into two letters, each letter turns into a cloud of 32 points that
 * is scaled into a box and matched against a stored shape, and the word appears.
 */
const HAND: [number, number][] = [
  [328, 252],
  [300, 238],
  [274, 224],
  [256, 212],
  [242, 204],
  [286, 196],
  [252, 176],
  [226, 166],
  [200, 156],
  [308, 190],
  [292, 166],
  [278, 178],
  [282, 194],
  [326, 190],
  [314, 168],
  [302, 180],
  [306, 196],
  [344, 198],
  [338, 180],
  [328, 188],
  [330, 202],
];

const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const INK =
  "M52 212C62 172 68 118 80 98C88 86 98 98 92 118L80 212C88 182 106 160 120 164C132 168 126 196 130 206C134 216 154 212 166 200C176 190 184 176 190 168C194 162 197 159 200 156";

export function AirWriteArt({ mode = "tile" }: ArtProps) {
  return mode === "intro" ? <AirWriteIntro /> : <AirWriteTile />;
}

function AirWriteTile() {
  return (
    <svg viewBox="84 66 320 196" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <g transform="translate(40 -6)">
        <path
          d={INK}
          fill="none"
          stroke="white"
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={600}
          strokeDasharray={600}
          className="group-hover/tile:animate-[art-draw_1.1s_var(--ease-out)_both]"
          style={{ "--art-length": 600 } as CSSProperties}
        />
        <circle cx={204} cy={128} r={6} fill="white" className="opacity-0 group-hover/tile:animate-[art-pop_1.5s_var(--ease-out)_both]" style={{ transformBox: "fill-box", transformOrigin: "center" }} />

        {BONES.map(([a, b]) => (
          <path key={`${a}-${b}`} d={`M${HAND[a][0]} ${HAND[a][1]}L${HAND[b][0]} ${HAND[b][1]}`} stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" />
        ))}
        {HAND.map(([x, y], i) =>
          i === 8 ? null : <circle key={i} cx={x} cy={y} r={4.6} fill="white" stroke="currentColor" strokeWidth={2.4} />,
        )}
        {/* The pen: index fingertip, landmark 8. */}
        <circle cx={HAND[8][0]} cy={HAND[8][1]} r={9} fill="white" stroke="currentColor" strokeWidth={3.2} />
        <circle cx={HAND[8][0]} cy={HAND[8][1]} r={3} fill="currentColor" />
      </g>
    </svg>
  );
}

/* ── The intro loop ──────────────────────────────────────────────── */

type P = [number, number];
type Polyline = P[];

const r2 = (v: number) => Math.round(v * 100) / 100;

function arcPoints(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): Polyline {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [r2(cx + Math.cos(a) * rx), r2(cy + Math.sin(a) * ry)];
  });
}

/** "h" as one pen-down stroke: down the stem, back up, over the arch and down. */
const H_STROKE: Polyline = [[88, 52], [88, 150], [88, 112], ...arcPoints(110, 112, 22, 16, 180, 360, 14), [132, 150]];
const I_STEM: Polyline = [[168, 98], [168, 150]];
const I_DOT: P = [168, 76];

const length = (line: Polyline) => line.reduce((n, p, i) => (i ? n + Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1]) : 0), 0);

/** The point a fraction `u` of the way along a polyline. */
function along(line: Polyline, u: number): P {
  const total = length(line);
  let left = Math.min(1, Math.max(0, u)) * total;
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    const d = Math.hypot(x1 - x0, y1 - y0);
    if (left <= d || i === line.length - 1) {
      const k = d ? Math.min(1, left / d) : 0;
      return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
    }
    left -= d;
  }
  return line[line.length - 1];
}

/** n evenly spaced points over several strokes, like the recogniser's resampling. */
function resample(strokes: Polyline[], n = 32): P[] {
  const total = strokes.reduce((s, line) => s + length(line), 0);
  const out: P[] = [];
  for (const line of strokes) {
    const share = Math.max(1, Math.round((length(line) / total) * n));
    for (let i = 0; i < share && out.length < n; i++) out.push(along(line, share === 1 ? 0.5 : i / (share - 1)));
  }
  while (out.length < n) out.push(out[out.length - 1]);
  return out.map(([x, y]) => [r2(x), r2(y)]);
}

const H_DOTS = resample([H_STROKE]);
const I_DOTS = resample([I_STEM, [I_DOT, [I_DOT[0], I_DOT[1] + 4]]]);

/** Where each letter's cloud lands: a square below, scaled and centred like the recogniser does. */
const BOXES = [
  { x: 64, y: 196, size: 64 },
  { x: 140, y: 196, size: 64 },
];

function boxFit(dots: P[], box: { x: number; y: number; size: number }) {
  const xs = dots.map((d) => d[0]);
  const ys = dots.map((d) => d[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  const scale = (box.size - 16) / Math.max(w, h, 1);
  return {
    dx: box.x + box.size / 2 - (minX + w / 2),
    dy: box.y + box.size / 2 - (minY + h / 2),
    scale,
  };
}
const FITS = [boxFit(H_DOTS, BOXES[0]), boxFit(I_DOTS, BOXES[1])];

/** The library's own "h" and "i", as clouds inside the boxes: the shapes they get matched against. */
const LIBRARY = [
  resample([
    [[0, 0], [0, 100]],
    [[0, 62], ...arcPoints(33, 62, 33, 24, 180, 360, 10), [66, 100]],
  ]),
  resample([[[0, 32], [0, 100]], [[0, 4], [0, 10]]]),
].map((dots, i) => {
  const box = BOXES[i];
  const xs = dots.map((d) => d[0]);
  const ys = dots.map((d) => d[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const s = (box.size - 16) / Math.max(w, h, 1);
  const ox = box.x + box.size / 2 - (Math.min(...xs) + w / 2) * s;
  const oy = box.y + box.size / 2 - (Math.min(...ys) + h / 2) * s;
  return dots.map(([x, y]) => [r2(ox + x * s), r2(oy + y * s)] as P);
});

/** The hand, moved so the index fingertip (landmark 8) is at the origin, at 70% size. */
const HAND_SCALE = 0.62;
const TIP = HAND[8];
const HAND_LOCAL = HAND.map(([x, y]) => [r2((x - TIP[0]) * HAND_SCALE), r2((y - TIP[1]) * HAND_SCALE)] as P);

const LOOP = 8.4;
/** Under reduced motion: everything at once, the word read and the clouds matched. */
const STILL = 6.6;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (s: number, a: number, b: number) => clamp01((s - a) / (b - a));
const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

interface Scene {
  pen: P;
  /** 0 pen down (writing), 1 pinched (pen lifted). */
  pinch: number;
  hand: number;
  h: number;
  i: number;
  dot: number;
  boxes: number;
  /** Ink fading as the clouds take over. */
  ink: number;
  dots: number;
  /** 0 on the ink, 1 scaled into the boxes. */
  fit: number;
  library: number;
  word: number;
  fade: number;
}

/** Everything at time s (seconds into the loop). */
function scene(s: number): Scene {
  const hEnd = H_STROKE[H_STROKE.length - 1];
  const iEnd = I_STEM[1];
  let pen: P;
  let pinch = 0;
  if (s < 0.4) pen = H_STROKE[0];
  else if (s < 2.0) pen = along(H_STROKE, easeInOut(seg(s, 0.4, 2.0)));
  else if (s < 2.45) {
    pinch = 1;
    const k = easeInOut(seg(s, 2.0, 2.45));
    pen = [lerp(hEnd[0], I_STEM[0][0], k), lerp(hEnd[1], I_STEM[0][1], k) - Math.sin(k * Math.PI) * 14];
  } else if (s < 2.95) pen = along(I_STEM, easeInOut(seg(s, 2.45, 2.95)));
  else if (s < 3.35) {
    pinch = 1;
    const k = easeInOut(seg(s, 2.95, 3.35));
    pen = [lerp(iEnd[0], I_DOT[0], k), lerp(iEnd[1], I_DOT[1], k)];
  } else if (s < 3.55) pen = I_DOT;
  else {
    pinch = 1;
    const k = easeOut(seg(s, 3.55, 4.1));
    pen = [lerp(I_DOT[0], I_DOT[0] + 70, k), lerp(I_DOT[1], I_DOT[1] + 40, k)];
  }
  // Pinches ease in and out a little so the thumb visibly travels.
  if (s >= 1.9 && s < 2.0) pinch = seg(s, 1.9, 2.0);
  if (s >= 2.45 && s < 2.55) pinch = 1 - seg(s, 2.45, 2.55);
  if (s >= 2.85 && s < 2.95) pinch = seg(s, 2.85, 2.95);
  if (s >= 3.35 && s < 3.45) pinch = 1 - seg(s, 3.35, 3.45);

  const fade = 1 - seg(s, 7.6, 8.2);
  return {
    pen,
    pinch,
    hand: Math.min(seg(s, 0, 0.3), 1 - seg(s, 3.7, 4.2)),
    h: seg(s, 0.4, 2.0) === 0 ? 0 : easeInOut(seg(s, 0.4, 2.0)),
    i: easeInOut(seg(s, 2.45, 2.95)),
    dot: s >= 3.45 ? 1 : 0,
    boxes: easeOut(seg(s, 4.1, 4.5)) * (1 - seg(s, 5.4, 5.8)),
    ink: 1 - 0.75 * seg(s, 4.7, 5.1),
    dots: easeOut(seg(s, 4.6, 5.0)),
    fit: easeInOut(seg(s, 5.2, 6.0)),
    library: easeOut(seg(s, 5.9, 6.3)),
    word: easeOut(seg(s, 6.3, 6.8)),
    fade,
  };
}

function useSceneValue(scene: MotionValue<Scene>, pick: (s: Scene) => number) {
  return useTransform(scene, pick);
}

function AirWriteIntro() {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.25 });
  const reduce = useReducedMotion();
  const clock = useMotionValue(STILL);
  const state = useTransform(clock, scene);

  useEffect(() => {
    if (!inView || reduce) {
      if (reduce) clock.set(STILL);
      return;
    }
    let raf = 0;
    const start = performance.now() - clock.get() * 1000;
    const tick = (now: number) => {
      clock.set(((now - start) / 1000) % LOOP);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, clock]);

  const penX = useSceneValue(state, (s) => s.pen[0]);
  const penY = useSceneValue(state, (s) => s.pen[1]);
  const pinch = useSceneValue(state, (s) => s.pinch);
  const hand = useSceneValue(state, (s) => s.hand);
  const h = useSceneValue(state, (s) => s.h);
  const i = useSceneValue(state, (s) => s.i);
  const dot = useSceneValue(state, (s) => s.dot);
  const boxes = useSceneValue(state, (s) => s.boxes);
  const ink = useSceneValue(state, (s) => s.ink);
  const dots = useSceneValue(state, (s) => s.dots);
  const fit = useSceneValue(state, (s) => s.fit);
  const library = useSceneValue(state, (s) => s.library);
  const word = useSceneValue(state, (s) => s.word);
  const fade = useSceneValue(state, (s) => s.fade);

  // The thumb tip travels to the index tip on a pinch: that is what lifts the pen.
  const thumbX = useTransform(pinch, (k) => lerp(HAND_LOCAL[4][0], 4, k));
  const thumbY = useTransform(pinch, (k) => lerp(HAND_LOCAL[4][1], 5, k));
  const thumbBone = useTransform([thumbX, thumbY], ([x, y]: number[]) => `M${HAND_LOCAL[3][0]} ${HAND_LOCAL[3][1]}L${x.toFixed(2)} ${y.toFixed(2)}`);
  const nib = useTransform(pinch, (k) => (k > 0.5 ? 0 : 1));
  const ring = useTransform(pinch, (k) => (k > 0.5 ? 1 : 0));
  const hX = useTransform(fit, (k) => FITS[0].dx * k);
  const hY = useTransform(fit, (k) => FITS[0].dy * k);
  const hScale = useTransform(fit, (k) => 1 + (FITS[0].scale - 1) * k);
  const iX = useTransform(fit, (k) => FITS[1].dx * k);
  const iY = useTransform(fit, (k) => FITS[1].dy * k);
  const iScale = useTransform(fit, (k) => 1 + (FITS[1].scale - 1) * k);
  const hShown = useTransform(h, (v) => (v > 0 ? 1 : 0));
  const iShown = useTransform(i, (v) => (v > 0 ? 1 : 0));
  const wordY = useTransform(word, (k) => 10 * (1 - k));
  const sure = useTransform(word, (k) => k * 0.86);

  return (
    <svg ref={ref} viewBox="40 34 330 252" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <motion.g style={{ opacity: fade }}>
        {/* The ink, written by the fingertip. */}
        <motion.g style={{ opacity: ink }}>
          <motion.path
            d={toPath(H_STROKE)}
            fill="none"
            stroke="white"
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pathLength: h, opacity: hShown }}
          />
          <motion.path
            d={toPath(I_STEM)}
            fill="none"
            stroke="white"
            strokeWidth={8}
            strokeLinecap="round"
            style={{ pathLength: i, opacity: iShown }}
          />
          <motion.circle cx={I_DOT[0]} cy={I_DOT[1]} r={5} fill="white" style={{ opacity: dot }} />
        </motion.g>

        {/* Split: one box per letter. */}
        <motion.g style={{ opacity: boxes }} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="5 4">
          <rect x={74} y={40} width={72} height={124} rx={6} />
          <rect x={154} y={62} width={28} height={102} rx={6} />
        </motion.g>

        {/* Each letter as 32 points, then scaled and centred into its box. */}
        <motion.g style={{ x: hX, y: hY, scale: hScale, opacity: dots }}>
          {H_DOTS.map(([x, y], k) => (
            <circle key={k} cx={x} cy={y} r={3.6} fill="currentColor" />
          ))}
        </motion.g>
        <motion.g style={{ x: iX, y: iY, scale: iScale, opacity: dots }}>
          {I_DOTS.map(([x, y], k) => (
            <circle key={k} cx={x} cy={y} r={3.6} fill="currentColor" />
          ))}
        </motion.g>
        <motion.g style={{ opacity: library }}>
          {BOXES.map((box, n) => (
            <rect key={n} x={box.x} y={box.y} width={box.size} height={box.size} rx={10} fill="white" fillOpacity={0.22} />
          ))}
          {LIBRARY.map((cloud, n) =>
            cloud.map(([x, y], k) => <circle key={`${n}-${k}`} cx={x} cy={y} r={2.6} fill="white" />),
          )}
        </motion.g>

        {/* The word it read. */}
        <motion.text
          x={292}
          y={250}
          textAnchor="middle"
          className="fill-current font-sans text-[64px] font-extrabold"
          style={{ opacity: word, y: wordY, letterSpacing: "-0.03em" }}
        >
          hi
        </motion.text>
        {/* How sure: a bar that fills as the word appears. */}
        <motion.path d="M250 268h84" stroke="currentColor" strokeOpacity={0.22} strokeWidth={6} strokeLinecap="round" style={{ opacity: word }} />
        <motion.path d="M250 268h84" stroke="white" strokeWidth={6} strokeLinecap="round" style={{ opacity: word, pathLength: sure }} />

        {/* The hand: 21 points, the index fingertip is the pen. */}
        <motion.g style={{ x: penX, y: penY, opacity: hand }}>
          {BONES.filter(([a, b]) => !(a === 3 && b === 4)).map(([a, b]) => (
            <path
              key={`${a}-${b}`}
              d={`M${HAND_LOCAL[a][0]} ${HAND_LOCAL[a][1]}L${HAND_LOCAL[b][0]} ${HAND_LOCAL[b][1]}`}
              stroke="currentColor"
              strokeWidth={2.6}
              strokeLinecap="round"
            />
          ))}
          <motion.path d={thumbBone} stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
          {HAND_LOCAL.map(([x, y], k) =>
            k === 8 || k === 4 ? null : <circle key={k} cx={x} cy={y} r={3.4} fill="white" stroke="currentColor" strokeWidth={2} />,
          )}
          <motion.circle cx={thumbX} cy={thumbY} r={3.6} fill="white" stroke="currentColor" strokeWidth={2} />
          {/* Pen down: a filled nib. Pen lifted: an empty ring. */}
          <circle r={8} fill="white" stroke="currentColor" strokeWidth={2.8} />
          <motion.circle r={3.4} fill="currentColor" style={{ opacity: nib }} />
          <motion.circle r={12.5} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="3 3" style={{ opacity: ring }} />
        </motion.g>
      </motion.g>
    </svg>
  );
}

function toPath(line: Polyline) {
  return line.map(([x, y], k) => `${k ? "L" : "M"}${x} ${y}`).join("");
}

