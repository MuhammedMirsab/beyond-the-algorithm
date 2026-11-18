"use client";

import { useInView } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { ArtProps } from "../game-art";

const REDUCE = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Reduced motion, read so the server render and hydration always agree (the server says "no"). */
function useReducedMotionSafe() {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCE).matches, () => false);
}

/*
 * Binary search, drawn in game ink on the game colour.
 *
 * tile:  the numbers 1 to 100, already halved twice ("more than 50?" no,
 *        "even?" yes). Hovering answers the next question and another half
 *        goes dark.
 * intro: a wordless loop. A question card asks, an answer is tapped, half of
 *        the field falls away and the rest close up into bigger cells, until
 *        one number is left and lands. Pauses off screen; under reduced
 *        motion it holds the tile picture.
 */

export function MindReaderArt({ mode = "tile" }: ArtProps) {
  return mode === "intro" ? <IntroLoop /> : <TileArt />;
}

/* ── Tile: a still picture with one hover motion ───────────────── */

function TileArt() {
  const step = 20;
  const cell = 17;
  const gx = 58;
  const gy = 30;
  const cells = Array.from({ length: 100 }, (_, i) => {
    const n = i + 1;
    const out = n > 50 || n % 2 === 1;
    const next = !out && n > 26;
    return { n, x: gx + (i % 10) * step, y: gy + Math.floor(i / 10) * step, out, next };
  });

  return (
    <svg viewBox="40 18 426 222" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden style={{ fontFamily: "var(--font-mona)" }}>
      {cells.map((c) =>
        c.out ? (
          <rect key={c.n} x={c.x} y={c.y} width={cell} height={cell} rx={4.5} fill="currentColor" fillOpacity={0.12} />
        ) : (
          <g key={c.n} className={c.next ? "art-move group-hover/tile:opacity-25" : undefined}>
            <rect x={c.x} y={c.y} width={cell} height={cell} rx={4.5} fill="white" fillOpacity={0.95} />
            <text
              x={c.x + cell / 2}
              y={c.y + cell / 2 + 3.2}
              textAnchor="middle"
              fontSize={8.6}
              fontWeight={700}
              fill="currentColor"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {c.n}
            </text>
          </g>
        ),
      )}

      {/* The halving line. */}
      <path d={`M${gx - 8} ${gy + step * 5 - 1.5}H${gx + step * 10 + 5}`} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="1 6" />

      {/* The question card. */}
      <g transform="translate(300 62)">
        <rect width={150} height={142} rx={20} fill="white" fillOpacity={0.96} />
        <text x={18} y={30} fontSize={10.5} fontWeight={600} fill="currentColor" fillOpacity={0.7} style={{ fontFamily: "var(--font-martian)" }}>
          Question 3
        </text>
        <text x={18} y={58} fontSize={17} fontWeight={760} fill="currentColor">
          Is it more
        </text>
        <text x={18} y={79} fontSize={17} fontWeight={760} fill="currentColor">
          than 26?
        </text>
        <rect x={18} y={98} width={54} height={28} rx={14} fill="none" stroke="currentColor" strokeWidth={2} />
        <text x={45} y={116.5} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="currentColor">
          Yes
        </text>
        <rect x={80} y={98} width={54} height={28} rx={14} fill="none" stroke="currentColor" strokeWidth={2} />
        <rect x={80} y={98} width={54} height={28} rx={14} fill="currentColor" className="art-move opacity-0 group-hover/tile:opacity-100" />
        <text x={107} y={116.5} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="currentColor" className="art-move group-hover/tile:fill-white">
          No
        </text>
      </g>
    </svg>
  );
}

/* ── Intro: the looping breakdown ──────────────────────────────── */

/** The questions the game really asks when you think of 37, and the honest answers. */
const QUESTIONS: { label: string; yes: boolean; test: (n: number) => boolean }[] = [
  { label: "> 50", yes: false, test: (n) => n > 50 },
  { label: "even", yes: false, test: (n) => n % 2 === 0 },
  { label: "> 23", yes: true, test: (n) => n > 23 },
  { label: "> 35", yes: true, test: (n) => n > 35 },
  { label: "> 41", yes: false, test: (n) => n > 41 },
  { label: "> 37", yes: false, test: (n) => n > 37 },
];

const ALL = Array.from({ length: 100 }, (_, i) => i + 1);

/** The numbers left after the first `answered` questions. */
const LEFT: number[][] = QUESTIONS.reduce<number[][]>(
  (lists, q) => [...lists, lists[lists.length - 1].filter((n) => q.test(n) === q.yes)],
  [ALL],
);

