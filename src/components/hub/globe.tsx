"use client";

import createGlobe from "cobe";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { GLOBE_SAMPLES, JEDDAH } from "./globe-config";

const TAU = Math.PI * 2;
const focusPhi = (lon: number) => Math.PI - ((lon * Math.PI) / 180 - Math.PI / 2);
/** Shortest signed turn from one angle to another, in (-PI, PI]. */
const turnTo = (from: number, to: number) => {
  const d = (((to - from) % TAU) + TAU) % TAU;
  return d > Math.PI ? d - TAU : d;
};

/** Where the globe rests: the visitor's dot a little left of centre. */
const HOME = focusPhi(JEDDAH[1]) - 0.38;
/** A slow sway around home, so the globe feels alive but keeps the dot in view. */
const SWAY = 0.3;
const SWAY_PERIOD_MS = 15000;

/**
 * The world as a computer stores it: a few thousand points, with the visitor
 * pinned on it. Drag to spin it away and it always swings back to find you,
 * which is the whole arcade in one gesture. Rendering pauses off screen; under
 * reduced motion it neither sways nor swings back.
 */
export function Globe({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let size = canvas.offsetWidth;
    let phi = HOME;
    const theta = 0.28;
    let dragFrom: { x: number; phi: number } | null = null;
    let velocity = 0;
    let last = performance.now();
    const born = last;

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size * dpr,
      height: size * dpr,
      phi,
      theta,
      dark: 1,
      diffuse: 1.4,
      mapSamples: GLOBE_SAMPLES,
      mapBrightness: 7,
      mapBaseBrightness: 0.04,
      baseColor: [0.32, 0.33, 0.38],
      markerColor: [1, 1, 1],
      glowColor: [0.1, 0.11, 0.14],
      markers: [{ location: JEDDAH, size: 0.055, id: "jeddah" }],
      markerElevation: 0.02,
      opacity: 0.92,
    });

    let raf = 0;
    let running = false;
    const tick = (now: number) => {
      // Frame-rate independent: 1 = one 60 Hz frame.
      const step = Math.min(4, (now - last) / (1000 / 60));
      last = now;
      if (!dragFrom) {
        if (Math.abs(velocity) > 0.0006) {
          phi += velocity * step;
          velocity *= 0.95 ** step;
        } else if (!reduce) {
          velocity = 0;
          const target = HOME + SWAY * Math.sin(((now - born) / SWAY_PERIOD_MS) * TAU);
          phi += turnTo(phi, target) * (1 - 0.965 ** step);
        }
      }
      globe.update({ phi, width: size * dpr, height: size * dpr });
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry?.isIntersecting) start();
        else stop();
      },
      { rootMargin: "120px 0px" },
    );
    io.observe(canvas);

    const ro = new ResizeObserver(() => {
      size = canvas.offsetWidth;
      globe.update({ width: size * dpr, height: size * dpr });
    });
    ro.observe(canvas);

    let lastX = 0;
    const onDown = (e: PointerEvent) => {
      dragFrom = { x: e.clientX, phi };
      lastX = e.clientX;
      velocity = 0;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!dragFrom) return;
      phi = dragFrom.phi + ((e.clientX - dragFrom.x) / size) * Math.PI;
      velocity = ((e.clientX - lastX) / size) * Math.PI * 0.5;
      lastX = e.clientX;
    };
    const onUp = (e: PointerEvent) => {
      if (!dragFrom) return;
      dragFrom = null;
      velocity = Math.max(-0.12, Math.min(0.12, velocity));
      canvas.style.cursor = "";
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    // Fade in once the first frame is drawn, so the canvas never pops in.
    requestAnimationFrame(() => {
      canvas.style.opacity = "1";
    });

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      globe.destroy();
    };
  }, []);

  return (
    <div className={cn("relative aspect-square", className)}>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="size-full cursor-grab touch-pan-y opacity-0 transition-opacity duration-700 ease-out"
      />
      {/* Pinned to the visitor's dot (see .globe-here in globals.css). */}
      <span aria-hidden className="globe-here">
        <span className="globe-ping" />
        <span className="absolute bottom-1.5 left-0 h-3.5 w-[1.5px] -translate-x-1/2 rounded-full bg-fg/80" />
        <span className="absolute bottom-5 left-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-fg px-3 py-1 text-[0.8125rem] font-semibold leading-5 text-canvas shadow-[0_6px_20px_oklch(0_0_0/0.45)]">
          You are here
        </span>
      </span>
    </div>
  );
}
