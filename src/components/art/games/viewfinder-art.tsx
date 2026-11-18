"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef } from "react";
import type { ArtProps } from "../game-art";

/**
 * Finger frame: two hands make L shapes, their four fingertips become the
 * corners of a frame, and whatever is inside the frame is redrawn by a filter.
 *
 * - tile: a still picture (dots inside the frame). Hovering the tile wipes the
 *   inside to pixel art.
 * - intro: a wordless, looping breakdown. The hands come up; the AI's 21
 *   points land on each; the 4 fingertips light up and lock into a frame;
 *   the inside turns to dots; each right-hand pinch switches the filter
 *   (pixels, text, cartoon, whose eyes grow); the frame moves with the hands
 *   while the picture stays put. Pauses off screen; holds a still frame
 *   (mid-switch) under reduced motion.
 *
 * Drawn in game-ink on the game colour, white for what the machine draws.
 * One rAF loop writes a handful of attributes per frame, only when they change.
 */

type P = readonly [number, number];

const W = 480;
const H = 400;
const CX = W / 2;

// ───────────────────────────── the hands

/**
 * The left hand, raised, palm to the camera (scene px), in MediaPipe's order:
 * wrist, thumb 1 to 4, index 5 to 8, middle, ring and little finger (curled).
 * Index up and leaning in, thumb out toward the middle: an L. The right hand
 * is its mirror image about the centre line.
 */
const LH: readonly P[] = [
  [112, 318],
  [122, 300], [140, 292], [158, 287], [176, 284],
  [132, 245], [135.8, 207], [138.8, 178], [141, 155],
  [116, 247], [115, 227], [118.5, 237], [121.5, 248],
  [101, 252], [99.5, 234], [102.5, 244], [105.5, 254],
  [88, 262], [85.5, 247], [88.5, 256], [91.5, 265],
];

const BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const THUMB = [1, 2, 3, 4] as const;
const INDEX = [5, 6, 7, 8] as const;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const THUMB_PIVOT = LH[1];
const INDEX_PIVOT = LH[5];
/** How far below their raised pose the hands start (off the bottom edge). */
const RISE = 380;
/** The intro's view: cropped to the hands and the frame. Content past it (arms, dots) runs on to the panel's edges. */
const INTRO_VIEW = "56 92 368 308";

const isThumb = (i: number) => i >= 1 && i <= 4;
const isIndex = (i: number) => i >= 5 && i <= 8;
const isCorner = (i: number) => i === THUMB_TIP || i === INDEX_TIP;

function rotateAbout([x, y]: P, [cx, cy]: P, deg: number): P {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}

const pts = (list: readonly P[]) => list.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
const round = (n: number) => Math.round(n * 10) / 10;

// ───────────────────────────── the picture

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A head-and-shoulders portrait under a sun, as brightness 0 to 1. */
function tone(x: number, y: number) {
  let v = 0.2 + 0.16 * (1 - y / H);
  if (Math.hypot(x - 394, y - 78) < 30) v = 0.95;
  const sh = ((x - CX) / 124) ** 2 + ((y - 382) / 94) ** 2;
  if (sh < 1) v = 0.4 + 0.12 * (1 - sh);
  if (Math.abs(x - CX) < 17 && y > 250 && y < 300) v = 0.66;
  const hd = ((x - CX) / 48) ** 2 + ((y - 212) / 58) ** 2;
  if (hd < 1) {
    v = 0.93 - 0.32 * hd;
    if (y < 190 + 5 * Math.sin((x - CX) / 8)) v = 0.1;
    if (Math.hypot(x - 221, y - 212) < 6.5 || Math.hypot(x - 259, y - 212) < 6.5) v = 0.04;
    if (Math.abs(x - CX) < 14 && Math.abs(y - (242 - 0.022 * (x - CX) ** 2)) < 2.6) v = 0.1;
  }
  return clamp01(v);
}

/** Where the filtered picture can appear (the frame's reach, drift included). */
const REGION = { x0: 96, y0: 118, x1: 384, y1: 300 };

const circle = (x: number, y: number, r: number) =>
  `M${round(x - r)} ${round(y)}a${round(r)} ${round(r)} 0 1 0 ${round(2 * r)} 0a${round(r)} ${round(r)} 0 1 0 ${round(-2 * r)} 0`;

