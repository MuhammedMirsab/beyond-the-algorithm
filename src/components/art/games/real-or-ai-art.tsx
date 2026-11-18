"use client";

import { Bot, Camera } from "lucide-react";
import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, type CSSProperties, type RefObject } from "react";
import type { ArtProps } from "../game-art";

/**
 * Real or AI?: the same photo twice, labelled A and B the way the game labels
 * them, and a magnifier.
 *
 * - tile: a still picture. Hovering the tile glides the magnifier onto photo
 *   B's window, where the AI copy has melted, and B gets marked.
 * - intro: a wordless, looping breakdown. The timer runs; the magnifier checks
 *   the real photo's window (crisp, with wooden boards around it), then the
 *   other photo's (bent bars, a smudge, smooth walls); it pings; that photo
 *   gets the AI ring and a robot, the real one a camera. Next loop the AI copy
 *   is on the other side. Pauses off screen; holds the found-it frame under
 *   reduced motion.
 *
 * Drawn in game-ink on the game colour. One rAF loop writes a handful of
 * attributes per frame, only when they change.
 */

type Side = "A" | "B";
const SIDES: readonly Side[] = ["A", "B"];
const other = (side: Side): Side => (side === "A" ? "B" : "A");

const INK = "currentColor";

const CARD_W = 180;
const CARD_H = 135;
const CARD: Record<Side, { x: number; y: number }> = { A: { x: 46, y: 104 }, B: { x: 254, y: 104 } };

/** The window: the detail the magnifier checks, in a card's own coordinates. */
const WIN = { x: 45, y: 79, s: 15 };
const winAt = (side: Side) => ({ x: CARD[side].x + WIN.x + WIN.s / 2, y: CARD[side].y + WIN.y + WIN.s / 2 });

/** Magnification inside the lens. */
const K = 2.3;
const LENS_R = 33;
const LENS_CLIP = 30;
/** Where the magnifier rests, off to the lower right of photo B. */
const REST = { x: 404, y: 268 };

/** The round timer above the photos (intro only). */
const BAR = { x: CARD.A.x, y: 74, w: CARD.B.x + CARD_W - CARD.A.x, h: 7 };

const round = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** Lands slightly past 1 and settles: for the marks popping in. */
const easeOutBack = (x: number) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2);

// ───────────────────────────── the timeline (seconds)

const LOOP = 7.4;
/** Reduced motion, first paint and where the loop picks up: the AI copy found and marked. */
const T_STILL = 5;

interface Pose {
  ai: Side;
  /** Lens centre and visibility (0 to 1). */
  lx: number;
  ly: number;
  lens: number;
  /** Ping ring around the found detail, 0 to 1, or -1. */
  ping: number;
  /** The ring around the AI photo, drawn 0 to 1. */
  outline: number;
  /** The robot and camera marks, 0 to 1 (eased with a small overshoot). */
  aiMark: number;
  realMark: number;
  /** The verdict (ring and marks) fading out at the end of a loop, 1 to 0. */
  verdict: number;
  /** Time left on the round timer, 0 to 1. */
  timer: number;
}

