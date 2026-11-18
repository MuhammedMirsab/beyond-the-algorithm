"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";

/** "12 ms late", "8 ms early" or "on the beat", for an average offset. */
export function offsetWords(ms: number | null): string | null {
  if (ms === null) return null;
  if (Math.abs(ms) < 1) return "on the beat";
  return `${Math.abs(ms)} ms ${ms > 0 ? "late" : "early"}`;
}

/**
 * Every note's distance from the beat, in played order: dots above the
 * middle line were late, below were early. The band is the on-time window.
 * Ported from the original app's offset chart.
 */
export function OffsetChart({ offsets, window: win, reveal = false, className }: { offsets: number[]; window: number; reveal?: boolean; className?: string }) {
  if (offsets.length < 2) return null;
  const W = 640;
  const H = 150;
  const padL = 52;
  const padR = 12;
  const padT = 14;
  const padB = 24;
  const lim = Math.max(win * 2, ...offsets.map((o) => Math.abs(o))) * 1.1;
  const x = (i: number) => padL + (i / Math.max(1, offsets.length - 1)) * (W - padL - padR);
  // Late is up: it reads as "after the beat".
  const y = (v: number) => padT + (1 - (v + lim) / (2 * lim)) * (H - padT - padB);
  const tick = Math.round((lim * 0.8) / 10) * 10;
  const late = offsets.filter((o) => o > win).length;
  const early = offsets.filter((o) => o < -win).length;
  return (
    <figure className={cn("flex flex-col gap-3", className)}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="type-body font-semibold text-fg">Each note against the beat</span>
        <span className="type-small text-fg-subtle">
          {offsets.length - late - early} within ±{win} ms, {early} early, {late} late
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`${offsets.length} notes. ${offsets.length - late - early} within ${win} milliseconds of the beat, ${early} early, ${late} late.`}
      >
        <rect x={padL} y={y(win)} width={W - padL - padR} height={y(-win) - y(win)} className="fill-fg/[0.07]" />
        {[tick, 0, -tick].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-fg/35" : "stroke-fg/10"} strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="fill-fg-subtle font-mono text-[11px]">
              {t > 0 ? `+${t}` : t}
            </text>
          </g>
        ))}
        <text x={padL} y={H - 6} className="fill-fg-subtle text-[11px]">
          First note
        </text>
        <text x={W - padR} y={H - 6} textAnchor="end" className="fill-fg-subtle text-[11px]">
          Last
        </text>
        <motion.polyline
          points={offsets.map((o, i) => `${x(i)},${y(o)}`).join(" ")}
          fill="none"
          className="stroke-game/40"
          strokeWidth={1.5}
          initial={reveal ? { pathLength: 0 } : false}
          animate={{ pathLength: 1, transition: { duration: 1.1, ease: "linear", delay: 0.5 } }}
        />
        {offsets.map((o, i) => (
          // When revealed, each note lands in playing order, left to right.
          <motion.circle
            key={i}
            cx={x(i)}
            cy={y(o)}
            r={4.5}
            className={Math.abs(o) <= win ? "fill-game" : "fill-fg"}
            initial={reveal ? { opacity: 0, scale: 0.3 } : false}
            animate={{ opacity: 1, scale: 1, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1], delay: 0.5 + (i / Math.max(1, offsets.length - 1)) * 1.1 } }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        ))}
      </svg>
    </figure>
  );
}

/** A number with its label; "Not applicable" when the take can't have one. */
export function Metric({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={cn("tabular-nums", value === null ? "type-body pt-1 font-semibold text-fg-subtle" : "type-title-2 text-fg")}>{value ?? "Not applicable"}</span>
      <span className="type-caption text-fg-subtle">{label}</span>
    </div>
  );
}

export function Recommendations({ items, className }: { items: string[]; className?: string }) {
  if (!items.length) return null;
  return (
    <section className={cn("flex flex-col gap-3", className)} aria-label="What to try next">
      <h3 className="type-title-3 text-fg">What to try next</h3>
      <ul className="flex flex-col gap-2">
        {items.map((r) => (
          <li key={r} className="type-body flex gap-3 text-fg-muted">
            <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-game" />
            {r}
          </li>
        ))}
      </ul>
    </section>
  );
}
