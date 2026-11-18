"use client";

import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/cn";
import { FACE_POINTS, FACE_POINTS_USED } from "../engine/face-points";
import { convexHull } from "../engine/geometry";
import { OneEuroFilter } from "../engine/one-euro";
import { byte, css, dotRadius, luma, nearestColour, thermal, type RGB } from "./recipes";
import { clamp01, easeInOut, easeOut, easeOutBack, r1, runLoop, seg, setAttr, usePlaying } from "./motion-loop";

/**
 * How it works, as five small motion graphics on a 320 × 200 grid, one per
 * step: the 21 hand points landing, the 4 corners and their frame, the
 * smoothing (the game's real 1€ filter on example data), a filter running on
 * every pixel at once (the real recipes on a tiny picture), and the face
 * points the Cartoon filter reads. Each loops while on screen and holds a
 * still under reduced motion. Tokens only; the machine's voice in mono.
 */

type P = readonly [number, number];

const MONO = { fontFamily: "var(--font-martian), ui-monospace, monospace" } as const;

const BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function Canvas({ label, children, svgRef, className }: { label: string; children: ReactNode; svgRef: Ref<SVGSVGElement>; className?: string }) {
  return (
    <svg ref={svgRef} viewBox="0 0 320 200" role="img" aria-label={label} className={cn("block h-auto w-full", className)}>
      {children}
    </svg>
  );
}

// ───────────────────────────── 1 · 21 points on a hand

/** An open hand, palm to the camera, in MediaPipe's landmark order. */
const OPEN_HAND: P[] = (
  [
    [80, 110],
    [66, 101], [55, 89], [47, 77], [41, 66],
    [68, 66], [65, 47], [63, 35], [62, 24],
    [80, 63], [80, 42], [80, 29], [80, 17],
    [91, 66], [94, 47], [96, 35], [97, 25],
    [101, 72], [107, 58], [110, 49], [113, 40],
  ] as const
).map(([x, y]) => [160 + (x - 80) * 1.45, 8 + y * 1.45] as const);

const LABELLED: readonly number[] = [0, 4, 8, 12, 16, 20];
const pointAt = (i: number) => 0.55 + i * 0.05;