/** Field box in the 480 × 340 drawing. */
const FIELD = { x: 18, y: 54, size: 268 };
/** The size every cell is drawn at; the grid scales it. */
const BASE = 22;

interface Slot {
  x: number;
  y: number;
  /** Cell side. */
  s: number;
}

/** The biggest square cells that hold `count` cells in the field, centred (same rule as the game). */
function slotsFor(count: number): Slot[] {
  let best = { cols: 1, pitch: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const pitch = Math.min(FIELD.size / cols, FIELD.size / rows);
    if (pitch >= best.pitch - 1e-9) best = { cols, pitch };
    if (rows === 1) break;
  }
  const pitch = Math.min(best.pitch, FIELD.size * 0.36);
  const cols = Math.min(best.cols, count);
  const rows = Math.ceil(count / cols);
  const ox = FIELD.x + (FIELD.size - cols * pitch) / 2 + pitch / 2;
  const oy = FIELD.y + (FIELD.size - rows * pitch) / 2 + pitch / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: ox + (i % cols) * pitch,
    y: oy + Math.floor(i / cols) * pitch,
    s: pitch * 0.86,
  }));
}

const LAYOUTS = LEFT.map((list) => slotsFor(list.length));
const FINAL = LEFT[LEFT.length - 1][0];

/**
 * Phases of one loop, in order. "ask" shows question i, "tap" presses its
 * answer, "drop" plays the halving; after the last question, "land" grows the
 * last number and "rest" fades the field away before it all starts again.
 */
type Beat =
  | { kind: "deal" }
  | { kind: "ask"; q: number }
  | { kind: "tap"; q: number }
  | { kind: "drop"; q: number }
  | { kind: "land" }
  | { kind: "rest" };

const BEATS: { beat: Beat; ms: number }[] = [
  { beat: { kind: "deal" }, ms: 900 },
  ...QUESTIONS.flatMap((_, q) => {
    const quick = q >= 2;
    return [
      { beat: { kind: "ask", q } as Beat, ms: quick ? 420 : 650 },
      { beat: { kind: "tap", q } as Beat, ms: quick ? 260 : 380 },
      { beat: { kind: "drop", q } as Beat, ms: quick ? 760 : 980 },
    ];
  }),
  { beat: { kind: "land" }, ms: 2000 },
  { beat: { kind: "rest" }, ms: 520 },
];

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

