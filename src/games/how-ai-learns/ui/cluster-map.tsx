"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import type { Point2, TrainMap } from "../engine/projection";
import { NONE_LABEL } from "../engine/rules";

const W = 400;
const H = 300;
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Each group gets its own mark, so the map never depends on colour alone. */
type Mark = "dot" | "square" | "diamond" | "ring";
const MARKS: Mark[] = ["dot", "square", "diamond"];

export function markFor(label: string, labels: readonly string[]): Mark {
  if (label === NONE_LABEL) return "ring";
  const visitor = labels.filter((l) => l !== NONE_LABEL);
  return MARKS[Math.max(0, visitor.indexOf(label)) % MARKS.length];
}

/** One mark at (0, 0); `size` is its radius. */
function MarkShape({ mark, size, className }: { mark: Mark; size: number; className?: string }) {
  if (mark === "square") return <rect x={-size * 0.85} y={-size * 0.85} width={size * 1.7} height={size * 1.7} rx={size * 0.35} className={cn("fill-fg", className)} />;
  if (mark === "diamond") return <path d={`M0 ${-size * 1.15}L${size * 1.15} 0L0 ${size * 1.15}L${-size * 1.15} 0Z`} className={cn("fill-game-deep", className)} />;
  if (mark === "ring") return <circle r={size * 0.8} fill="none" strokeWidth={size * 0.45} className={cn("stroke-fg-subtle", className)} />;
  return <circle r={size} className={cn("fill-game", className)} />;
}

/** A legend swatch for a group, as a tiny SVG. */
export function MarkSwatch({ label, labels, className }: { label: string; labels: readonly string[]; className?: string }) {
  return (
    <svg viewBox="-8 -8 16 16" aria-hidden className={cn("size-3.5 shrink-0", className)}>
      <MarkShape mark={markFor(label, labels)} size={5.5} />
    </svg>
  );
}

/**
 * The visitor's photos as dots: each photo's 1,280 numbers flattened onto two
 * directions (see engine/projection.ts). Photos of the same thing land
 * together. A live dot can show where the camera's current frame lands.
 */
export function ClusterMap({
  map,
  labels,
  live = null,
  answer = null,
  fly = false,
  className,
  label,
}: {
  map: TrainMap;
  /** Every group's label, in the order the visitor named them. */
  labels: readonly string[];
  /** Where the camera's frame lands now, 0..1. */
  live?: Point2 | null;
  /** The group the model just answered with, highlighted. */
  answer?: string | null;
  /** Dots fly out from the centre (the first time the map appears). */
  fly?: boolean;
  className?: string;
  /** Accessible description. */
  label: string;
}) {
  const reduce = useReducedMotion();
  const centres = labels.map((name) => {
    const pts = map.points.filter((p) => p.label === name);
    if (!pts.length) return null;
    return {
      name,
      x: (pts.reduce((s, p) => s + p.x, 0) / pts.length) * W,
      y: (pts.reduce((s, p) => s + p.y, 0) / pts.length) * H,
    };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className={cn("block w-full", className)}>
      {map.points.map((p, i) => {
        const x = p.x * W;
        const y = p.y * H;
        const animated = fly && !reduce;
        return (
          <motion.g
            key={p.id}
            initial={animated ? { x: W / 2, y: H / 2, opacity: 0 } : false}
            animate={{ x, y, opacity: 1 }}
            transition={{ type: "spring", duration: 0.7, bounce: 0.15, delay: animated ? Math.min(i, 40) * 0.012 : 0 }}
          >
            <MarkShape mark={markFor(p.label, labels)} size={5.5} />
          </motion.g>
        );
      })}

      {centres.map((c) => {
        if (!c) return null;
        const on = answer === c.name;
        const text = c.name.length > 16 ? `${c.name.slice(0, 15)}…` : c.name;
        const width = text.length * 7.6 + 22;
        // Above the group's middle, kept inside the map.
        const x = Math.min(W - width / 2 - 4, Math.max(width / 2 + 4, c.x));
        const y = Math.max(16, c.y - 22);
        return (
          <motion.g
            key={c.name}
            initial={fly && !reduce ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: fly && !reduce ? 0.6 : 0, ease: EASE_OUT }}
          >
            <rect
              x={x - width / 2}
              y={y - 12}
              width={width}
              height={24}
              rx={12}
              className={cn("transition-colors duration-150", on ? "fill-game" : "fill-raised")}
              stroke="oklch(1 0 0 / 0.12)"
            />
            <text
              x={x}
              y={y + 4.5}
              textAnchor="middle"
              fontSize={13}
              fontWeight={600}
              className={cn("transition-colors duration-150", on ? "fill-game-ink" : "fill-fg")}
              style={{ fontFamily: "var(--font-mona)" }}
            >
              {text}
            </text>
          </motion.g>
        );
      })}

      {live ? (
        <motion.g
          initial={false}
          animate={{ x: live.x * W, y: live.y * H }}
          transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.45, bounce: 0.1 }}
        >
          <circle r={13} className="fill-game/25" />
          <circle r={8} className="fill-canvas stroke-fg" strokeWidth={3} />
          <circle r={3.5} className="fill-fg" />
        </motion.g>
      ) : null}
    </svg>
  );
}