function pose(time: number): Pose {
  const cycle = Math.floor(time / LOOP);
  const t = time - cycle * LOOP;
  // Even loops put the AI copy on B, odd loops on A.
  const ai: Side = cycle % 2 === 0 ? "B" : "A";
  const realWin = winAt(other(ai));
  const aiWin = winAt(ai);
  const scan = 6;

  let lx: number;
  let ly: number;
  if (t < 1.3) {
    const k = easeInOut(seg(t, 0.5, 1.3));
    lx = lerp(REST.x, realWin.x - scan, k);
    ly = lerp(REST.y, realWin.y, k);
  } else if (t < 2.1) {
    // A slow look across the real window.
    lx = lerp(realWin.x - scan, realWin.x + scan, easeInOut(seg(t, 1.3, 2.1)));
    ly = realWin.y;
  } else if (t < 6.2) {
    const k = easeInOut(seg(t, 2.1, 2.9));
    lx = lerp(realWin.x + scan, aiWin.x, k);
    ly = lerp(realWin.y, aiWin.y, k);
  } else {
    const k = easeInOut(seg(t, 6.2, 6.8));
    lx = lerp(aiWin.x, REST.x, k);
    ly = lerp(aiWin.y, REST.y, k);
  }

  return {
    ai,
    lx,
    ly,
    lens: easeOut(seg(t, 0, 0.45)) * (1 - seg(t, 6.35, 6.8)),
    ping: t >= 2.95 && t < 3.6 ? seg(t, 2.95, 3.6) : -1,
    outline: t < 6.8 ? easeInOut(seg(t, 3.4, 4)) : 0,
    aiMark: t < 6.8 ? easeOutBack(seg(t, 3.6, 4.05)) : 0,
    realMark: t < 6.8 ? easeOutBack(seg(t, 3.75, 4.2)) : 0,
    verdict: 1 - seg(t, 6.3, 6.75),
    timer: t < 6.3 ? 1 - 0.45 * seg(t, 0.5, 2.9) : lerp(0.55, 1, easeOut(seg(t, 6.3, 6.95))),
  };
}

// ───────────────────────────── drawing

/** The bottom of a card's scene follows the card's rounded corners. */
const BOTTOM = `V${CARD_H - 14}a14 14 0 0 1 -14 14H14a14 14 0 0 1 -14 -14Z`;

/**
 * One photo: a house on a hill under the sun. Both copies share everything
 * but the details around the window: the real one has wooden boards and a
 * crisp window; the AI copy has smooth walls, bent bars and a smudge.
 * Which card shows which follows `data-ai` on the svg (a `group/roa`).
 */
function Card({ side, badge = true }: { side: Side; badge?: boolean }) {
  const { x, y } = CARD[side];
  // Shown when this card is the real photo / the AI copy.
  const realOnly = side === "A" ? "group-data-[ai=A]/roa:hidden" : "group-data-[ai=B]/roa:hidden";
  const aiOnly = side === "A" ? "hidden group-data-[ai=A]/roa:inline" : "hidden group-data-[ai=B]/roa:inline";
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={CARD_W} height={CARD_H} rx={14} fill="white" fillOpacity={0.96} />
      <circle cx={142} cy={34} r={15} fill={INK} fillOpacity={0.22} />
      <path d={`M0 92C30 76 62 74 96 84S150 72 180 80${BOTTOM}`} fill={INK} fillOpacity={0.3} />

      {/* The house. */}
      <rect x={36} y={68} width={56} height={44} fill="white" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      <g className={realOnly} stroke={INK} strokeOpacity={0.3} strokeWidth={1}>
        {[73.5, 78.5, 83.5, 88.5, 93.5, 98.5, 103.5].map((ly) => (
          <path key={ly} d={`M37.2 ${ly}H90.8`} />
        ))}
      </g>
      <path d="M29 70L64 45L99 70Z" fill={INK} fillOpacity={0.9} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      <rect x={70} y={86} width={13} height={26} rx={1.5} fill={INK} fillOpacity={0.85} />

      <g className={realOnly}>
        <rect x={WIN.x} y={WIN.y} width={WIN.s} height={WIN.s} rx={1} fill="white" stroke={INK} strokeWidth={2.2} />
        <path d={`M52.5 ${WIN.y}V${WIN.y + WIN.s}M${WIN.x} 86.5H${WIN.x + WIN.s}`} stroke={INK} strokeWidth={1.7} />
      </g>
      <g className={aiOnly}>
        <path
          d="M45.4 79.6C49.6 78.4 55.4 80.4 59.8 79.2C60.9 83.6 59.2 89.3 60.4 93.6C55.6 95 50.1 93.2 45.1 94.4C44.2 89.6 46.3 84.6 45.4 79.6Z"
          fill="white"
          stroke={INK}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
        <path d="M53.4 79.8C51 83.8 55.6 88.6 51.6 94M45.6 85.4C49.6 88.6 54.4 84.2 60 88" stroke={INK} strokeWidth={1.7} strokeLinecap="round" fill="none" />
        <path d="M54.8 88.6c2.4 .2 4 2 3.8 4.2c-2.6 .6 -4.2 -1.6 -3.8 -4.2z" fill={INK} fillOpacity={0.55} />
      </g>

      {/* A tree, then the ground in front of everything. */}
      <rect x={138} y={78} width={5} height={30} fill={INK} fillOpacity={0.85} />
      <circle cx={140.5} cy={71} r={16} fill={INK} fillOpacity={0.6} />
      <path d={`M0 110C40 103 120 109 180 99${BOTTOM}`} fill={INK} fillOpacity={0.86} />

      {badge ? (
        <g>
          <rect x={10} y={10} width={30} height={30} rx={8} fill={INK} />
          <text x={25} y={31.7} textAnchor="middle" fontSize={19} fontWeight={800} fill="white" style={{ fontFamily: "var(--font-mona)" }}>
            {side}
          </text>
        </g>
      ) : null}
    </g>
  );
}

