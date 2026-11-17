"use client";

import { useEffect, useRef } from "react";
import { engine } from "../engine/audio/engine";
import { transport } from "../engine/audio/transport";
import { cn } from "@/lib/cn";

/**
 * The beat, as dots lit from the audio clock (no React render per beat).
 * The first beat of the bar is the wider dot.
 */
export function BeatDots({ beats, className }: { beats: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let lit = -2;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = ref.current;
      if (!el) return;
      let on = -1;
      if (transport.running) {
        const p = transport.position(engine.now - engine.outputLatency);
        if (p.frac < 0.35) on = p.beatInBar;
      }
      if (on === lit) return;
      lit = on;
      const dots = el.children;
      for (let i = 0; i < dots.length; i++) dots[i].setAttribute("data-on", String(i === on));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [beats]);

  return (
    <span ref={ref} aria-hidden className={cn("inline-flex items-center gap-1", className)}>
      {Array.from({ length: beats }, (_, i) => (
        <span
          key={i}
          data-on="false"
          className={cn(
            "h-2 rounded-full bg-fg/25 transition-colors duration-100 data-[on=true]:bg-game",
            i === 0 ? "w-3.5" : "w-2",
          )}
        />
      ))}
    </span>
  );
}
