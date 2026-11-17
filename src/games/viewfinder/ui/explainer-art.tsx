import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Three static drawings of what the machine works with, one per "How it
 * works" step: the 21 landmarks, the 4 that make the frame, and the lens
 * redrawing only the inside. Drawn on a 160 × 120 grid, in tokens, no motion.
 */

type Pt = readonly [number, number];

/** MediaPipe's hand skeleton (same pairs the live overlay draws). */
const BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

/** An open hand, palm to the camera: wrist, then thumb, index, middle, ring and little finger. */
const OPEN_HAND: Pt[] = [
  [80, 110],
  [66, 101], [55, 89], [47, 77], [41, 66],
  [68, 66], [65, 47], [63, 35], [62, 24],
  [80, 63], [80, 42], [80, 29], [80, 17],
  [91, 66], [94, 47], [96, 35], [97, 25],
  [101, 72], [107, 58], [110, 49], [113, 40],
];

/** A hand making an L (index up, thumb across), relative to the wrist; the other fingers curl in. */
const L_HAND: Pt[] = [
  [0, 0],
  [7, -5], [15, -9], [23, -11], [31, -12],
  [4, -24], [4, -36], [4, -45], [4, -54],
  [-4, -23], [-4, -31], [-1, -27], [0, -22],
  [-11, -21], [-11, -28], [-8, -25], [-7, -20],
  [-16, -17], [-17, -23], [-14, -21], [-13, -17],
];

const place = (hand: Pt[], wx: number, wy: number, flip: boolean): Pt[] =>
  hand.map(([x, y]) => [wx + (flip ? -x : x), wy + y] as const);

const LEFT_L = place(L_HAND, 34, 104, false);
const RIGHT_L = place(L_HAND, 126, 104, true);

const THUMB_TIP = 4;
const INDEX_TIP = 8;

/** The frame: both index tips on top, both thumb tips below (clockwise). */
const FRAME: Pt[] = [LEFT_L[INDEX_TIP], RIGHT_L[INDEX_TIP], RIGHT_L[THUMB_TIP], LEFT_L[THUMB_TIP]];

const path = (pts: readonly Pt[]) => `M${pts.map(([x, y]) => `${x} ${y}`).join("L")}Z`;

function insideConvex([px, py]: Pt, poly: readonly Pt[]) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const c = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
  }
  return true;
}

/** A dot grid: halftone inside the frame (a softly lit round shape), dim and even outside. */
const DOTS = (() => {
  const inside: Array<{ x: number; y: number; r: number }> = [];
  const outside: Pt[] = [];
  for (let y = 5; y < 120; y += 6) {
    for (let x = 5; x < 160; x += 6) {
      if (insideConvex([x, y], FRAME)) {
        const light = Math.min(1, Math.max(0.08, 1 - Math.hypot(x - 80, y - 70) / 30));
        inside.push({ x, y, r: 0.55 + 2.35 * Math.sqrt(light) });
      } else {
        outside.push([x, y]);
      }
    }
  }
  return { inside, outside };
})();

function Bones({ hand, className }: { hand: Pt[]; className?: string }) {
  return (
    <g className={className} strokeWidth={1.5} strokeLinecap="round">
      {BONES.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={hand[a][0]} y1={hand[a][1]} x2={hand[b][0]} y2={hand[b][1]} />
      ))}
    </g>
  );
}

function Frame({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 160 120" role="img" aria-label={label} className={cn("block h-auto w-full", className)}>
      {children}
    </svg>
  );
}

/** Step 1: every landmark on one hand. */
export function HandPointsArt({ className }: { className?: string }) {
  return (
    <div className={cn("dot-field", className)}>
      <Frame label="A hand with 21 points marked on the wrist, the knuckles and the fingertips">
        <Bones hand={OPEN_HAND} className="stroke-fg/35" />
        {OPEN_HAND.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2.7} className="fill-fg" />
        ))}
      </Frame>
    </div>
  );
}

/** Step 2: two L-shaped hands; only the thumb and index tips become the frame. */
export function FramePointsArt({ className }: { className?: string }) {
  return (
    <div className={cn("dot-field", className)}>
      <Frame label="Two hands making an L. Only the 4 thumb and index fingertips are used, as the corners of the frame">
        <Bones hand={LEFT_L} className="stroke-fg/20" />
        <Bones hand={RIGHT_L} className="stroke-fg/20" />
        {[...LEFT_L, ...RIGHT_L].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.7} className="fill-fg/45" />
        ))}
        <path d={path(FRAME)} fill="none" strokeWidth={1.5} strokeDasharray="3 3" className="stroke-game" />
        {FRAME.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={4} className="fill-game stroke-sunken" strokeWidth={1.5} />
        ))}
      </Frame>
    </div>
  );
}

/** Step 3: inside the 4 corners the pixels are redrawn (here as halftone dots); outside they're dimmed. */
export function LensInsideArt({ className }: { className?: string }) {
  return (
    <Frame
      label="Inside the frame the picture is redrawn as dots of different sizes. Outside the frame it stays dim"
      className={className}
    >
      {DOTS.outside.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1} className="fill-fg/20" />
      ))}
      {DOTS.inside.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} className="fill-fg" />
      ))}
      <path d={path(FRAME)} fill="none" strokeWidth={1} className="stroke-fg/40" />
      {FRAME.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.5} className="fill-game" />
      ))}
    </Frame>
  );
}