/** The camera picture outside the frame: faint ink dots, softly fading out at the far edges. */
const WORLD = (() => {
  let d = "";
  for (let y = 22; y < H + 64; y += 12) {
    for (let x = 10; x < W; x += 12) {
      const edge = clamp01(Math.min(x - 4, y - 16, W - 4 - x, H + 70 - y) / 40);
      const r = (0.7 + 1.6 * tone(x, y)) * edge;
      if (r > 0.25) d += circle(x, y, r);
    }
  }
  return d;
})();

/** Filter 1, dots: one white dot per patch, bigger where the picture is brighter. */
const DOTS = (() => {
  let d = "";
  for (let y = REGION.y0 + 4; y < REGION.y1; y += 8) {
    for (let x = REGION.x0 + 4; x < REGION.x1; x += 8) d += circle(x, y, 0.45 + 3.15 * tone(x, y));
  }
  return d;
})();

/** Filter 2, pixel art: big square pixels in four shades. */
const PIXELS = (() => {
  const levels = ["", "", "", ""];
  const size = 14;
  for (let y = REGION.y0; y < REGION.y1; y += size) {
    for (let x = REGION.x0; x < REGION.x1; x += size) {
      let sum = 0;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) sum += tone(x + 2.5 + i * 4.5, y + 2.5 + j * 4.5);
      const level = Math.min(3, Math.floor((sum / 9) * 4));
      levels[level] += `M${x + 0.8} ${y + 0.8}h${size - 1.6}v${size - 1.6}h${-(size - 1.6)}z`;
    }
  }
  return levels;
})();
const PIXEL_ALPHA = [0.1, 0.36, 0.66, 0.96];

/** Filter 3, text: one character per patch, denser characters where it is brighter. */
const TEXT = (() => {
  const ramp = " .:-=+*#%@";
  const cw = 8;
  const ch = 11;
  const rows: { y: number; text: string; width: number }[] = [];
  for (let y = REGION.y0 + ch; y <= REGION.y1; y += ch) {
    let text = "";
    for (let x = REGION.x0; x < REGION.x1; x += cw) {
      const t = tone(x + cw / 2, y - ch / 2);
      text += ramp[Math.min(ramp.length - 1, Math.floor(Math.pow(t, 1.4) * 1.1 * ramp.length))];
    }
    rows.push({ y, text, width: text.length * cw });
  }
  return rows;
})();

// ───────────────────────────── the timeline (seconds)

const LOOP = 10.8;
const T_STILL = 4.25; // reduced motion and first paint: a pinch has just switched dots to pixel art
const T_TILE = 3.3; // the hub tile: dots in a locked frame

/** Filter switches: each starts its left-to-right wipe at `at`. */
const SWITCHES = [
  { at: 2.45, style: 0 },
  { at: 3.95, style: 1 },
  { at: 5.55, style: 2 },
  { at: 8.05, style: 3 },
] as const;
const WIPE = 0.5;
/** Right-hand pinches (start times); each one triggers the next switch. */
const PINCHES = [3.75, 5.35, 7.85] as const;
const PINCH = 0.45;

const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 4);
const easeInOut = (x: number) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2);
const easeOutBack = (x: number) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;

interface Pose {
  /** Hands: 0 below the picture, 1 raised. */
  rise: number;
  /** The frame (and both hands) moving together. */
  dx: number;
  dy: number;
  /** Right-hand pinch: thumb and index rotation (degrees, in the hand's own drawing). */
  thumb: number;
  index: number;
  /** Seconds since the landmarks started landing (drives the stagger), or -1. */
  pointsAt: number;
  /** 0..1: the 4 fingertips stand out, the other 38 points step back. */
  focus: number;
  /** 0..1: outline drawn, window darkened, corners locked. */
  frame: number;
  /** 0..1: corner brackets settling into place. */
  snap: number;
  /** Showing filter (0 dots, 1 pixels, 2 text, 3 cartoon) or -1, the one underneath during a wipe, and the wipe's progress. */
  style: number;
  under: number;
  wipe: number;
  /** Pinch ripple 0..1, or -1. */
  ripple: number;
  /** 0..1: the cartoon's eyes growing. */
  eyes: number;
  /** 0..1: everything machine-drawn fading at the end of the loop. */
  fade: number;
}

