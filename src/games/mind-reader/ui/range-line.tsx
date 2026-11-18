"use client";

import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/cn";
import type { GuessRecord } from "../engine/human";
import { formatNumber } from "../engine/ranges";
import { EASE_IN_OUT, EASE_OUT } from "./motion";

/** The wave that dims ruled-out numbers takes this long, then the line zooms in. */
const WAVE_MS = 360;
const ZOOM_DELAY = 0.38;
const ZOOM_S = 0.6;

/** What changed last, so the dimming wave starts in the right place. */
export type LineFocus = { kind: "guess"; value: number } | { kind: "clue" } | null;

/** The part of the line to show: the numbers still possible, with a little room either side. */
export function viewFor(low: number, high: number, max: number, reveal: number | null): [number, number] {
  if (reveal !== null) {
    const half = Math.max(4, Math.min(12, max / 10));
    return clampView(reveal - half, reveal + half, max);
  }
  const span = high - low + 1;
  if (span >= max * 0.7) return [0.5, max + 0.5];
  const pad = Math.max(1.5, span * 0.18);
  return clampView(low - 0.5 - pad, high + 0.5 + pad, max);
}

function clampView(a: number, b: number, max: number): [number, number] {
  const width = b - a;
  let start = Math.max(0.5, a);
  let end = start + width;
  if (end > max + 0.5) {
    end = max + 0.5;
    start = Math.max(0.5, end - width);
  }
  return [start, end];
}

/**
 * The visitor's search on the number line. Every number is a cell; the ones
 * still possible are lit. Guesses stand on the line as pins pointing the way
 * to the number. After each guess the crossed-out side dims in a wave from
 * the pin, then the line zooms in on what's left. Click or tap a number to
 * put it in the guess box.
 */