/** Both photos again: what the glass shows, once scaled up about the lens. */
function Magnified() {
  return (
    <>
      <Card side="A" />
      <Card side="B" />
    </>
  );
}

/** The verdict marks for one photo, next to its letter (as in the game): a robot for AI, a camera for real. */
function Mark({ side, kind, markRef, scale }: { side: Side; kind: "ai" | "real"; markRef?: RefObject<SVGGElement | null>; scale?: number }) {
  const x = CARD[side].x + 46;
  const y = CARD[side].y + 10;
  const ai = kind === "ai";
  const Icon = ai ? Bot : Camera;
  return (
    <g ref={markRef} transform={`translate(${x + 20} ${y + 15}) scale(${round(scale ?? 1)})`} opacity={scale === undefined ? 1 : clamp01(scale)}>
      <rect x={-20} y={-15} width={40} height={30} rx={15} fill={ai ? INK : "white"} stroke={ai ? undefined : INK} strokeWidth={ai ? undefined : 2.2} />
      <Icon x={-9} y={-9} width={18} height={18} color={ai ? "white" : INK} strokeWidth={2.4} aria-hidden />
    </g>
  );
}

const outlinePath = (side: Side) => {
  const { x, y } = CARD[side];
  const o = 7;
  const w = CARD_W + 2 * o;
  const h = CARD_H + 2 * o;
  const r = 20;
  return `M${x - o + r} ${y - o}H${x - o + w - r}a${r} ${r} 0 0 1 ${r} ${r}V${y - o + h - r}a${r} ${r} 0 0 1 ${-r} ${r}H${x - o + r}a${r} ${r} 0 0 1 ${-r} ${-r}V${y - o + r}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
};

/** Rim, glass highlight and handle, centred on 0 0. */
function LensFrame() {
  const d = LENS_R * 0.72;
  return (
    <>
      <circle r={LENS_CLIP} fill="white" fillOpacity={0.08} />
      <path d={`M${-LENS_CLIP * 0.62} ${-LENS_CLIP * 0.32}A${LENS_CLIP * 0.7} ${LENS_CLIP * 0.7} 0 0 1 ${-LENS_CLIP * 0.2} ${-LENS_CLIP * 0.66}`} stroke="white" strokeOpacity={0.75} strokeWidth={3} strokeLinecap="round" fill="none" />
      <circle r={LENS_R} fill="none" stroke={INK} strokeWidth={6} />
      <path d={`M${d + 2} ${d + 2}L${d + 26} ${d + 26}`} stroke={INK} strokeWidth={11} strokeLinecap="round" />
    </>
  );
}

/** Writes an attribute only when its value changes. */
function setAttr(el: Element | null | undefined, name: string, value: string | number) {
  if (!el) return;
  const v = String(value);
  if (el.getAttribute(name) !== v) el.setAttribute(name, v);
}

const magnify = (lx: number, ly: number) => `matrix(${K} 0 0 ${K} ${round(lx * (1 - K))} ${round(ly * (1 - K))})`;
const markTransform = (side: Side, s: number) => `translate(${CARD[side].x + 66} ${CARD[side].y + 25}) scale(${round(Math.max(0.001, s))})`;

// ───────────────────────────── intro: the looping breakdown

function IntroArt() {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `roa-lens-${uid}`;
  const still = pose(T_STILL);

  const svgRef = useRef<SVGSVGElement>(null);
  const lensRef = useRef<SVGGElement>(null);
  const clipRef = useRef<SVGCircleElement>(null);
  const magRef = useRef<SVGGElement>(null);
  const pingRef = useRef<SVGCircleElement>(null);
  const timerRef = useRef<SVGRectElement>(null);
  const outlineRefs = { A: useRef<SVGPathElement>(null), B: useRef<SVGPathElement>(null) };
  const aiMarkRefs = { A: useRef<SVGGElement>(null), B: useRef<SVGGElement>(null) };
  const realMarkRefs = { A: useRef<SVGGElement>(null), B: useRef<SVGGElement>(null) };

  const inView = useInView(svgRef, { amount: 0.25 });
  const reduce = useReducedMotion();

  useEffect(() => {
    const apply = (time: number) => {
      const p = pose(time);
      setAttr(svgRef.current, "data-ai", p.ai);

      const s = 0.9 + 0.1 * p.lens;
      setAttr(lensRef.current, "transform", `translate(${round(p.lx)} ${round(p.ly)}) scale(${round(s)})`);
      setAttr(lensRef.current, "opacity", round(p.lens));
      setAttr(clipRef.current, "cx", round(p.lx));
      setAttr(clipRef.current, "cy", round(p.ly));
      setAttr(clipRef.current, "r", round(LENS_CLIP * s * (p.lens > 0 ? 1 : 0)));
      setAttr(magRef.current, "transform", magnify(p.lx, p.ly));

      const found = winAt(p.ai);
      setAttr(pingRef.current, "cx", round(found.x));
      setAttr(pingRef.current, "cy", round(found.y));
      setAttr(pingRef.current, "r", p.ping < 0 ? 0 : round(LENS_R + 4 + 26 * easeOut(p.ping)));
      setAttr(pingRef.current, "opacity", p.ping < 0 ? 0 : round(0.9 * (1 - p.ping)));

      setAttr(timerRef.current, "transform", `matrix(${round(p.timer)} 0 0 1 ${round(BAR.x * (1 - p.timer))} 0)`);

      for (const side of SIDES) {
        const isAi = side === p.ai;
        setAttr(outlineRefs[side].current, "stroke-dashoffset", round(1 - (isAi ? p.outline : 0)));
        setAttr(outlineRefs[side].current, "opacity", isAi && p.outline > 0 ? round(p.verdict) : 0);
        const aiMark = isAi ? p.aiMark : 0;
        const realMark = isAi ? 0 : p.realMark;
        setAttr(aiMarkRefs[side].current, "transform", markTransform(side, aiMark));
        setAttr(aiMarkRefs[side].current, "opacity", round(clamp01(aiMark) * p.verdict));
        setAttr(realMarkRefs[side].current, "transform", markTransform(side, realMark));
        setAttr(realMarkRefs[side].current, "opacity", round(clamp01(realMark) * p.verdict));
      }
    };

    if (reduce || !inView) {
      apply(T_STILL);
      return;
    }
    let raf = 0;
    const start = performance.now() - T_STILL * 1000;
    const frame = (now: number) => {
      apply((now - start) / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // The refs are stable; the loop restarts only when visibility or the motion preference changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce]);

  const found = winAt(still.ai);
  return (
    <svg
      ref={svgRef}
      data-ai={still.ai}
      viewBox="22 46 452 290"
      className="group/roa size-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <clipPath id={clipId}>
          <circle ref={clipRef} cx={round(still.lx)} cy={round(still.ly)} r={LENS_CLIP} />
        </clipPath>
      </defs>

      {/* The round timer: it runs while the photos are checked and stops when the AI copy is found. */}
      <rect x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} rx={BAR.h / 2} fill={INK} fillOpacity={0.16} />
      <rect
        ref={timerRef}
        x={BAR.x}
        y={BAR.y}
        width={BAR.w}
        height={BAR.h}
        rx={BAR.h / 2}
        fill={INK}
        fillOpacity={0.85}
        transform={`matrix(${still.timer} 0 0 1 ${round(BAR.x * (1 - still.timer))} 0)`}
      />

      {SIDES.map((side) => (
        <path
          key={side}
          ref={outlineRefs[side]}
          d={outlinePath(side)}
          fill="none"
          stroke={INK}
          strokeWidth={4.5}
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={side === still.ai ? 1 - still.outline : 1}
          opacity={side === still.ai ? 1 : 0}
        />
      ))}
      <Card side="A" />
      <Card side="B" />
      {SIDES.map((side) => (
        <g key={side}>
          <Mark side={side} kind="ai" markRef={aiMarkRefs[side]} scale={side === still.ai ? still.aiMark : 0} />
          <Mark side={side} kind="real" markRef={realMarkRefs[side]} scale={side === still.ai ? 0 : still.realMark} />
        </g>
      ))}

      <circle ref={pingRef} cx={found.x} cy={found.y} r={0} fill="none" stroke={INK} strokeWidth={3} opacity={0} />

      {/* The magnifier: both photos again, scaled up about the lens and clipped to the glass. */}
      <g clipPath={`url(#${clipId})`}>
        <g ref={magRef} transform={magnify(still.lx, still.ly)}>
          <Magnified />
        </g>
      </g>
      <g ref={lensRef} transform={`translate(${round(still.lx)} ${round(still.ly)})`} opacity={still.lens}>
        <LensFrame />
      </g>
    </svg>
  );
}