function pose(time: number): Pose {
  const t = ((time % LOOP) + LOOP) % LOOP;
  const exit = easeInOut(seg(t, 9.8, 10.45));
  const rise = easeOut(seg(t, 0, 0.9)) * (1 - exit);
  const drift = easeInOut(seg(t, 6.4, 7.5));

  let thumb = 0;
  let index = 0;
  let ripple = -1;
  for (const at of PINCHES) {
    const k = seg(t, at, at + PINCH);
    if (k > 0 && k < 1) {
      const close = k < 0.4 ? easeOut(k / 0.4) : 1 - easeInOut((k - 0.4) / 0.6);
      thumb = -42 * close;
      index = 26 * close;
    }
    const r = seg(t, at + 0.15, at + 0.7);
    if (r > 0 && r < 1) ripple = r;
  }

  let style = -1;
  let under = -1;
  let wipe = 1;
  for (const s of SWITCHES) {
    if (t >= s.at) {
      under = style;
      style = s.style;
      wipe = easeInOut(seg(t, s.at, s.at + WIPE));
    }
  }

  return {
    rise,
    dx: -34 * drift,
    dy: -12 * drift,
    thumb,
    index,
    pointsAt: t >= 0.85 ? t - 0.85 : -1,
    focus: easeInOut(seg(t, 1.6, 2.0)),
    frame: easeOut(seg(t, 2.0, 2.5)) * (1 - easeOut(seg(t, 9.7, 10.0))),
    snap: easeOut(seg(t, 2.3, 2.75)),
    style,
    under,
    wipe,
    ripple,
    eyes: easeOutBack(seg(t, 8.45, 8.95)),
    fade: 1 - easeOut(seg(t, 9.7, 10.0)),
  };
}

/** A landmark's size while they land one by one (hands in MediaPipe order, left then right). */
function landed(p: Pose, order: number) {
  if (p.pointsAt < 0) return 0;
  return easeOutBack(clamp01((p.pointsAt - order * 0.011) / 0.22));
}

/** Where each hand's landmarks are on screen for a pose (the right hand mirrored). */
function handPoints(p: Pose, side: "left" | "right"): P[] {
  const lift = (1 - p.rise) * RISE;
  const thumb = side === "right" ? p.thumb : 0;
  const index = side === "right" ? p.index : 0;
  return LH.map((pt, i) => {
    let q = pt;
    if (isThumb(i)) q = rotateAbout(pt, THUMB_PIVOT, thumb);
    else if (isIndex(i)) q = rotateAbout(pt, INDEX_PIVOT, index);
    const x = side === "right" ? W - q[0] : q[0];
    return [x + p.dx, q[1] + lift + p.dy] as const;
  });
}

/** The frame: both index tips on top, both thumb tips below (clockwise). */
function frameCorners(p: Pose): P[] {
  const l = handPoints(p, "left");
  const r = handPoints(p, "right");
  return [l[INDEX_TIP], r[INDEX_TIP], r[THUMB_TIP], l[THUMB_TIP]];
}

/** Viewfinder brackets at each corner, along both edges; longer while they snap into place. */
function bracketPath(c: P[], snap: number) {
  let d = "";
  const grow = 1 + 0.7 * (1 - snap);
  c.forEach((v, i) => {
    for (const o of [c[(i + 3) % 4], c[(i + 1) % 4]]) {
      const len = Math.hypot(o[0] - v[0], o[1] - v[1]);
      const k = (Math.min(24, len * 0.22) * grow) / Math.max(1, len);
      d += `M${round(v[0])} ${round(v[1])}L${round(v[0] + (o[0] - v[0]) * k)} ${round(v[1] + (o[1] - v[1]) * k)}`;
    }
  });
  return d;
}

// ───────────────────────────── drawing