export function HandPointsArt({ className }: { className?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const playing = usePlaying(svg);
  const hand = useRef<SVGGElement>(null);
  const scan = useRef<SVGLineElement>(null);
  const counter = useRef<SVGTextElement>(null);
  const points = useRef<Array<SVGCircleElement | null>>([]);
  const bones = useRef<Array<SVGLineElement | null>>([]);
  const labels = useRef<Array<SVGTextElement | null>>([]);

  useEffect(
    () =>
      runLoop(
        (t) => {
          setAttr(hand.current, "opacity", r1(seg(t, 0, 0.35) * (1 - seg(t, 5.8, 6.2))));
          const sway = 3 * Math.sin(((t - 1.9) / 2.4) * Math.PI * 2) * seg(t, 1.9, 2.3) * (1 - seg(t, 5.0, 5.4));
          setAttr(hand.current, "transform", `rotate(${r1(sway)} ${OPEN_HAND[0][0]} ${OPEN_HAND[0][1]})`);
          const s = seg(t, 0.15, 0.95);
          setAttr(scan.current, "y1", r1(22 + 152 * easeInOut(s)));
          setAttr(scan.current, "y2", r1(22 + 152 * easeInOut(s)));
          setAttr(scan.current, "opacity", r1(Math.sin(s * Math.PI) * 0.8));
          let found = 0;
          OPEN_HAND.forEach((_, i) => {
            const k = seg(t, pointAt(i), pointAt(i) + 0.22);
            if (k > 0.2) found++;
            setAttr(points.current[i], "r", r1((LABELLED.includes(i) ? 4.2 : 3.3) * easeOutBack(k)));
          });
          BONES.forEach(([a, b], j) => setAttr(bones.current[j], "opacity", r1(0.45 * seg(t, pointAt(Math.max(a, b)), pointAt(Math.max(a, b)) + 0.2))));
          LABELLED.forEach((i, j) => setAttr(labels.current[j], "opacity", r1(seg(t, pointAt(i) + 0.1, pointAt(i) + 0.3))));
          const text = `${found} ${found === 1 ? "point" : "points"}`;
          if (counter.current && counter.current.textContent !== text) counter.current.textContent = text;
          setAttr(counter.current, "opacity", r1(seg(t, 0.5, 0.7) * (1 - seg(t, 5.8, 6.2))));
        },
        { seconds: 6.4, still: 3.2, playing },
      ),
    [playing],
  );

  return (
    <Canvas svgRef={svg} label="A hand. The model marks 21 points on it, one by one: the wrist, then four along each finger and the thumb" className={className}>
      <text ref={counter} x={16} y={24} fontSize={12} className="fill-fg-subtle" style={MONO}>
        21 points
      </text>
      <line ref={scan} x1={70} x2={250} y1={0} y2={0} strokeWidth={2} className="stroke-game" opacity={0} />
      <g ref={hand}>
        <g className="fill-fg/[0.06] stroke-fg/[0.06]" strokeWidth={17} strokeLinecap="round" strokeLinejoin="round">
          <polygon points={[0, 1, 5, 9, 13, 17].map((i) => OPEN_HAND[i].join(",")).join(" ")} />
          {[
            [1, 2, 3, 4],
            [5, 6, 7, 8],
            [9, 10, 11, 12],
            [13, 14, 15, 16],
            [17, 18, 19, 20],
          ].map((f) => (
            <polyline key={f[0]} points={f.map((i) => OPEN_HAND[i].join(",")).join(" ")} fill="none" />
          ))}
        </g>
        <g className="stroke-fg" strokeWidth={1.6} strokeLinecap="round">
          {BONES.map(([a, b], j) => (
            <line
              key={`${a}-${b}`}
              ref={(el) => {
                bones.current[j] = el;
              }}
              x1={OPEN_HAND[a][0]}
              y1={OPEN_HAND[a][1]}
              x2={OPEN_HAND[b][0]}
              y2={OPEN_HAND[b][1]}
              opacity={0.45}
            />
          ))}
        </g>
        {OPEN_HAND.map(([x, y], i) => (
          <circle
            key={i}
            ref={(el) => {
              points.current[i] = el;
            }}
            cx={x}
            cy={y}
            r={LABELLED.includes(i) ? 4.2 : 3.3}
            className={LABELLED.includes(i) ? "fill-game" : "fill-fg"}
          />
        ))}
        {LABELLED.map((i, j) => {
          const [x, y] = OPEN_HAND[i];
          return (
            <text
              key={i}
              ref={(el) => {
                labels.current[j] = el;
              }}
              x={x}
              y={i === 0 ? y + 17 : y - 9}
              textAnchor="middle"
              fontSize={10.5}
              className="fill-fg-muted"
              style={MONO}
            >
              {i}
            </text>
          );
        })}
      </g>
    </Canvas>
  );
}

// ───────────────────────────── 2 · the 4 corners and their frame

/** A hand making an L (index up, thumb across), relative to the wrist; the other fingers curl in. */
const L_HAND: P[] = [
  [0, 0],
  [7, -5], [15, -9], [23, -11], [31, -12],
  [4, -24], [4, -36], [4, -45], [4, -54],
  [-4, -23], [-4, -31], [-1, -27], [0, -22],
  [-11, -21], [-11, -28], [-8, -25], [-7, -20],
  [-16, -17], [-17, -23], [-14, -21], [-13, -17],
];
const L_SCALE = 2;
const placeHand = (wx: number, wy: number, flip: boolean): P[] =>
  L_HAND.map(([x, y]) => [wx + (flip ? -x : x) * L_SCALE, wy + y * L_SCALE] as const);
const LEFT_L = placeHand(64, 172, false);
const RIGHT_L = placeHand(256, 172, true);
const TIPS: readonly number[] = [4, 8];

/** Where each hand has moved to at time t (they wander, the frame follows). */
function handOffsets(t: number) {
  const u = seg(t, 2.2, 5.0);
  const env = Math.sin(Math.PI * u);
  const a = Math.PI * 2 * u;
  return {
    left: [-14 * Math.sin(a + 0.6) * env, 12 * Math.sin(a + 1.4) * env] as const,
    right: [24 * Math.sin(a) * env, -16 * Math.sin(a * 1.5) * env] as const,
  };
}

export function FramePointsArt({ className }: { className?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const playing = usePlaying(svg);
  const scene = useRef<SVGGElement>(null);
  const hands = useRef<Array<SVGGElement | null>>([]);
  const others = useRef<Array<SVGGElement | null>>([]);
  const tips = useRef<Array<SVGCircleElement | null>>([]);
  const tipLabels = useRef<Array<SVGGElement | null>>([]);
  const frame = useRef<SVGPolygonElement>(null);
  const caption = useRef<SVGTextElement>(null);

  useEffect(
    () =>
      runLoop(
        (t) => {
          setAttr(scene.current, "opacity", r1(seg(t, 0, 0.4) * (1 - seg(t, 5.4, 5.9))));
          const off = handOffsets(t);
          [off.left, off.right].forEach(([dx, dy], h) => setAttr(hands.current[h], "transform", `translate(${r1(dx)} ${r1(dy)})`));
          const focus = easeInOut(seg(t, 0.7, 1.1));
          others.current.forEach((el) => setAttr(el, "opacity", r1(0.5 - 0.3 * focus)));
          const pop = easeOutBack(seg(t, 0.7, 1.0));
          tips.current.forEach((el) => setAttr(el, "r", r1(2.4 + 3.4 * pop)));
          tipLabels.current.forEach((el) => setAttr(el, "opacity", r1(seg(t, 0.9, 1.2))));
          setAttr(caption.current, "opacity", r1(seg(t, 1.0, 1.3)));

          // The frame: the tightest shape around the 4 fingertips, wherever the hands are.
          const corners = [
            ...TIPS.map((i) => [LEFT_L[i][0] + off.left[0], LEFT_L[i][1] + off.left[1]] as const),
            ...TIPS.map((i) => [RIGHT_L[i][0] + off.right[0], RIGHT_L[i][1] + off.right[1]] as const),
          ];
          const hull = convexHull(corners.map(([x, y]) => ({ x, y })));
          setAttr(frame.current, "points", hull.map((v) => `${r1(v.x)},${r1(v.y)}`).join(" "));
          setAttr(frame.current, "stroke-dashoffset", r1(1 - easeInOut(seg(t, 1.2, 1.8))));
          setAttr(frame.current, "fill-opacity", r1(0.16 * seg(t, 1.5, 1.9)));
        },
        { seconds: 6.2, still: 2.0, playing },
      ),
    [playing],
  );

  const initialHull = convexHull([...TIPS.map((i) => LEFT_L[i]), ...TIPS.map((i) => RIGHT_L[i])].map(([x, y]) => ({ x, y })));

  return (
    <Canvas
      svgRef={svg}
      label="Two hands making an L. Of their 42 points only the thumb tips (point 4) and index fingertips (point 8) count: the frame is the tightest shape around those four, and it follows the hands"
      className={className}
    >
      <g ref={scene}>
        <text ref={caption} x={16} y={24} fontSize={12} className="fill-fg-subtle" style={MONO}>
          4 of 42 points
        </text>
        <polygon
          ref={frame}
          points={initialHull.map((v) => `${v.x},${v.y}`).join(" ")}
          className="fill-game stroke-game"
          fillOpacity={0.16}
          strokeWidth={2}
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1 1"
        />
        {[LEFT_L, RIGHT_L].map((hand, h) => (
          <g
            key={h}
            ref={(el) => {
              hands.current[h] = el;
            }}
          >
            <g
              ref={(el) => {
                others.current[h] = el;
              }}
              opacity={0.2}
            >
              <g className="stroke-fg" strokeWidth={1.4} strokeLinecap="round">
                {BONES.map(([a, b]) => (
                  <line key={`${a}-${b}`} x1={hand[a][0]} y1={hand[a][1]} x2={hand[b][0]} y2={hand[b][1]} />
                ))}
              </g>
              {hand.map(([x, y], i) => (TIPS.includes(i) ? null : <circle key={i} cx={x} cy={y} r={2.2} className="fill-fg" />))}
            </g>
            {TIPS.map((i, k) => (
              <circle
                key={i}
                ref={(el) => {
                  tips.current[h * 2 + k] = el;
                }}
                cx={hand[i][0]}
                cy={hand[i][1]}
                r={5.8}
                className="fill-game stroke-sunken"
                strokeWidth={1.5}
              />
            ))}
            <g
              ref={(el) => {
                tipLabels.current[h] = el;
              }}
              fontSize={10.5}
              className="fill-fg-muted"
              style={MONO}
            >
              {TIPS.map((i) => (
                <text
                  key={i}
                  x={hand[i][0] + (h === 0 ? -10 : 10)}
                  y={hand[i][1] + (i === 8 ? -6 : 14)}
                  textAnchor={h === 0 ? "end" : "start"}
                >
                  {i}
                </text>
              ))}
            </g>
          </g>
        ))}
      </g>
    </Canvas>
  );
}

// ───────────────────────────── 3 · smoothing (the real 1€ filter on example data)

const SAMPLES = 72;
/** A fingertip at 30 pictures a second: still, a fast move of 200 px, still. Wobble added. */
const SMOOTH_DATA = (() => {
  const filter = new OneEuroFilter();
  const raw: number[] = [];
  const smooth: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const move = easeInOut(clamp01((i - 26) / 8));
    const wobble = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const value = 200 * move + wobble * 7;
    raw.push(value);
    smooth.push(filter.filter(value, i / 30));
  }
  return { raw, smooth };
})();
const plotX = (i: number) => 26 + (i * 272) / (SAMPLES - 1);
const plotY = (v: number) => 146 - v * 0.46;

export function SmoothingArt({ className }: { className?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const playing = usePlaying(svg);
  const scene = useRef<SVGGElement>(null);
  const dots = useRef<Array<SVGCircleElement | null>>([]);
  const line = useRef<SVGPolylineElement>(null);
  const cursor = useRef<SVGGElement>(null);
  const nowRaw = useRef<SVGCircleElement>(null);
  const nowSmooth = useRef<SVGCircleElement>(null);

  useEffect(
    () =>
      runLoop(
        (t) => {
          setAttr(scene.current, "opacity", r1(seg(t, 0, 0.3) * (1 - seg(t, 7.4, 7.9))));
          const k = (SAMPLES - 1) * seg(t, 0.3, 4.6);
          const i = Math.floor(k);
          dots.current.forEach((el, j) => setAttr(el, "display", j <= k ? "inline" : "none"));
          setAttr(line.current, "stroke-dashoffset", Math.max(0, 1 - k / (SAMPLES - 1)).toFixed(4));
          setAttr(cursor.current, "transform", `translate(${r1(plotX(k))} 0)`);
          setAttr(nowRaw.current, "cy", r1(plotY(SMOOTH_DATA.raw[i])));
          setAttr(nowSmooth.current, "cy", r1(plotY(SMOOTH_DATA.smooth[i])));
        },
        { seconds: 8.2, still: 4.8, playing },
      ),
    [playing],
  );

  return (
    <Canvas
      svgRef={svg}
      label="A chart of one fingertip over time. The measured points wobble; the smoothed line is steady while the hand is still and catches up quickly when it moves"
      className={className}
    >
      <g ref={scene}>
        <g fontSize={11} style={MONO}>
          <circle cx={20} cy={20} r={2.6} className="fill-fg/50" />
          <text x={28} y={24} className="fill-fg-subtle">
            Measured
          </text>
          <line x1={112} x2={128} y1={20} y2={20} strokeWidth={2.5} strokeLinecap="round" className="stroke-game" />
          <text x={134} y={24} className="fill-fg-subtle">
            Smoothed
          </text>
        </g>
        <g fontSize={10.5} textAnchor="middle" className="fill-fg-faint" style={MONO}>
          <text x={plotX(12)} y={186}>
            Still
          </text>
          <text x={plotX(30)} y={186}>
            Moving
          </text>
          <text x={plotX(54)} y={186}>
            Still
          </text>
        </g>
        <line x1={20} x2={302} y1={164} y2={164} strokeWidth={1} className="stroke-fg/15" />
        {SMOOTH_DATA.raw.map((v, j) => (
          <circle
            key={j}
            ref={(el) => {
              dots.current[j] = el;
            }}
            cx={r1(plotX(j))}
            cy={r1(plotY(v))}
            r={2}
            className="fill-fg/45"
          />
        ))}
        <polyline
          ref={line}
          points={SMOOTH_DATA.smooth.map((v, j) => `${r1(plotX(j))},${r1(plotY(v))}`).join(" ")}
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-game"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={0}
        />
        <g ref={cursor} transform={`translate(${plotX(SAMPLES - 1)} 0)`}>
          <line x1={0} x2={0} y1={34} y2={164} strokeWidth={1} className="stroke-fg/20" />
          <circle ref={nowRaw} cx={0} cy={plotY(SMOOTH_DATA.raw[SAMPLES - 1])} r={3.4} className="fill-fg" />
          <circle ref={nowSmooth} cx={0} cy={plotY(SMOOTH_DATA.smooth[SAMPLES - 1])} r={4.6} className="fill-game stroke-sunken" strokeWidth={1.5} />
        </g>
      </g>
    </Canvas>
  );
}

// ───────────────────────────── 4 · a recipe for every pixel

const COLS = 12;
const ROWS = 8;
const CELL = 13;
const GRID_X = 16;
const GRID_Y = 40;

/** A tiny sunset, 12 × 8 pixels. */
const PICTURE: RGB[] = (() => {
  const out: RGB[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const k = row / 5;
      let c: RGB = [0.12 + 0.86 * k, 0.16 + 0.42 * k, 0.42 - 0.14 * k];
      if (Math.hypot(col - 7.6, row - 4.2) < 1.7) c = [1.0, 0.92, 0.6];
      if (row >= 5.2 + 0.9 * Math.sin(col / 2.1)) c = [0.12 + 0.02 * col, 0.26, 0.16];
      out.push(c);
    }
  }
  return out;
})();

/** The pixel the callout reads (a warm sky pixel). */
const PICKED = 4 * COLS + 4;
const STAGES = ["The picture", "Dots", "Thermal", "Pixel art"] as const;
const DOT_GROUND: RGB = [0.012, 0.012, 0.012];
const dotInk = (c: RGB): RGB => [Math.min(1, Math.pow(c[0], 0.85) * 1.3 + 0.04), Math.min(1, Math.pow(c[1], 0.85) * 1.3 + 0.04), Math.min(1, Math.pow(c[2], 0.85) * 1.3 + 0.04)];

/** What one pixel looks like after each stage's recipe: the square's colour and a dot (Dots only). */
function stageLook(c: RGB, stage: number): { fill: RGB; dot: number } {
  if (stage === 1) return { fill: DOT_GROUND, dot: dotRadius(c) };
  if (stage === 2) return { fill: thermal(c), dot: 0 };
  if (stage === 3) return { fill: nearestColour(c), dot: 0 };
  return { fill: c, dot: 0 };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Stage switches (seconds) in a 9 s loop: picture, dots, thermal, pixel art, picture. */
const STAGE_AT = [0, 2.8, 4.2, 5.6, 7.0] as const;

function stageAt(t: number) {
  let from = 0;
  let to = 0;
  let k = 1;
  for (let s = 1; s < STAGE_AT.length; s++) {
    if (t >= STAGE_AT[s]) {
      from = to;
      to = s % STAGES.length;
      k = easeInOut(seg(t, STAGE_AT[s], STAGE_AT[s] + 0.5));
    }
  }
  return { from, to, k };
}

export function RecipeArt({ className }: { className?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const playing = usePlaying(svg);
  const rects = useRef<Array<SVGRectElement | null>>([]);
  const circles = useRef<Array<SVGCircleElement | null>>([]);
  const pick = useRef<SVGRectElement>(null);
  const callout = useRef<SVGGElement>(null);
  const values = useRef<Array<SVGTextElement | null>>([]);
  const formula = useRef<SVGGElement>(null);
  const outSwatch = useRef<SVGRectElement>(null);
  const outDot = useRef<SVGCircleElement>(null);
  const stageLabel = useRef<SVGTextElement>(null);

  useEffect(
    () =>
      runLoop(
        (t) => {
          const { from, to, k } = stageAt(t);
          PICTURE.forEach((c, i) => {
            const a = stageLook(c, from);
            const b = stageLook(c, to);
            setAttr(rects.current[i], "fill", css(lerpRGB(a.fill, b.fill, k)));
            const dot = lerp(a.dot, b.dot, k);
            setAttr(circles.current[i], "r", r1((dot * CELL) / 2));
            setAttr(circles.current[i], "fill", css(dotInk(c)));
          });
          const label = STAGES[k < 0.5 ? from : to];
          if (stageLabel.current && stageLabel.current.textContent !== label) stageLabel.current.textContent = label;

          // The callout reads one pixel: its three numbers, then the brightness formula.
          const show = seg(t, 0.5, 0.9) * (1 - seg(t, 8.3, 8.8));
          setAttr(pick.current, "opacity", r1(show));
          setAttr(callout.current, "opacity", r1(show));
          const c = PICTURE[PICKED];
          const count = easeOut(seg(t, 1.0, 1.8));
          values.current.forEach((el, j) => {
            const text = `${["r", "g", "b"][j]} ${String(Math.round(byte(c[j]) * count)).padStart(3, " ")}`;
            if (el && el.textContent !== text) el.textContent = text;
          });
          setAttr(formula.current, "opacity", r1(seg(t, 1.9, 2.3)));
          const out = stageLook(c, to);
          const prev = stageLook(c, from);
          setAttr(outSwatch.current, "fill", css(lerpRGB(prev.fill, out.fill, k)));
          setAttr(outDot.current, "r", r1((lerp(prev.dot, out.dot, k) * 18) / 2));
        },
        { seconds: 9, still: 3.9, playing },
      ),
    [playing],
  );

  const pickCol = PICKED % COLS;
  const pickRow = Math.floor(PICKED / COLS);
  const picked = PICTURE[PICKED];

  return (
    <Canvas
      svgRef={svg}
      label="A tiny picture of 96 pixels. One pixel's red, green and blue numbers become a brightness. Then one recipe changes every pixel at once: into dots, into thermal colours, into the 16 colours of pixel art"
      className={className}
    >
      <text ref={stageLabel} x={GRID_X} y={26} fontSize={13} fontWeight={650} className="fill-fg">
        Dots
      </text>
      {PICTURE.map((c, i) => {
        const x = GRID_X + (i % COLS) * CELL;
        const y = GRID_Y + Math.floor(i / COLS) * CELL;
        const look = stageLook(c, 1);
        return (
          <g key={i}>
            <rect
              ref={(el) => {
                rects.current[i] = el;
              }}
              x={x}
              y={y}
              width={CELL - 1}
              height={CELL - 1}
              rx={1.5}
              fill={css(look.fill)}
            />
            <circle
              ref={(el) => {
                circles.current[i] = el;
              }}
              cx={x + (CELL - 1) / 2}
              cy={y + (CELL - 1) / 2}
              r={r1((look.dot * CELL) / 2)}
              fill={css(dotInk(c))}
            />
          </g>
        );
      })}
      <rect
        ref={pick}
        x={GRID_X + pickCol * CELL - 2}
        y={GRID_Y + pickRow * CELL - 2}
        width={CELL + 3}
        height={CELL + 3}
        rx={3}
        fill="none"
        strokeWidth={2}
        className="stroke-fg"
      />
      <g ref={callout} fontSize={11.5} style={MONO}>
        <line x1={GRID_X + pickCol * CELL + CELL + 2} y1={GRID_Y + pickRow * CELL + CELL / 2} x2={196} y2={58} strokeWidth={1} className="stroke-fg/30" />
        <rect x={196} y={40} width={18} height={18} rx={4} fill={css(picked)} />
        <text x={220} y={53} className="fill-fg-subtle">
          →
        </text>
        <rect ref={outSwatch} x={236} y={40} width={18} height={18} rx={4} fill={css(DOT_GROUND)} />
        <circle ref={outDot} cx={245} cy={49} r={r1((dotRadius(picked) * 18) / 2)} fill={css(dotInk(picked))} />
        {[0, 1, 2].map((j) => (
          <text
            key={j}
            ref={(el) => {
              values.current[j] = el;
            }}
            x={196}
            y={82 + j * 16}
            xmlSpace="preserve"
            className="fill-fg"
          >
            {`${["r", "g", "b"][j]} ${String(byte(picked[j])).padStart(3, " ")}`}
          </text>
        ))}
        <g ref={formula}>
          <text x={196} y={140} fontSize={9.5} className="fill-fg-subtle">
            .21r + .72g + .07b
          </text>
          <text x={196} y={158} className="fill-game">
            {`brightness ${luma(picked).toFixed(2)}`}
          </text>
        </g>
      </g>
      <text x={GRID_X} y={GRID_Y + ROWS * CELL + 22} fontSize={10.5} className="fill-fg-faint" style={MONO}>
        All 96 pixels at once
      </text>
    </Canvas>
  );
}

// ───────────────────────────── 5 · the face points Cartoon reads

const FACE_C: P = [160, 102];
const FACE_RX = 50;
const FACE_RY = 64;

/** 478 points over the face, ring by ring (a stand-in for the real mesh, with its real count). */
const MESH = (() => {
  const rings = 12;
  const weights = Array.from({ length: rings }, (_, k) => k + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const counts = weights.map((w) => Math.round((w / total) * FACE_POINTS));
  counts[rings - 1] += FACE_POINTS - counts.reduce((a, b) => a + b, 0);
  const pts: Array<{ x: number; y: number; ring: number }> = [];
  counts.forEach((n, k) => {
    const f = (k + 1) / rings;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + k * 0.37;
      pts.push({ x: FACE_C[0] + f * FACE_RX * Math.cos(a), y: FACE_C[1] + f * FACE_RY * Math.sin(a), ring: k });
    }
  });
  return pts;
})();

/** The 12 points the Cartoon filter reads: irises, eye corners, forehead, chin, cheeks, the sides of the face. */
const USED: P[] = [
  [140, 92], [180, 92],
  [129, 92], [151, 92], [169, 92], [191, 92],
  [160, 42], [160, 164],
  [134, 120], [186, 120],
  [111, 104], [209, 104],
];
const EYES: P[] = [
  [140, 92],
  [180, 92],
];

export function FaceArt({ className }: { className?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const playing = usePlaying(svg);
  const scene = useRef<SVGGElement>(null);
  const mesh = useRef<Array<SVGGElement | null>>([]);
  const used = useRef<SVGGElement>(null);
  const eyes = useRef<Array<SVGGElement | null>>([]);
  const chin = useRef<SVGGElement>(null);
  const chinPoint = useRef<SVGCircleElement>(null);
  const blush = useRef<SVGGElement>(null);
  const shine = useRef<SVGGElement>(null);
  const caption = useRef<SVGTextElement>(null);

  useEffect(
    () =>
      runLoop(
        (t) => {
          setAttr(scene.current, "opacity", r1(1 - seg(t, 6.6, 7.2)));
          const highlight = easeInOut(seg(t, 1.3, 1.8));
          mesh.current.forEach((el, k) => setAttr(el, "opacity", r1(seg(t, 0.1 + k * 0.08, 0.4 + k * 0.08) * (0.55 - 0.35 * highlight))));
          setAttr(used.current, "opacity", r1(highlight));
          setAttr(chinPoint.current, "opacity", r1(highlight));
          const text = highlight > 0.5 ? `${FACE_POINTS_USED} used` : `${FACE_POINTS} points`;
          if (caption.current && caption.current.textContent !== text) caption.current.textContent = text;
          const warp = easeOutBack(seg(t, 2.0, 2.8));
          eyes.current.forEach((el, i) =>
            setAttr(el, "transform", `translate(${EYES[i][0]} ${EYES[i][1]}) scale(${r1(1 + 0.5 * warp)}) translate(${-EYES[i][0]} ${-EYES[i][1]})`),
          );
          setAttr(chin.current, "transform", `translate(0 ${r1(-7 * warp)})`);
          setAttr(blush.current, "opacity", r1(0.4 * clamp01(warp)));
          setAttr(shine.current, "opacity", r1(clamp01(warp)));
        },
        { seconds: 7.6, still: 4.0, playing },
      ),
    [playing],
  );

  return (
    <Canvas
      svgRef={svg}
      label={`A face covered in ${FACE_POINTS} points. ${FACE_POINTS_USED} of them light up around the eyes, cheeks and chin; then the eyes grow, the chin shrinks and the cheeks blush`}
      className={className}
    >
      <g ref={scene}>
        <text ref={caption} x={16} y={24} fontSize={12} className="fill-fg-subtle" style={MONO}>
          {FACE_POINTS_USED} used
        </text>
        <g fill="none" strokeWidth={1.5} strokeLinecap="round" className="stroke-fg/25">
          <path d={`M${FACE_C[0] - FACE_RX} ${FACE_C[1]}A${FACE_RX} ${FACE_RY} 0 0 1 ${FACE_C[0] + FACE_RX} ${FACE_C[1]}`} />
          <g ref={chin}>
            <path d={`M${FACE_C[0] - FACE_RX} ${FACE_C[1]}A${FACE_RX} ${FACE_RY} 0 0 0 ${FACE_C[0] + FACE_RX} ${FACE_C[1]}`} />
            <path d="M148 140Q160 148 172 140" />
            <circle ref={chinPoint} cx={160} cy={164} r={3.2} className="fill-game stroke-sunken" strokeWidth={1.2} />
          </g>
          <path d="M160 100L156 122L163 123" />
        </g>
        {Array.from({ length: 12 }, (_, k) => (
          <g
            key={k}
            ref={(el) => {
              mesh.current[k] = el;
            }}
            className="fill-fg"
            opacity={0.2}
          >
            {MESH.filter((p) => p.ring === k).map((p, i) => (
              <circle key={i} cx={r1(p.x)} cy={r1(p.y)} r={1.05} />
            ))}
          </g>
        ))}
        <g ref={blush} className="fill-game" opacity={0.4}>
          <circle cx={134} cy={122} r={10} />
          <circle cx={186} cy={122} r={10} />
        </g>
        {EYES.map(([x, y], i) => (
          <g
            key={x}
            ref={(el) => {
              eyes.current[i] = el;
            }}
            transform={`translate(${x} ${y}) scale(1.5) translate(${-x} ${-y})`}
          >
            <ellipse cx={x} cy={y} rx={9} ry={6.5} fill="none" strokeWidth={1.4} className="stroke-fg/60" />
            <circle cx={x} cy={y} r={3.6} className="fill-fg/70" />
          </g>
        ))}
        <g ref={shine} className="fill-fg">
          {EYES.map(([x, y]) => (
            <circle key={x} cx={x - 2.4} cy={y - 3} r={1.8} />
          ))}
        </g>
        <g ref={used} className="fill-game stroke-sunken" strokeWidth={1.2}>
          {USED.filter(([, y]) => y !== 164).map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={3.2} />
          ))}
        </g>
      </g>
    </Canvas>
  );
}
