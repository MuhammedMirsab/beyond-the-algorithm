"use client";

import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatNumber, halvingsFor } from "../engine/ranges";
import { gridFor, slotOf } from "./field/layout";
import { EASE_OUT } from "./motion";

/*
 * Small pictures for the How it works cards. Each one plays once when it
 * scrolls into view, uses the visitor's own numbers where there are any, and
 * shows its finished state straight away under reduced motion.
 */

const VIEW_W = 240;
const VIEW_H = 112;

function usePlay<T extends Element>() {
  const ref = useRef<T>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion() ?? false;
  return { ref, play: inView || reduced, reduced };
}

function Frame({ children, caption, className }: { children: ReactNode; caption?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-40 flex-col justify-center gap-3 p-4", className)}>
      {children}
      {caption ? <div className="type-caption tabular-nums text-fg-subtle">{caption}</div> : null}
    </div>
  );
}

/**
 * Why k questions are always enough: 2^k cells, the visitor's numbers lit,
 * then k cuts, each keeping the half that holds their number, down to one cell.
 */
export function CapacityGrid({ max, pin }: { max: number; pin: number }) {
  const { ref, play, reduced } = usePlay<SVGSVGElement>();
  const k = halvingsFor(max);
  const total = 2 ** k;
  const cols = 2 ** (Math.ceil(k / 2) + (k >= 9 ? 1 : 0));
  const rows = total / cols;
  const pitch = Math.min(VIEW_W / cols, VIEW_H / rows);
  const gap = pitch >= 10 ? pitch * 0.16 : pitch * 0.12;
  const w = cols * pitch;
  const h = rows * pitch;
  const pinIndex = Math.min(Math.max(pin, 1), max) - 1;
  const pinCol = pinIndex % cols;
  const pinRow = Math.floor(pinIndex / cols);

  // The cuts: alternate columns and rows, always keeping the side with the pin.
  const cuts: { x: number; y: number; w: number; h: number }[] = [];
  let c0 = 0;
  let c1 = cols;
  let r0 = 0;
  let r1 = rows;
  for (let i = 0; i < k; i++) {
    if (c1 - c0 >= r1 - r0) {
      const mid = (c0 + c1) / 2;
      if (pinCol < mid) {
        cuts.push({ x: mid, y: r0, w: c1 - mid, h: r1 - r0 });
        c1 = mid;
      } else {
        cuts.push({ x: c0, y: r0, w: mid - c0, h: r1 - r0 });
        c0 = mid;
      }
    } else {
      const mid = (r0 + r1) / 2;
      if (pinRow < mid) {
        cuts.push({ x: c0, y: mid, w: c1 - c0, h: r1 - mid });
        r1 = mid;
      } else {
        cuts.push({ x: c0, y: r0, w: c1 - c0, h: mid - r0 });
        r0 = mid;
      }
    }
  }
  const beat = Math.min(0.42, 3.2 / k);

  return (
    <Frame caption={`Room for ${formatNumber(total)}: your ${formatNumber(max)} lit, ${k} cuts to 1`}>
      <svg ref={ref} aria-hidden viewBox={`0 0 ${w} ${h}`} className="mx-auto block w-full max-w-[15rem]">
        {Array.from({ length: total }, (_, i) => {
          const x = (i % cols) * pitch;
          const y = Math.floor(i / cols) * pitch;
          const lit = i < max;
          return (
            <rect
              key={i}
              x={x + gap / 2}
              y={y + gap / 2}
              width={pitch - gap}
              height={pitch - gap}
              rx={Math.min(3, pitch * 0.2)}
              className={lit ? "fill-game" : "fill-fg/15"}
            />
          );
        })}
        {cuts.map((cut, i) => (
          <motion.rect
            key={i}
            x={cut.x * pitch}
            y={cut.y * pitch}
            width={cut.w * pitch}
            height={cut.h * pitch}
            className="fill-sunken"
            initial={{ opacity: 0 }}
            animate={{ opacity: play ? 0.78 : 0 }}
            transition={{ duration: reduced ? 0 : 0.3, ease: EASE_OUT, delay: reduced ? 0 : 0.3 + i * beat }}
          />
        ))}
        <motion.rect
          x={c0 * pitch + gap / 2 - 1}
          y={r0 * pitch + gap / 2 - 1}
          width={pitch - gap + 2}
          height={pitch - gap + 2}
          rx={Math.min(3, pitch * 0.2) + 1}
          fill="none"
          className="stroke-fg"
          strokeWidth={Math.max(1, pitch * 0.12)}
          initial={{ opacity: 0 }}
          animate={{ opacity: play ? 1 : 0 }}
          transition={{ duration: 0.25, ease: EASE_OUT, delay: reduced ? 0 : 0.3 + k * beat }}
        />
      </svg>
    </Frame>
  );
}