function IntroLoop() {
  const reduced = useReducedMotionSafe();
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.2 });
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced || !inView) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % BEATS.length), BEATS[index].ms);
    return () => window.clearTimeout(id);
  }, [index, inView, reduced]);

  if (reduced) return <TileArt />;

  const beat = BEATS[index].beat;
  // How many questions have been answered (their halving played or playing).
  const answered = beat.kind === "drop" ? beat.q + 1 : beat.kind === "ask" || beat.kind === "tap" ? beat.q : beat.kind === "deal" ? 0 : QUESTIONS.length;
  const left = LEFT[answered];
  const layout = LAYOUTS[answered];
  const place = new Map(left.map((n, i) => [n, i]));
  const question = beat.kind === "ask" || beat.kind === "tap" ? QUESTIONS[beat.q] : beat.kind === "drop" ? QUESTIONS[beat.q] : null;
  const tapped = beat.kind === "tap" || beat.kind === "drop" ? QUESTIONS[beat.q].yes : null;
  const landing = beat.kind === "land";
  const resting = beat.kind === "rest";
  const dealing = beat.kind === "deal";

  // The previous list, for the wave: removed cells fall in order from the cut.
  const previous = answered > 0 ? LEFT[answered - 1] : ALL;
  const removedIndex = new Map<number, number>();
  if (beat.kind === "drop") {
    const removed = previous.filter((n) => !place.has(n));
    removed.forEach((n, k) => removedIndex.set(n, k / Math.max(1, removed.length - 1)));
  }

  return (
    <svg ref={ref} viewBox="0 0 480 340" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden style={{ fontFamily: "var(--font-mona)" }}>
      {/* What's left, in the dot-matrix face the game uses for counts. */}
      <text
        x={FIELD.x + 2}
        y={36}
        fontSize={30}
        fontWeight={800}
        fill="currentColor"
        style={{ fontFamily: "var(--font-doto)", fontVariationSettings: "'ROND' 70", fontVariantNumeric: "tabular-nums" }}
      >
        {left.length}
      </text>

      <g style={{ opacity: resting ? 0 : 1, transition: `opacity 420ms ${EASE_OUT}` }}>
        {ALL.map((n, i) => {
          const at = place.get(n);
          const alive = at !== undefined;
          let style: CSSProperties;
          if (dealing) {
            const slot = LAYOUTS[0][i];
            style = {
              transform: `translate(${slot.x}px, ${slot.y}px) scale(${slot.s / BASE})`,
              opacity: 1,
              transition: `opacity 360ms ${EASE_OUT} ${Math.round(i * 4)}ms`,
            };
          } else if (alive) {
            const slot = landing ? { x: FIELD.x + FIELD.size / 2, y: FIELD.y + FIELD.size / 2, s: FIELD.size * 0.62 } : layout[at];
            const delay = landing ? 60 : beat.kind === "drop" ? 170 : 0;
            style = {
              transform: `translate(${slot.x}px, ${slot.y}px) scale(${slot.s / BASE})`,
              opacity: 1,
              transition: landing
                ? `transform 620ms cubic-bezier(0.34, 1.4, 0.64, 1) ${delay}ms`
                : `transform 560ms ${EASE_IN_OUT} ${delay}ms, opacity 300ms ${EASE_OUT}`,
            };
          } else {
            // Gone: falls from wherever it was, in a wave from the cut.
            const was = previous.indexOf(n);
            const from = was >= 0 ? LAYOUTS[answered - 1][was] : null;
            const rank = removedIndex.get(n);
            if (from && rank !== undefined) {
              const delay = Math.round(rank * 260);
              style = {
                transform: `translate(${from.x}px, ${from.y + from.s * 0.6}px) scale(${(from.s / BASE) * 0.7})`,
                opacity: 0,
                transition: `transform 460ms ${EASE_OUT} ${delay}ms, opacity 420ms ${EASE_OUT} ${delay}ms`,
              };
            } else {
              style = { opacity: 0, transition: "none", transform: `translate(${FIELD.x + FIELD.size / 2}px, ${FIELD.y + FIELD.size}px) scale(0.5)` };
            }
          }
          const isFinal = n === FINAL && landing;
          return (
            <g key={n} style={{ ...style, transformOrigin: "0 0", transformBox: "view-box" }}>
              <rect x={-BASE / 2} y={-BASE / 2} width={BASE} height={BASE} rx={BASE * 0.22} fill={isFinal ? "currentColor" : "white"} fillOpacity={isFinal ? 1 : 0.95} style={{ transition: `fill 300ms ${EASE_OUT}` }} />
              <text x={0} y={3.6} textAnchor="middle" fontSize={10} fontWeight={720} fill={isFinal ? "white" : "currentColor"} style={{ fontVariantNumeric: "tabular-nums" }}>
                {n}
              </text>
            </g>
          );
        })}
      </g>

      {/* The question card: wordless apart from the question itself. */}
      <g transform="translate(306 82)" style={{ opacity: landing || resting ? 0.35 : 1, transition: `opacity 400ms ${EASE_OUT}` }}>
        <rect width={158} height={184} rx={22} fill="white" fillOpacity={0.96} />
        <g key={question?.label ?? "none"} style={{ animation: question ? `mind-reader-ask 320ms ${EASE_OUT} both` : undefined }}>
          <text x={79} y={84} textAnchor="middle" fontSize={34} fontWeight={800} fill="currentColor" letterSpacing="-0.02em">
            {question ? question.label : "?"}
          </text>
        </g>
        <Pill x={16} yes active={tapped === true} />
        <Pill x={84} yes={false} active={tapped === false} />
      </g>

      <style>{`@keyframes mind-reader-ask { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
    </svg>
  );
}

/** An answer button on the card: a tick or a cross, filled while it's being pressed. */
function Pill({ x, yes, active }: { x: number; yes: boolean; active: boolean }) {
  return (
    <g transform={`translate(${x} 122)`}>
      <rect width={58} height={40} rx={20} fill={active ? "currentColor" : "white"} stroke="currentColor" strokeWidth={2.5} style={{ transition: `fill 160ms ${EASE_OUT}` }} />
      <path
        d={yes ? "M19 20.5l6.5 6.5 13-13" : "M21 12l16 16M37 12 21 28"}
        fill="none"
        stroke={active ? "white" : "currentColor"}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: `stroke 160ms ${EASE_OUT}` }}
      />
    </g>
  );
}