export function RangeLine({
  max,
  possible,
  guesses,
  focus,
  reveal = null,
  onPick,
  className,
}: {
  max: number;
  /** Numbers still possible, ascending. */
  possible: readonly number[];
  guesses: readonly GuessRecord[];
  focus: LineFocus;
  /** The number, shown at the end of a round. */
  reveal?: number | null;
  onPick?: (n: number) => void;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const svgRef = useRef<SVGSVGElement>(null);
  const low = possible[0] ?? 1;
  const high = possible[possible.length - 1] ?? max;
  const [t0, t1] = viewFor(low, high, max, reveal);

  const a = useMotionValue(t0);
  const b = useMotionValue(t1);
  const [initialViewBox] = useState(() => `${t0} 0 ${t1 - t0} 10`);
  const viewBox = useTransform([a, b], ([x0, x1]: number[]) => `${x0} 0 ${x1 - x0} 10`);
  useMotionValueEvent(viewBox, "change", (value) => svgRef.current?.setAttribute("viewBox", value));

  useEffect(() => {
    const options = { duration: reduced ? 0 : ZOOM_S, ease: EASE_IN_OUT, delay: reduced ? 0 : ZOOM_DELAY };
    const ca = animate(a, t0, options);
    const cb = animate(b, t1, options);
    return () => {
      ca.stop();
      cb.stop();
    };
  }, [a, b, t0, t1, reduced]);

  const lit = useMemo(() => new Set(possible), [possible]);
  const cells = useMemo(() => Array.from({ length: max }, (_, i) => i + 1), [max]);
  const span = t1 - t0;
  const width = span > 240 ? 1 : 0.8;

  // Pins with bubbles: the guesses that fence the window in, and the latest one.
  const fences = useMemo(() => {
    const keep = new Set<number>();
    let below: GuessRecord | null = null;
    let above: GuessRecord | null = null;
    for (const g of guesses) {
      if (g.result === "higher" && (!below || g.value > below.value)) below = g;
      if (g.result === "lower" && (!above || g.value < above.value)) above = g;
    }
    if (below) keep.add(below.value);
    if (above) keep.add(above.value);
    const last = guesses[guesses.length - 1];
    if (last) keep.add(last.value);
    return keep;
  }, [guesses]);

  // A staggered fade, not movement, so it stays under reduced motion (and render output never depends on it).
  const delayFor = (n: number) => {
    if (!focus) return 0;
    if (focus.kind === "guess") return Math.min(1, Math.abs(n - focus.value) / Math.max(8, span * 0.6)) * WAVE_MS;
    return ((n - low) / Math.max(1, high - low)) * WAVE_MS;
  };

  // Numbers are written on the cells once they're wide enough to hold them.
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setTrackWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const labelled = trackWidth > 0 && trackWidth / span >= (max >= 1000 ? 30 : 22);
  const labels = labelled ? cells.filter((n) => n >= t0 && n <= t1) : [];

  const [hover, setHover] = useState<number | null>(null);
  const numberAt = (e: MouseEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const share = (e.clientX - box.left) / Math.max(1, box.width);
    return Math.min(max, Math.max(1, Math.round(a.get() + share * (b.get() - a.get()))));
  };

  const last = guesses[guesses.length - 1];

  return (
    <div className={cn("relative select-none", className)}>
      {/* Pins stand above the line; their stems run down across it. */}
      <div className="relative h-12 overflow-x-clip">
        {guesses.map((g) => (
          <Pin key={g.value} guess={g} a={a} b={b} bubble={fences.has(g.value)} latest={g === last} />
        ))}
        {reveal !== null && !guesses.some((g) => g.value === reveal) ? <RevealPin value={reveal} a={a} b={b} /> : null}
      </div>

      <div
        ref={trackRef}
        className={cn("relative h-14 overflow-hidden rounded-md bg-fg/[0.04] sm:h-16", onPick && "cursor-pointer")}
        onPointerMove={onPick ? (e) => setHover(numberAt(e)) : undefined}
        onPointerLeave={() => setHover(null)}
        onClick={onPick ? (e) => onPick(numberAt(e)) : undefined}
        aria-hidden
      >
        <svg ref={svgRef} viewBox={initialViewBox} preserveAspectRatio="none" className="absolute inset-0 block size-full">
          {cells.map((n) => (
            <rect
              key={n}
              x={n - width / 2}
              y={0}
              width={width}
              height={10}
              className="fill-game"
              style={{
                fillOpacity: lit.has(n) ? 1 : 0.13,
                transition: `fill-opacity 300ms cubic-bezier(0.22, 1, 0.36, 1) ${Math.round(delayFor(n))}ms`,
              }}
            />
          ))}
        </svg>
        {labels.map((n) => (
          <CellLabel key={n} value={n} a={a} b={b} lit={lit.has(n)} />
        ))}
        {guesses.map((g) => (
          <Stem key={g.value} value={g.value} a={a} b={b} />
        ))}
        {hover !== null ? <HoverMark value={hover} a={a} b={b} possible={lit.has(hover)} /> : null}
      </div>

      <div aria-hidden className="relative mt-2 h-6 overflow-x-clip">
        <EdgeLabel value={low} side="start" a={a} b={b} />
        {high !== low ? <EdgeLabel value={high} side="end" a={a} b={b} /> : null}
      </div>
    </div>
  );
}

function useX(value: number, a: MotionValue<number>, b: MotionValue<number>, offset = 0) {
  return useTransform([a, b], ([x0, x1]: number[]) => `${((value + offset - x0) / (x1 - x0)) * 100}%`);
}

/** A guess on the line: a bubble with the number and the way to go, over a stem. */
function Pin({ guess, a, b, bubble, latest }: { guess: GuessRecord; a: MotionValue<number>; b: MotionValue<number>; bubble: boolean; latest: boolean }) {
  const left = useX(guess.value, a, b);
  const correct = guess.result === "correct";
  return (
    <motion.div className="absolute inset-y-0 w-0" style={{ left }}>
      <motion.span
        className={cn(
          "absolute bottom-1 left-0 inline-flex h-8 -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[0.9375rem] font-bold tabular-nums [&_svg]:size-4",
          correct ? "bg-game text-game-ink" : latest ? "bg-fg text-canvas" : "bg-raised text-fg shadow-ring",
        )}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: bubble || correct ? 1 : 0, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
      >
        {guess.result === "lower" ? <ArrowLeft strokeWidth={2.75} aria-hidden /> : null}
        {formatNumber(guess.value)}
        {guess.result === "higher" ? <ArrowRight strokeWidth={2.75} aria-hidden /> : null}
        {correct ? <Check strokeWidth={2.75} aria-hidden /> : null}
      </motion.span>
    </motion.div>
  );
}

/** A number written on its cell: dark on the lit ones, faint on the crossed-out ones. */
function CellLabel({ value, a, b, lit }: { value: number; a: MotionValue<number>; b: MotionValue<number>; lit: boolean }) {
  const left = useX(value, a, b);
  return (
    <motion.span className="pointer-events-none absolute inset-y-0 w-0" style={{ left }}>
      <span
        className={cn(
          "absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.8125rem] font-bold tabular-nums transition-colors duration-300 ease-out",
          lit ? "text-game-ink" : "text-fg-faint",
        )}
      >
        {formatNumber(value)}
      </span>
    </motion.span>
  );
}

/** The guess marked on the line itself. */
function Stem({ value, a, b }: { value: number; a: MotionValue<number>; b: MotionValue<number> }) {
  const left = useX(value, a, b);
  return (
    <motion.span className="pointer-events-none absolute inset-y-0 w-0" style={{ left }}>
      <span className="absolute inset-y-0 -left-[1.5px] w-[3px] rounded-full bg-fg" />
    </motion.span>
  );
}

/** Under the pointer: which number a click would pick. */
function HoverMark({ value, a, b, possible }: { value: number; a: MotionValue<number>; b: MotionValue<number>; possible: boolean }) {
  const left = useX(value, a, b);
  return (
    <motion.span className="pointer-events-none absolute inset-y-0 w-0" style={{ left }}>
      <span className="absolute inset-y-0 -left-px w-0.5 bg-fg/70" />
      <span
        className={cn(
          "absolute left-0 top-1/2 inline-flex h-7 -translate-x-1/2 -translate-y-1/2 items-center rounded-full px-2 text-[0.8125rem] font-bold tabular-nums shadow-float",
          possible ? "bg-fg text-canvas" : "bg-raised text-fg-muted",
        )}
      >
        {formatNumber(value)}
      </span>
    </motion.span>
  );
}

/** The end of the round: where its number was. */
function RevealPin({ value, a, b }: { value: number; a: MotionValue<number>; b: MotionValue<number> }) {
  const left = useX(value, a, b);
  return (
    <motion.div className="absolute inset-y-0 w-0" style={{ left }}>
      <motion.span
        className="absolute bottom-1 left-0 inline-flex h-8 -translate-x-1/2 items-center whitespace-nowrap rounded-full bg-game px-3 text-[0.9375rem] font-bold tabular-nums text-game-ink"
        initial={{ opacity: 0, y: -10, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", duration: 0.5, bounce: 0.3, delay: 0.5 }}
      >
        {formatNumber(value)}
      </motion.span>
    </motion.div>
  );
}

/** The lowest or highest number still possible, under its end of the lit stretch. */
function EdgeLabel({ value, side, a, b }: { value: number; side: "start" | "end"; a: MotionValue<number>; b: MotionValue<number> }) {
  const left = useX(value, a, b, side === "start" ? -0.5 : 0.5);
  return (
    <motion.span className="absolute top-0 w-0" style={{ left }}>
      <span
        className={cn(
          "type-label absolute top-0 whitespace-nowrap tabular-nums text-fg-muted",
          side === "start" ? "left-0" : "right-0",
        )}
      >
        {formatNumber(value)}
      </span>
    </motion.span>
  );
}