/** A count that runs from 0 to `to` in `duration` seconds once `play` turns on. */
function Counter({ to, duration, play }: { to: number; duration: number; play: boolean }) {
  const value = useMotionValue(0);
  const text = useTransform(value, (v) => formatNumber(Math.round(v)));
  useEffect(() => {
    if (!play) return;
    if (duration <= 0) {
      value.set(to);
      return;
    }
    const controls = animate(value, to, { duration, ease: "linear" });
    return () => controls.stop();
  }, [play, to, duration, value]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}

/**
 * Asking one number at a time against halving, at the same pace: one
 * question per tick. Halving is done before the other has really started.
 */
export function RaceBars({ max }: { max: number }) {
  const { ref, play, reduced } = usePlay<HTMLDivElement>();
  const linear = max - 1;
  const halving = halvingsFor(max);
  const run = reduced ? 0 : 2.6;
  const rows = [
    { label: "One at a time", count: linear, share: 1, tone: "bg-fg-muted" },
    { label: "Halving", count: halving, share: Math.max(halving / linear, 0.02), tone: "bg-game" },
  ];
  return (
    <Frame caption="Questions needed in the worst case">
      <div ref={ref} aria-hidden className="flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="type-small text-fg-muted">{row.label}</span>
              <span className="type-title-3 text-fg">
                <Counter to={row.count} duration={run * (row.count / linear)} play={play} />
              </span>
            </div>
            <span className="block h-2.5 overflow-hidden rounded-full bg-fg/10">
              <motion.span
                className={cn("block h-full origin-left rounded-full", row.tone)}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: play ? row.share : 0 }}
                transition={{ duration: run * row.share, ease: "linear" }}
              />
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/**
 * The even question on the visitor's own list: the numbers it crossed out
 * are scattered (every other one), not a block, yet they are still half.
 */
export function ParityComb({ before, keepEven }: { before: readonly number[]; keepEven: boolean }) {
  const { ref, play, reduced } = usePlay<SVGSVGElement>();
  const grid = gridFor(before.length, VIEW_W, VIEW_H);
  const labelled = grid.cell >= 17;
  const out = before.filter((n) => (n % 2 === 0) !== keepEven).length;

  return (
    <Frame caption={`${formatNumber(before.length)} to ${formatNumber(before.length - out)}: every ${keepEven ? "odd" : "even"} number crossed out`}>
      <svg ref={ref} aria-hidden viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="block w-full">
        {before.map((n, i) => {
          const { x, y } = slotOf(grid, i);
          const goes = (n % 2 === 0) !== keepEven;
          const size = grid.cell;
          return (
            <motion.g
              key={n}
              initial={{ opacity: 1 }}
              animate={{ opacity: play && goes ? 0.14 : 1 }}
              transition={{ duration: 0.35, ease: EASE_OUT, delay: reduced ? 0 : 0.35 + (i / before.length) * 0.8 }}
            >
              <rect x={x - size / 2} y={y - size / 2} width={size} height={size} rx={Math.min(5, size * 0.22)} className="fill-game" />
              {labelled ? (
                <text
                  x={x}
                  y={y + size * 0.13}
                  textAnchor="middle"
                  fontSize={size * (n >= 100 ? 0.32 : 0.4)}
                  fontWeight={650}
                  className="fill-game-ink"
                >
                  {n}
                </text>
              ) : null}
            </motion.g>
          );
        })}
      </svg>
    </Frame>
  );
}

/**
 * One wrong answer, drawn on 1 to 8: the visitor thinks of 3, answers the
 * second question wrongly, 3 is crossed out, and the search ends on 2.
 */
export function SlipRows() {
  const { ref, play, reduced } = usePlay<SVGSVGElement>();
  const pitch = 28;
  const size = 24;
  const rows: { cells: number[]; keep: number[]; slip?: boolean }[] = [
    { cells: [1, 2, 3, 4, 5, 6, 7, 8], keep: [1, 2, 3, 4] },
    { cells: [1, 2, 3, 4], keep: [1, 2], slip: true },
    { cells: [1, 2], keep: [2] },
  ];
  const rowGap = 36;

  return (
    <Frame caption="You think of 3. One wrong answer, and it ends on 2.">
      <svg ref={ref} aria-hidden viewBox={`0 0 ${8 * pitch} ${rows.length * rowGap}`} className="mx-auto block w-full max-w-[15rem]">
        {rows.map((row, r) => {
          const offset = ((8 - row.cells.length) * pitch) / 2;
          const delay = reduced ? 0 : 0.2 + r * 0.55;
          return (
            <motion.g key={r} initial={{ opacity: 0 }} animate={{ opacity: play ? 1 : 0 }} transition={{ duration: 0.3, ease: EASE_OUT, delay }}>
              {row.cells.map((n, i) => {
                const x = offset + i * pitch + (pitch - size) / 2;
                const y = r * rowGap + 4;
                const goes = !row.keep.includes(n);
                const pinned = n === 3;
                return (
                  <g key={n}>
                    <motion.rect
                      x={x}
                      y={y}
                      width={size}
                      height={size}
                      rx={6}
                      className="fill-game"
                      initial={{ opacity: 1 }}
                      animate={{ opacity: play && goes ? 0.16 : 1 }}
                      transition={{ duration: 0.35, ease: EASE_OUT, delay: delay + 0.3 }}
                    />
                    <text x={x + size / 2} y={y + size / 2 + 4.5} textAnchor="middle" fontSize={13} fontWeight={650} className="fill-game-ink">
                      {n}
                    </text>
                    {pinned ? (
                      <rect x={x - 2.5} y={y - 2.5} width={size + 5} height={size + 5} rx={8} fill="none" strokeWidth={2} className="stroke-fg" />
                    ) : null}
                    {pinned && row.slip ? (
                      <motion.g initial={{ opacity: 0 }} animate={{ opacity: play ? 1 : 0 }} transition={{ duration: 0.2, delay: delay + 0.45 }}>
                        <circle cx={x + size + 1} cy={y - 1} r={7} className="fill-fg" />
                        <path
                          d={`M${x + size - 2} ${y - 4}l6 6m0 -6l-6 6`}
                          strokeWidth={2}
                          strokeLinecap="round"
                          className="stroke-canvas"
                        />
                      </motion.g>
                    ) : null}
                  </g>
                );
              })}
            </motion.g>
          );
        })}
      </svg>
    </Frame>
  );
}

/**
 * Guessing the middle on the visitor's range: whichever way the answer
 * goes, the same half of the numbers is gone.
 */
export function MiddleSplit({ max }: { max: number }) {
  const { ref, play, reduced } = usePlay<HTMLDivElement>();
  const middle = Math.floor((1 + max) / 2);
  const lines = [
    { word: "Higher", keepFrom: middle + 1, keepTo: max },
    { word: "Lower", keepFrom: 1, keepTo: middle - 1 },
  ];
  return (
    <Frame caption={`Guess ${formatNumber(middle)}: either answer leaves about half`}>
      <div ref={ref} aria-hidden className="flex flex-col gap-4">
        {lines.map((line, i) => {
          const from = (line.keepFrom - 1) / max;
          const to = line.keepTo / max;
          return (
            <div key={line.word} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="type-small font-semibold text-fg">{line.word}</span>
                <span className="type-caption tabular-nums text-fg-subtle">
                  {formatNumber(line.keepFrom)} to {formatNumber(line.keepTo)} left
                </span>
              </div>
              <span className="relative block h-3 rounded-full bg-fg/10">
                <motion.span
                  className="absolute inset-y-0 rounded-full bg-game"
                  style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%` }}
                  initial={{ opacity: 0.25 }}
                  animate={{ opacity: play ? 1 : 0.25 }}
                  transition={{ duration: 0.4, ease: EASE_OUT, delay: reduced ? 0 : 0.3 + i * 0.5 }}
                />
                <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-fg" style={{ left: `${((middle - 0.5) / max) * 100}%` }} />
              </span>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

/**
 * The worst case of halving, as bars that each keep half of the one above:
 * 100, 50, 25, 13, 7, 4, 2, 1.
 */
export function HalvingBars({ start }: { start: number }) {
  const { ref, play, reduced } = usePlay<HTMLOListElement>();
  const chain = [start];
  while (chain[chain.length - 1] > 1) chain.push(Math.ceil(chain[chain.length - 1] / 2));
  const beat = Math.min(0.22, 2 / chain.length);
  return (
    <Frame caption={`${chain.length - 1} halvings from ${formatNumber(start)} to 1`}>
      <ol ref={ref} aria-hidden className="flex flex-col gap-[3px]">
        {chain.map((n, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-2">
            <span className="block h-[7px] overflow-hidden rounded-full">
              <motion.span
                className="block h-full origin-left rounded-full bg-game"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: play ? Math.max(n / start, 0.015) : 0 }}
                transition={{ duration: reduced ? 0 : 0.45, ease: EASE_OUT, delay: reduced ? 0 : 0.2 + i * beat }}
              />
            </span>
            <span className="text-right text-[0.6875rem] font-semibold leading-none tabular-nums text-fg-muted">{formatNumber(n)}</span>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

/** The visitor's own clues: how much of what was left each one kept. Half is the best a yes or no can do. */
export function ClueSplits({ clues }: { clues: readonly { question: string; before: number; after: number }[] }) {
  const { ref, play, reduced } = usePlay<HTMLOListElement>();
  return (
    <Frame caption="Lit: what each answer left">
      <ol ref={ref} aria-hidden className="flex flex-col gap-3">
        {clues.slice(0, 3).map((clue, i) => (
          <li key={clue.question} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[0.75rem] font-semibold text-fg">{clue.question}</span>
              <span className="shrink-0 text-[0.6875rem] tabular-nums text-fg-subtle">
                {formatNumber(clue.before)} → {formatNumber(clue.after)}
              </span>
            </span>
            <span className="relative block h-2 overflow-hidden rounded-full bg-fg/10">
              <motion.span
                className="block h-full origin-left rounded-full bg-game"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: play ? Math.max(clue.after / clue.before, 0.02) : 1 }}
                transition={{ duration: reduced ? 0 : 0.5, ease: EASE_OUT, delay: reduced ? 0 : 0.3 + i * 0.25 }}
              />
              <span className="absolute inset-y-0 left-1/2 w-px bg-fg/60" />
            </span>
          </li>
        ))}
      </ol>
    </Frame>
  );
}
