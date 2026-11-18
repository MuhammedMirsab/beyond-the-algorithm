"use client";

import { motion, useAnimate, useInView, usePageInView } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ArtProps } from "../game-art";
import { Hand, type HandShape } from "./hand-shapes";

/**
 * Rock, paper, scissors: an AI that learns your habits and locks its move
 * before you throw. Drawn in game ink on the game colour.
 *
 * - "tile": your open hand against the AI's card, face down and locked.
 *   Hovering turns the card over: scissors, which beats paper.
 * - "intro": a wordless loop of how it works. A new throw joins your history,
 *   the AI's odds shift towards your favourite, it locks its card, you pump
 *   three times and throw, its card turns over to the move that beats yours.
 */
export function RpsArt({ mode = "tile" }: ArtProps) {
  return mode === "intro" ? <IntroLoop /> : <Tile />;
}

const MONA = { fontFamily: "var(--font-mona)" } as const;
const INK = "currentColor";
const GAME = "var(--game)";
const MOVES: readonly HandShape[] = ["rock", "paper", "scissors"];

/** A hand placed in art coordinates, scaled from its 120 x 136 drawing. */
function PlacedHand({
  shape,
  x,
  y,
  scale,
  paper = "white",
  weight = 4.5,
  cuff = true,
  flip,
}: {
  shape: HandShape;
  x: number;
  y: number;
  scale: number;
  paper?: string;
  weight?: number;
  cuff?: boolean;
  flip?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <Hand shape={shape} ink={INK} paper={paper} weight={weight} cuff={cuff} flip={flip} />
    </g>
  );
}

/** The dotted back of the AI's card. `clear` keeps the bottom free for a label. */
function CardBackDots({ w, h, clear = 0 }: { w: number; h: number; clear?: number }) {
  const dots: ReactNode[] = [];
  for (let y = 24; y < h - 14 - clear; y += 16) {
    for (let x = 20; x < w - 12; x += 16) dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={1.7} />);
  }
  return (
    <g fill={GAME} fillOpacity={0.3}>
      <rect x={8} y={8} width={w - 16} height={h - 16} rx={12} fill="none" stroke={GAME} strokeOpacity={0.45} strokeWidth={2} />
      {dots}
    </g>
  );
}