const INK = "currentColor";
const STROKE = { stroke: INK, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;
const finger = (ids: readonly number[]) => pts(ids.map((i) => LH[i]));

/** Landmarks and the bones between them, drawn white on the ink hand (intro only). */
function Landmarks({
  ids,
  bones,
  still,
  h,
}: {
  ids: readonly number[];
  bones: ReadonlyArray<readonly [number, number]>;
  still: Pose;
  h: number;
}) {
  return (
    <g data-part="machine" opacity={round(still.fade)}>
      <g data-part="bones" stroke="white" strokeWidth={2} strokeLinecap="round" opacity={bonesOpacity(still, h)}>
        {bones.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={LH[a][0]} y1={LH[a][1]} x2={LH[b][0]} y2={LH[b][1]} />
        ))}
      </g>
      {ids.map((i) => (
        <circle
          key={i}
          data-point={i}
          cx={LH[i][0]}
          cy={LH[i][1]}
          r={landmarkR(still, i, h)}
          opacity={pointOpacity(still, i)}
          fill="white"
          stroke={INK}
          strokeWidth={2}
        />
      ))}
    </g>
  );
}

/** Bones that stay put during a pinch (those along the index and thumb turn with them). */
const STILL_BONES = BONES.filter(([a, b]) => !((isIndex(a) && isIndex(b)) || (isThumb(a) && isThumb(b))));
const INDEX_BONES = BONES.filter(([a, b]) => isIndex(a) && isIndex(b));
const THUMB_BONES = BONES.filter(([a, b]) => isThumb(a) && isThumb(b));
/** Pivot points (thumb base 1, index knuckle 5) never move, so they stay with the still points. */
const STILL_POINTS = LH.map((_, i) => i).filter((i) => !((isIndex(i) || isThumb(i)) && i !== 1 && i !== 5));

/**
 * One hand in ink, with (in the intro) its 21 landmarks on top. The index
 * finger and thumb sit in their own groups, landmarks included, so a pinch
 * can turn them. Parts are found by their data attributes.
 */
function HandDrawing({ points, still, h }: { points: boolean; still: Pose; h: number }) {
  return (
    <>
      <path d={`M104 312L94 ${H + 140}`} stroke={INK} strokeWidth={30} strokeLinecap="round" fill="none" />
      <polygon
        points={pts([LH[0], LH[1], LH[5], LH[9], LH[13], LH[17], [90, 302]])}
        fill={INK}
        stroke={INK}
        strokeWidth={14}
        strokeLinejoin="round"
      />
      <polyline points={finger([9, 10, 11, 12])} strokeWidth={13} {...STROKE} />
      <polyline points={finger([13, 14, 15, 16])} strokeWidth={12} {...STROKE} />
      <polyline points={finger([17, 18, 19, 20])} strokeWidth={11} {...STROKE} />
      <g data-part="index">
        <polyline points={finger(INDEX)} strokeWidth={14} {...STROKE} />
        {points ? <Landmarks ids={[6, 7, 8]} bones={INDEX_BONES} still={still} h={h} /> : null}
      </g>
      <g data-part="thumb">
        <polyline points={finger(THUMB)} strokeWidth={14} {...STROKE} />
        {points ? <Landmarks ids={[2, 3, 4]} bones={THUMB_BONES} still={still} h={h} /> : null}
      </g>
      {points ? <Landmarks ids={STILL_POINTS} bones={STILL_BONES} still={still} h={h} /> : null}
    </>
  );
}

/** A landmark's radius in a pose: corners grow, the rest shrink back once the frame matters. */
const landmarkR = (p: Pose, i: number, h: number) =>
  round(landed(p, 21 * h + i) * (isCorner(i) ? 4.6 + 2.6 * p.focus : 4.2 - 1.6 * p.focus));
const pointOpacity = (p: Pose, i: number) => (isCorner(i) ? 1 : round(1 - 0.55 * p.focus));
const bonesOpacity = (p: Pose, h: number) => round(Math.min(landed(p, 21 * h + 20), 1) * (0.85 - 0.6 * p.focus));

/** Writes an attribute only when its value changes (most frames change very little). */
function setAttr(el: Element | null | undefined, name: string, value: string | number) {
  if (!el) return;
  const v = String(value);
  if (el.getAttribute(name) !== v) el.setAttribute(name, v);
}

const EYE_Y = 214;
const eyeTransform = (x: number, scale: number) => `translate(${x} ${EYE_Y}) scale(${round(scale)}) translate(${-x} ${-EYE_Y})`;