// ───────────────────────────── tile: a still picture with one hover motion

/** How far the magnifier travels on hover: from its rest onto photo B's window. */
const HOVER = { x: round(winAt("B").x - REST.x), y: round(winAt("B").y - REST.y) };

function TileArt() {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `roa-tile-lens-${uid}`;
  const move =
    "transition-[translate] duration-[650ms] ease-[var(--ease-in-out)] motion-reduce:transition-none";
  // The lens moves by HOVER; the picture inside it moves back by K times as much, so the
  // glass keeps showing what is under it, magnified. Same timing, so they stay in step.
  const lensStyle = { "--roa-x": `${HOVER.x}px`, "--roa-y": `${HOVER.y}px` } as CSSProperties;
  const innerStyle = { "--roa-x": `${round(-K * HOVER.x)}px`, "--roa-y": `${round(-K * HOVER.y)}px` } as CSSProperties;
  const travel = "group-hover/tile:[translate:var(--roa-x)_var(--roa-y)]";
  const reveal =
    "opacity-0 transition-opacity duration-200 ease-out group-hover/tile:opacity-100 group-hover/tile:delay-[560ms] group-hover/tile:duration-300 motion-reduce:transition-none";

  return (
    <svg data-ai="B" viewBox="30 86 436 238" className="group/roa size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <circle cx={REST.x} cy={REST.y} r={LENS_CLIP} />
        </clipPath>
      </defs>

      <g className={reveal}>
        <path d={outlinePath("B")} fill="none" stroke={INK} strokeWidth={4.5} />
      </g>
      <Card side="A" />
      <Card side="B" />
      <g className={reveal}>
        <Mark side="B" kind="ai" />
      </g>

      <g className={`${move} ${travel}`} style={lensStyle}>
        <g clipPath={`url(#${clipId})`}>
          <g className={`${move} ${travel}`} style={innerStyle}>
            <g transform={magnify(REST.x, REST.y)}>
              <Magnified />
            </g>
          </g>
        </g>
        <g transform={`translate(${REST.x} ${REST.y})`}>
          <LensFrame />
        </g>
      </g>
    </svg>
  );
}

export function RealOrAiArt({ mode = "tile" }: ArtProps) {
  return mode === "intro" ? <IntroArt /> : <TileArt />;
}
