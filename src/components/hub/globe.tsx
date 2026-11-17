"use client";

import createGlobe from "cobe";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { GLOBE_SAMPLES, JEDDAH } from "./globe-config";

const focusPhi = (lon: number) => Math.PI - ((lon * Math.PI) / 180 - Math.PI / 2);

/**
 * The world as a computer stores it: a few thousand points. Drag to spin.
 * Rendering pauses off screen and under reduced motion it stays still.
 */
export function Globe({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let size = canvas.offsetWidth;
    let phi = focusPhi(JEDDAH[1]) - 0.5;
    const theta = 0.28;
    let dragFrom: { x: number; phi: number } | null = null;
    let velocity = 0;

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
    const tick = () => {
      if (!dragFrom) {
        if (Math.abs(velocity) > 0.0001) {
          phi += velocity;
          velocity *= 0.94;
        } else if (!reduce) {
          phi += 0.0018;
        }
      }
      globe.update({ phi, width: size * dpr, height: size * dpr });
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (running) return;
      running = true;
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

    const onDown = (e: PointerEvent) => {
      dragFrom = { x: e.clientX, phi };
      velocity = 0;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    let lastX = 0;
    const onMove = (e: PointerEvent) => {
      if (!dragFrom) return;
      const next = dragFrom.phi + ((e.clientX - dragFrom.x) / size) * Math.PI;
      velocity = (e.clientX - lastX) / size;
      lastX = e.clientX;
      phi = next;
    };
    const onUp = (e: PointerEvent) => {
      if (!dragFrom) return;
      dragFrom = null;
      velocity = Math.max(-0.05, Math.min(0.05, velocity * 2));
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
    </div>
  );
}