/** The cartoon: flat shapes and big eyes (they grow as the filter lands). */
function Cartoon({ eyes }: { eyes: number }) {
  return (
    <g>
      <rect x={REGION.x0} y={REGION.y0} width={REGION.x1 - REGION.x0} height={REGION.y1 - REGION.y0} fill="white" opacity={0.07} />
      <circle cx={338} cy={150} r={20} fill="white" opacity={0.9} />
      <ellipse cx={CX} cy={384} rx={124} ry={92} fill="white" opacity={0.82} />
      <rect x={CX - 16} y={246} width={32} height={46} rx={10} fill="white" />
      <ellipse cx={CX} cy={212} rx={54} ry={60} fill="white" />
      <path
        d={`M${CX - 56} 206C${CX - 58} 150 ${CX + 58} 150 ${CX + 56} 206C${CX + 40} 180 ${CX - 6} 192 ${CX - 14} 172C${CX - 26} 190 ${CX - 44} 186 ${CX - 56} 206Z`}
        fill={INK}
      />
      <circle cx={CX - 33} cy={236} r={9} className="fill-game" opacity={0.85} />
      <circle cx={CX + 33} cy={236} r={9} className="fill-game" opacity={0.85} />
      <path d={`M${CX - 13} 243Q${CX} 254 ${CX + 13} 243`} stroke={INK} strokeWidth={3.5} strokeLinecap="round" fill="none" />
      {[CX - 20, CX + 20].map((x) => (
        <g key={x} data-part="eye" data-x={x} transform={eyeTransform(x, 0.55 + 0.45 * eyes)}>
          <ellipse cx={x} cy={EYE_Y} rx={11} ry={13} fill={INK} />
          <circle cx={x - 3.5} cy={EYE_Y - 5} r={3.6} fill="white" />
        </g>
      ))}
    </g>
  );
}

/** Where the wipe's edge is across the frame. */
function wipeEdge(c: P[], wipe: number) {
  const xs = c.map((v) => v[0]);
  const minX = Math.min(...xs) - 4;
  const maxX = Math.max(...xs) + 4;
  return { minX, edge: minX + (maxX - minX) * wipe };
}

/** The parts the intro loop moves, looked up once when the loop starts. */
function findParts(svg: SVGSVGElement) {
  const one = (sel: string) => svg.querySelector(sel);
  const all = (sel: string) => Array.from(svg.querySelectorAll(sel));
  const hand = (side: "left" | "right") => ({
    group: one(`[data-hand="${side}"]`),
    index: one(`[data-hand="${side}"] [data-part="index"]`),
    thumb: one(`[data-hand="${side}"] [data-part="thumb"]`),
    bones: all(`[data-hand="${side}"] [data-part="bones"]`),
    points: LH.map((_, i) => one(`[data-hand="${side}"] [data-point="${i}"]`)),
  });
  return {
    left: hand("left"),
    right: hand("right"),
    machine: all('[data-part="machine"]'),
    clip: one('[data-part="clip"]'),
    wipe: one('[data-part="wipe"]'),
    panel: one('[data-part="panel"]'),
    outline: one('[data-part="outline"]'),
    brackets: one('[data-part="brackets"]'),
    corners: all('[data-part="corner"]'),
    styles: all("[data-style]"),
    scan: one('[data-part="scan"]'),
    ripple: one('[data-part="ripple"]'),
    eyes: all('[data-part="eye"]'),
  };
}

type Parts = ReturnType<typeof findParts>;


