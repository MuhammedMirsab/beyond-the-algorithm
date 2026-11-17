"use client";

import { useEffect, useRef } from "react";
import { engine } from "../engine/audio/engine";
import { transport } from "../engine/audio/transport";
import { C, font, rgba, rr, type Rgb } from "../engine/instruments/palette";
import { settings } from "../engine/settings";
import type { StudioSession } from "../play/session";
import { cn } from "@/lib/cn";

/** Seconds of the future the lane shows to the right of the "now" line. */
const AHEAD_S = 4.5;
const NOW_AT = 0.16;
/** More distinct keys than this share one row (melodies); fewer get a row each (drum parts). */
const MAX_ROWS = 4;

/**
 * The lesson timeline, ported from the original app: targets slide towards
 * the "now" line on the beat grid, and turn into a verdict colour once judged.
 * Every pill also carries its name, so colour is never the only signal.
 */
export function LessonLane({ session, className }: { session: StudioSession; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current;
      const j = session.lessonJudge;
      if (!cv) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const g = cv.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const nowX = w * NOW_AT;
      const pps = (w - nowX) / AHEAD_S;
      // Targets are due at their beat; the visitor's move shows up `latency` later.
      const t0 = engine.now - settings.get().tracking.latencyMs / 1000;

      if (transport.running) {
        const bd = transport.beatDur;
        const zero = transport.stepTime(0);
        const first = Math.floor((t0 - nowX / pps - zero) / bd);
        for (let b = first; ; b++) {
          const x = nowX + (zero + b * bd - t0) * pps;
          if (x > w) break;
          if (x < 0) continue;
          const bar = ((b % transport.sig.beatsPerBar) + transport.sig.beatsPerBar) % transport.sig.beatsPerBar === 0;
          g.fillStyle = rgba(C.fg, bar ? 0.22 : 0.08);
          g.fillRect(Math.round(x), 0, 1, h);
        }
      }

      if (j) {
        const keys = [...new Set(j.targets.map((t) => t.key))];
        const rows = keys.length <= MAX_ROWS ? keys.length : 1;
        const top = 10;
        const rowH = Math.min(34, (h - top * 2) / rows);
        const y0 = (h - rowH * rows) / 2;
        const px = Math.max(12, Math.min(14, rowH * 0.42));
        g.font = font(650, px);
        g.textBaseline = "middle";
        g.textAlign = "left";
        for (const t of j.targets) {
          const x = nowX + (t.time - t0) * pps;
          if (x < -80 || x > w + 40) continue;
          const row = rows === 1 ? 0 : keys.indexOf(t.key);
          const y = y0 + row * rowH + 3;
          const label = session.labelOf(t.key);
          const pw = Math.max(40, g.measureText(label).width + 20);
          const fill: Rgb | null =
            t.verdict === "perfect" ? C.success : t.verdict === "early" || t.verdict === "late" ? C.warning : t.verdict === "miss" ? C.danger : null;
          rr(g, x - 6, y, pw, rowH - 6, (rowH - 6) / 2);
          g.fillStyle = fill ? rgba(fill) : rgba(C.fg, 0.1);
          g.fill();
          g.lineWidth = 1.5;
          g.strokeStyle = fill ? rgba(fill) : rgba(C.fg, 0.45);
          g.stroke();
          g.fillStyle = fill ? rgba(C.canvas) : rgba(C.fg);
          g.fillText(label, x + 4, y + (rowH - 6) / 2 + 1);
        }
        g.textBaseline = "alphabetic";
      }

      // The "now" line.
      g.fillStyle = rgba(C.game);
      g.fillRect(Math.round(nowX) - 1, 0, 2, h);
      g.font = font(500, 11, "mono");
      g.fillStyle = rgba(C.game);
      g.textAlign = "right";
      g.fillText("NOW", nowX - 6, 14);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [session]);

  return <canvas ref={ref} aria-hidden className={cn("block h-24 w-full", className)} />;
}
