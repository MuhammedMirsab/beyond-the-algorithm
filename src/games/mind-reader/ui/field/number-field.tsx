"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { Clue } from "../../engine/clues";
import { formatNumber } from "../../engine/ranges";
import { EASE_IN_OUT } from "../motion";
import { FieldEngine, type FieldColors } from "./engine";
import { gridFor, slotOf } from "./layout";

function readColors(el: HTMLElement): FieldColors {
  const style = getComputedStyle(el);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    fg: token("--color-fg", "#f6f7f9"),
    game: token("--game", "#ff7fae"),
    gameInk: token("--game-ink", "#2b0d19"),
    font: style.fontFamily || "sans-serif",
  };
}

/**
 * Every number from 1 to max, as the machine sees them. Purely visual: the
 * count and the question are always in text beside it.
 */
export function NumberField({
  max,
  candidates,
  question = null,
  preview = null,
  reveal = false,
  className,
}: {
  max: number;
  /** Numbers still possible, ascending. Keep the array stable between renders. */
  candidates: readonly number[];
  question?: Clue | null;
  preview?: boolean | null;
  /** One number left and confirmed as the guess: it grows into the whole field. */
  reveal?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FieldEngine | null>(null);
  const reduced = useReducedMotion() ?? false;
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new FieldEngine(canvas, { reduced, colors: readColors(canvas) });
    engineRef.current = engine;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width === 0 || box.height === 0) return;
      engine.resize(box.width, box.height, Math.min(2, window.devicePixelRatio || 1));
      setSize((old) => (old && old.w === box.width && old.h === box.height ? old : { w: box.width, h: box.height }));
    });
    observer.observe(canvas);
    let live = true;
    // Labels are drawn in Mona Sans: redraw once the font has arrived.
    void document.fonts?.ready.then(() => {
      if (live) engine.setColors(readColors(canvas));
    });
    return () => {
      live = false;
      observer.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    engineRef.current?.update({ max, candidates, question, preview, reveal });
  }, [max, candidates, question, preview, reveal, reduced]);

  const last = reveal && candidates.length === 1 ? candidates[0] : null;

  return (
    <div className={cn("relative", className)}>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />
      {last !== null && size ? <Reveal value={last} width={size.w} height={size.h} reduced={reduced} /> : null}
    </div>
  );
}

/**
 * The peak moment: the last cell grows from where it sits into the whole
 * field, and the number lands in the scoreboard face.
 */
function Reveal({ value, width, height, reduced }: { value: number; width: number; height: number; reduced: boolean }) {
  const grid = gridFor(1, width, height);
  const { x, y } = slotOf(grid, 0);
  const half = grid.cell / 2;
  const radius = Math.min(grid.cell * 0.22, 16);
  const from = `inset(${y - half}px ${width - x - half}px ${height - y - half}px ${x - half}px round ${radius}px)`;
  const to = "inset(0px 0px 0px 0px round 20px)";

  return (
    <motion.div
      aria-hidden
      className="tile-surface grain absolute inset-0 grid place-items-center rounded-[20px] [container-type:size]"
      initial={reduced ? { clipPath: to, opacity: 0 } : { clipPath: from, opacity: 1 }}
      animate={{ clipPath: to, opacity: 1 }}
      transition={{ duration: reduced ? 0.2 : 0.55, ease: EASE_IN_OUT, delay: 0.08 }}
    >
      <motion.span
        className={cn(
          // The scoreboard face (what type-score sets), sized to the field: the number is the whole point of this moment.
          "relative z-[2] font-dots leading-[0.9] font-extrabold tracking-[0.02em] tabular-nums text-game-ink [font-variation-settings:'ROND'_70]",
          value >= 1000 ? "text-[19cqmin]" : value >= 100 ? "text-[27cqmin]" : "text-[38cqmin]",
        )}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", duration: 0.6, bounce: 0.3, delay: reduced ? 0.15 : 0.5 }}
      >
        {formatNumber(value)}
      </motion.span>
    </motion.div>
  );
}