/** One intro frame: every moving part, for time t (seconds). */
function applyPose(parts: Parts, time: number, wipeClip: string) {
  const p = pose(time);
  const lift = (1 - p.rise) * RISE;
  const handT = `translate(${round(p.dx)} ${round(lift + p.dy)})`;
  setAttr(parts.left.group, "transform", handT);
  setAttr(parts.right.group, "transform", handT);
  setAttr(parts.right.thumb, "transform", `rotate(${round(p.thumb)} ${THUMB_PIVOT[0]} ${THUMB_PIVOT[1]})`);
  setAttr(parts.right.index, "transform", `rotate(${round(p.index)} ${INDEX_PIVOT[0]} ${INDEX_PIVOT[1]})`);

  // The landmarks land one by one, then all but the 4 corner points step back.
  parts.machine.forEach((el) => setAttr(el, "opacity", round(p.fade)));
  [parts.left, parts.right].forEach((hand, h) => {
    hand.bones.forEach((el) => setAttr(el, "opacity", bonesOpacity(p, h)));
    hand.points.forEach((el, i) => {
      setAttr(el, "r", landmarkR(p, i, h));
      setAttr(el, "opacity", pointOpacity(p, i));
    });
  });

  // The frame: the 4 fingertips, joined.
  const c = frameCorners(p);
  const poly = pts(c);
  setAttr(parts.clip, "points", poly);
  setAttr(parts.panel, "points", poly);
  setAttr(parts.panel, "opacity", round(0.93 * p.frame));
  setAttr(parts.outline, "points", poly);
  setAttr(parts.outline, "stroke-dashoffset", round(1 - easeOut(clamp01(p.frame * 1.25))));
  setAttr(parts.outline, "opacity", round(p.fade));
  setAttr(parts.brackets, "d", bracketPath(c, p.snap));
  setAttr(parts.brackets, "opacity", round(clamp01((p.snap - 0.05) * 3) * p.fade));
  parts.corners.forEach((el, i) => {
    setAttr(el, "cx", round(c[i][0]));
    setAttr(el, "cy", round(c[i][1]));
    setAttr(el, "opacity", round(p.frame));
  });

  // Filters: the new one wipes in from the left over the one before.
  const { minX, edge } = wipeEdge(c, p.wipe);
  setAttr(parts.wipe, "x", round(minX - 2));
  setAttr(parts.wipe, "width", round(Math.max(0, edge - minX + 2)));
  parts.styles.forEach((el, i) => {
    const on = i === p.style || (i === p.under && p.wipe < 1);
    setAttr(el, "display", on ? "inline" : "none");
    if (i === p.style && p.wipe < 1) setAttr(el, "clip-path", `url(#${wipeClip})`);
    else if (el.hasAttribute("clip-path")) el.removeAttribute("clip-path");
  });
  setAttr(parts.scan, "x1", round(edge));
  setAttr(parts.scan, "x2", round(edge));
  setAttr(parts.scan, "opacity", p.wipe > 0 && p.wipe < 1 ? round(Math.sin(p.wipe * Math.PI) * 0.9) : 0);

  // The pinch: a ring between the right hand's thumb and index tips.
  if (p.ripple >= 0) {
    const r = handPoints(p, "right");
    setAttr(parts.ripple, "cx", round((r[THUMB_TIP][0] + r[INDEX_TIP][0]) / 2));
    setAttr(parts.ripple, "cy", round((r[THUMB_TIP][1] + r[INDEX_TIP][1]) / 2));
    setAttr(parts.ripple, "r", round(6 + 30 * easeOut(p.ripple)));
    setAttr(parts.ripple, "opacity", round((1 - p.ripple) * 0.95));
  } else {
    setAttr(parts.ripple, "opacity", 0);
  }

  // Cartoon: the eyes grow as it lands.
  parts.eyes.forEach((el) => setAttr(el, "transform", eyeTransform(Number(el.getAttribute("data-x")), 0.55 + 0.45 * p.eyes)));
}

/**
 * The scene. Its static structure is drawn at a still pose, so the first
 * paint (and the hub tile) is already a good picture; in intro mode one
 * loop moves it while it is on screen.
 */