function LockBadge({ cx, cy, r = 24 }: { cx: number; cy: number; r?: number }) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${r / 24})`}>
      <circle r={24} fill={GAME} />
      <rect x={-10} y={-4} width={20} height={16} rx={4} fill={INK} />
      <path d="M-6 -4v-5a6 6 0 0 1 12 0v5" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
    </g>
  );
}

/* ── Hub tile: still, one hover motion ─────────────────────────── */

const TURN = "[transform-box:fill-box] origin-center transition-transform duration-200 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none";

function Tile() {
  return (
    <svg viewBox="40 22 400 236" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden style={MONA}>
      {/* You: an open hand. */}
      <g transform="translate(62 44) rotate(-6 62 88)">
        <rect width={124} height={176} rx={22} fill="white" fillOpacity={0.96} />
        <PlacedHand shape="paper" x={13} y={14} scale={0.82} />
        <text x={62} y={163} textAnchor="middle" fontSize={15} fontWeight={760} fill={INK}>
          You
        </text>
      </g>

      <text x={240} y={140} textAnchor="middle" fontSize={20} fontWeight={800} fill={INK} fillOpacity={0.75}>
        vs
      </text>

      {/* The AI: its card is already locked. Hover turns it over. */}
      <g transform="translate(294 44) rotate(6 62 88)">
        <g className={`${TURN} delay-200 group-hover/tile:scale-x-0 group-hover/tile:delay-0`}>
          <rect width={124} height={176} rx={22} fill={INK} />
          <CardBackDots w={124} h={176} clear={22} />
          <LockBadge cx={62} cy={80} />
          <text x={62} y={163} textAnchor="middle" fontSize={15} fontWeight={760} fill={GAME}>
            AI
          </text>
        </g>
        <g className={`${TURN} scale-x-0 group-hover/tile:scale-x-100 group-hover/tile:delay-200`}>
          <rect width={124} height={176} rx={22} fill={INK} />
          <PlacedHand shape="scissors" x={13} y={14} scale={0.82} flip />
          <text x={62} y={163} textAnchor="middle" fontSize={15} fontWeight={760} fill={GAME}>
            AI
          </text>
        </g>
      </g>
    </svg>
  );
}

/* ── Intro: the looping breakdown ──────────────────────────────── */

type Step = "rest" | "add" | "think" | "lock" | "pump1" | "pump2" | "pump3" | "throw" | "reveal" | "score" | "fade";

/** Each step and how long it holds, in ms: about 8.5 s a loop. */
const STEPS: readonly (readonly [Step, number])[] = [
  ["rest", 700],
  ["add", 950],
  ["think", 800],
  ["lock", 800],
  ["pump1", 470],
  ["pump2", 470],
  ["pump3", 470],
  ["throw", 450],
  ["reveal", 700],
  ["score", 1700],
  ["fade", 550],
];
const ORDER = STEPS.map(([s]) => s);
/** Under reduced motion: the whole story at once. */
const STILL: Step = "score";

const reached = (step: Step, from: Step) => step !== "fade" && ORDER.indexOf(step) >= ORDER.indexOf(from);

/** Your earlier throws, oldest first; "add" brings the newest. */
const HISTORY: readonly HandShape[] = ["rock", "paper", "rock"];
const NEWEST: HandShape = "rock";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
/** SVG groups scale and turn around their own middle. */
const CENTRED = { transformBox: "fill-box", originX: 0.5, originY: 0.5 } as const;

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduce(onChange: () => void): () => void {
  const list = window.matchMedia(REDUCE_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/**
 * The reduced-motion setting, hydration-safe: false on the server and in the
 * first client render (so both draw the same frame), then the real setting.
 * (motion's useReducedMotion reads matchMedia during the first client render.)
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduce,
    () => window.matchMedia(REDUCE_QUERY).matches,
    () => false,
  );
}

function useLoop(run: boolean): Step {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!run) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % STEPS.length), STEPS[index][1]);
    return () => window.clearTimeout(timer);
  }, [index, run]);
  return STEPS[index][0];
}

/** Dips its children once each time `beat` goes up: a fist pumping on the chant. */
function Pump({ beat, depth, children }: { beat: number; depth: number; children: ReactNode }) {
  const [scope, animate] = useAnimate<SVGGElement>();
  useEffect(() => {
    if (beat > 0 && scope.current) {
      animate(scope.current, { y: [0, depth, 0] }, { duration: 0.38, ease: EASE_OUT, times: [0, 0.4, 1] });
    }
  }, [beat, depth, animate, scope]);
  return <g ref={scope}>{children}</g>;
}

function IntroLoop() {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const pageVisible = usePageInView();
  const reduced = usePrefersReducedMotion();
  const looped = useLoop(inView && pageVisible && !reduced);
  const step = reduced ? STILL : looped;

  const added = reached(step, "add");
  const thinking = reached(step, "think");
  const locked = reached(step, "lock");
  const thrown = reached(step, "throw");
  const revealed = reached(step, "reveal");
  const scored = reached(step, "score");
  const pumps = step === "pump1" ? 1 : step === "pump2" ? 2 : step === "pump3" ? 3 : 0;
  const beatsShown = thrown ? 3 : pumps;

  // The AI's odds: how often each move shows up in your history so far (smoothed, like the real one).
  const history = added ? [...HISTORY, NEWEST] : HISTORY;
  const odds = MOVES.map((g) => (history.filter((h) => h === g).length + 0.5) / (history.length + 1.5));

  return (
    <svg ref={ref} viewBox="0 0 400 300" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <motion.g initial={false} animate={{ opacity: step === "fade" ? 0 : 1 }} transition={{ duration: 0.45, ease: EASE_OUT }}>
        {/* Your history: small cards under your card. */}
        {history.map((shape, i) => (
          <motion.g
            key={`${i}-${shape}`}
            initial={i < HISTORY.length ? false : { opacity: 0, y: -30, scale: 1.25 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
            style={CENTRED}
          >
            <rect x={46 + i * 36} y={230} width={30} height={42} rx={7} fill="white" fillOpacity={0.96} />
            <PlacedHand shape={shape} x={49 + i * 36} y={235} scale={0.2} weight={7} cuff={false} />
          </motion.g>
        ))}

        {/* History feeds the odds. */}
        <g stroke={INK} strokeOpacity={0.5} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M200 251h24" strokeDasharray="0.5 7" />
          <path d="M224 245l6 6-6 6" />
        </g>

        {/* The AI's odds for your next throw: one bar per move, the top one goes solid. */}
        {MOVES.map((g, i) => {
          const height = 10 + odds[i] * 58;
          const top = thinking && g === "rock";
          return (
            <g key={g}>
              <motion.rect
                x={248 + i * 38}
                width={28}
                rx={6}
                fill={INK}
                initial={false}
                animate={{ y: 266 - height, height, fillOpacity: top ? 1 : 0.3 }}
                transition={{ duration: 0.55, ease: EASE_OUT }}
              />
              <PlacedHand shape={g} x={250 + i * 38} y={270} scale={0.2} weight={7} cuff={false} />
            </g>
          );
        })}
        {/* ...and points up at the AI's card. */}
        <motion.path
          d="M262 215v-13M256.5 207.5l5.5-5.5 5.5 5.5"
          stroke={INK}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={false}
          animate={{ opacity: thinking && !revealed ? 1 : 0 }}
          transition={{ duration: 0.25 }}
        />

        {/* Your card: a fist that pumps on the chant, then lands as your throw. */}
        <g transform="translate(46 30) rotate(-4 60 82)">
          <rect width={120} height={164} rx={20} fill="white" fillOpacity={0.96} />
          <Pump beat={thrown ? 0 : pumps} depth={14}>
            <motion.g
              initial={false}
              animate={{ scale: thrown ? 1.06 : 0.9 }}
              transition={thrown ? { type: "spring", duration: 0.4, bounce: 0.45 } : { duration: 0.3, ease: EASE_OUT }}
              style={CENTRED}
            >
              <PlacedHand shape="rock" x={12} y={18} scale={0.8} />
            </motion.g>
          </Pump>
        </g>

        {/* The chant: three beats between the cards. */}
        {[0, 1, 2].map((i) => (
          <motion.circle
            key={i}
            cx={187 + i * 13}
            cy={112}
            r={4.5}
            fill={INK}
            initial={false}
            animate={{ fillOpacity: beatsShown > i ? 1 : 0.25, scale: pumps === i + 1 ? 1.35 : 1 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            style={CENTRED}
          />
        ))}

        {/* The AI's card: face down, locked before the chant, then turned over. */}
        <g transform="translate(234 30) rotate(4 60 82)">
          <Pump beat={locked && !thrown ? pumps : 0} depth={10}>
            <motion.g
              initial={false}
              animate={{ scaleX: revealed ? 0 : 1 }}
              transition={{ duration: 0.2, ease: EASE_IN_OUT, delay: revealed ? 0 : 0.28 }}
              style={CENTRED}
            >
              <rect width={120} height={164} rx={20} fill={INK} />
              <CardBackDots w={120} h={164} />
              <motion.g
                initial={false}
                animate={{ opacity: locked ? 1 : 0, scale: locked ? 1 : 0.5 }}
                transition={locked ? { type: "spring", duration: 0.45, bounce: 0.4 } : { duration: 0.15 }}
                style={CENTRED}
              >
                <LockBadge cx={60} cy={82} r={26} />
              </motion.g>
            </motion.g>
            <motion.g
              initial={false}
              animate={{ scaleX: revealed ? 1 : 0 }}
              transition={{ duration: 0.28, ease: EASE_OUT, delay: revealed ? 0.2 : 0 }}
              style={CENTRED}
            >
              <rect width={120} height={164} rx={20} fill={INK} />
              <PlacedHand shape="paper" x={11} y={18} scale={0.82} flip />
            </motion.g>
          </Pump>
          {/* It won the round: a check on its corner. */}
          <motion.g
            initial={false}
            animate={{ opacity: scored ? 1 : 0, scale: scored ? 1 : 0.5 }}
            transition={scored ? { type: "spring", duration: 0.45, bounce: 0.45 } : { duration: 0.15 }}
            style={CENTRED}
          >
            <circle cx={116} cy={4} r={17} fill="white" />
            <path d="M108 4.5l5.5 5.5 10-11" fill="none" stroke={INK} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
          </motion.g>
        </g>
      </motion.g>
    </svg>
  );
}
