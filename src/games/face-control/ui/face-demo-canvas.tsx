"use client";

import { useEffect, useRef } from "react";
import { FaceDemo, type DemoMode } from "../engine/ui/face-demo";
import { tokenColor } from "./canvas-colors";
import { cn } from "@/lib/cn";

/**
 * The calibration glyph: a dot face acting out the current pose over a tiny
 * game strip. Pictorial only, so it shows no numbers. Still under reduced motion.
 */
export function FaceDemoCanvas({ mode, className }: { mode: DemoMode; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const demo = new FaceDemo(canvas, mode, {
      readouts: false,
      colors: {
        bg: null,
        ink: tokenColor(canvas, "--color-fg-muted", 1, "rgba(201, 204, 211, 1)"),
        faint: tokenColor(canvas, "--color-fg", 0.16, "rgba(255, 255, 255, 0.16)"),
        accent: tokenColor(canvas, "--game", 1, "rgba(198, 243, 107, 1)"),
        label: tokenColor(canvas, "--color-fg-subtle", 1, "rgba(154, 160, 171, 1)"),
      },
    });
    return () => demo.destroy();
  }, [mode]);

  return <canvas ref={ref} aria-hidden className={cn("block size-full", className)} />;
}