function Scene({ mode }: { mode: "tile" | "intro" }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const frameClip = `vf-frame-${uid}`;
  const wipeClip = `vf-wipe-${uid}`;
  const intro = mode === "intro";
  const still = pose(intro ? T_STILL : T_TILE);

  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef, { amount: 0.2 });
  const reduce = useReducedMotion();

  useEffect(() => {
    const svg = svgRef.current;
    if (!intro || !svg) return;
    const parts = findParts(svg);
    if (reduce || !inView) {
      applyPose(parts, T_STILL, wipeClip);
      return;
    }
    let raf = 0;
    const start = performance.now() - T_STILL * 1000;
    const frame = (now: number) => {
      applyPose(parts, (now - start) / 1000, wipeClip);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [intro, inView, reduce, wipeClip]);

  // Static attributes for the first paint (and the tile).
  const lift = (1 - still.rise) * RISE;
  const handT = `translate(${round(still.dx)} ${round(lift + still.dy)})`;
  const c = frameCorners(still);
  const poly = pts(c);
  const { minX, edge } = wipeEdge(c, still.wipe);

  return (
    <svg
      ref={svgRef}
      viewBox={intro ? INTRO_VIEW : "78 104 324 232"}
      className={intro ? "size-full overflow-visible" : "size-full"}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <clipPath id={frameClip}>
          <polygon data-part="clip" points={poly} />
        </clipPath>
        <clipPath id={wipeClip}>
          <rect data-part="wipe" x={round(minX - 2)} y={0} width={round(Math.max(0, edge - minX + 2))} height={H} />
        </clipPath>
      </defs>

      <path d={WORLD} fill={INK} opacity={0.17} />

      <polygon data-part="panel" points={poly} fill={INK} opacity={round(0.93 * still.frame)} />

      <g clipPath={`url(#${frameClip})`}>
        {[0, 1, 2, 3].map((i) => {
          // The tile shows dots; pixel art waits behind them and wipes in from the left on the tile's hover.
          const on = intro ? i === still.style || (i === still.under && still.wipe < 1) : i === 0 || i === 1;
          const wiping = intro && i === still.style && still.wipe < 1;
          const hoverWipe =
            !intro && i === 1
              ? "[clip-path:inset(0_100%_0_0)] transition-[clip-path] duration-[520ms] ease-[var(--ease-in-out)] group-hover/tile:[clip-path:inset(0_0_0_0)] motion-reduce:transition-none"
              : undefined;
          return (
            <g
              key={i}
              data-style={i}
              display={on ? "inline" : "none"}
              clipPath={wiping ? `url(#${wipeClip})` : undefined}
              className={hoverWipe}
            >
              {i === 0 ? <path d={DOTS} fill="white" /> : null}
              {i === 1 ? PIXELS.map((d, level) => <path key={level} d={d} fill="white" opacity={PIXEL_ALPHA[level]} />) : null}
              {i === 2 ? (
                <g fill="white" style={{ fontFamily: "var(--font-martian), ui-monospace, monospace" }} fontSize={10.5} fontWeight={600}>
                  {TEXT.map((row) => (
                    <text key={row.y} x={REGION.x0} y={row.y} textLength={row.width} lengthAdjust="spacing" xmlSpace="preserve">
                      {row.text}
                    </text>
                  ))}
                </g>
              ) : null}
              {i === 3 ? <Cartoon eyes={still.eyes} /> : null}
            </g>
          );
        })}
        <line
          data-part="scan"
          x1={round(edge)}
          x2={round(edge)}
          y1={0}
          y2={H}
          stroke="white"
          strokeWidth={3}
          opacity={intro ? round(0.9 * Math.sin(still.wipe * Math.PI)) : 0}
        />
      </g>

      <polygon
        data-part="outline"
        points={poly}
        fill="none"
        stroke="white"
        strokeOpacity={0.55}
        strokeWidth={1.5}
        pathLength={1}
        strokeDasharray="1 1"
        strokeDashoffset={0}
      />
      <path data-part="brackets" d={bracketPath(c, 1)} stroke="white" strokeWidth={4} strokeLinecap="round" fill="none" />

      <g data-hand="left" transform={handT}>
        <HandDrawing points={intro} still={still} h={0} />
      </g>
      <g data-hand="right" transform={handT}>
        <g transform={`matrix(-1 0 0 1 ${W} 0)`}>
          <HandDrawing points={intro} still={still} h={1} />
        </g>
      </g>

      {intro ? <circle data-part="ripple" cx={0} cy={0} r={0} fill="none" stroke="white" strokeWidth={3} opacity={0} /> : null}

      {c.map(([x, y], i) => (
        <circle key={i} data-part="corner" cx={round(x)} cy={round(y)} r={7} fill="white" stroke={INK} strokeWidth={3} opacity={still.frame} />
      ))}
    </svg>
  );
}

export function ViewfinderArt({ mode = "tile" }: ArtProps) {
  return <Scene mode={mode} />;
}
