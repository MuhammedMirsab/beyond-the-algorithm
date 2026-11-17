"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

const COLUMNS = 40;

/**
 * What the model "sees": the 1,280 numbers MobileNet made from a photo, one
 * dot per number in a 40 x 32 grid. Bigger dot, bigger number. Same position,
 * same number, so two grids can be compared dot by dot.
 *
 * Drawn once per vector (no animation loop), on a canvas so 1,280 dots stay cheap.
 */
export function EmbeddingDots({
  values,
  label,
  className,
}: {
  values: Float32Array;
  /** Accessible description of what the dots are. */
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      const rows = Math.ceil(values.length / COLUMNS);
      const cell = Math.min(width / COLUMNS, height / rows);
      const offsetX = (width - cell * COLUMNS) / 2;
      const offsetY = (height - cell * rows) / 2;
      let max = 0;
      for (let i = 0; i < values.length; i++) max = Math.max(max, values[i]);

      // Empty slots, so the grid reads as 1,280 places even where a number is 0.
      // The line-strong token, with a plain fallback for canvases that can't parse oklch().
      ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
      ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--color-line-strong").trim() || ctx.fillStyle;
      for (let i = 0; i < values.length; i++) {
        const x = offsetX + ((i % COLUMNS) + 0.5) * cell;
        const y = offsetY + (Math.floor(i / COLUMNS) + 0.5) * cell;
        ctx.fillRect(x - 0.5 * dpr, y - 0.5 * dpr, dpr, dpr);
      }

      // The numbers, in the game colour (read from CSS so the token stays the source).
      ctx.fillStyle = getComputedStyle(canvas).color;
      for (let i = 0; i < values.length; i++) {
        const v = max > 0 ? values[i] / max : 0;
        if (v < 0.04) continue;
        const r = cell * 0.46 * Math.sqrt(v);
        const x = offsetX + ((i % COLUMNS) + 0.5) * cell;
        const y = offsetY + (Math.floor(i / COLUMNS) + 0.5) * cell;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [values]);

  return <canvas ref={ref} role="img" aria-label={label} className={cn("block aspect-[5/4] w-full text-game", className)} />;
}
