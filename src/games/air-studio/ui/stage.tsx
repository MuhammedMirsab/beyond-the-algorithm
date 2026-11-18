"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { motion, readPalette } from "../engine/instruments/palette";
import { resetViewport, setViewport } from "../engine/tracking/reach";
import { tracker } from "../engine/tracking/tracker";
import type { StudioSession } from "../play/session";
import { cn } from "@/lib/cn";

/** Most of the canvas is plain shapes: 1.5x is sharp enough and leaves the GPU to the hand model. */
const MAX_DPR = 1.5;
/** Keep instruments this far inside the free area between the HUD and the dock. */
const VIEW_MARGIN = 10;

interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The full-bleed stage: the mirrored camera (or a dotted field for the
 * mouse) and one canvas on top. The canvas spans the camera picture as
 * object-fit: cover shows it, so landmark and instrument coordinates
 * (0 to 1 of the picture) line up with the video. One animation-frame loop
 * ticks the session and draws.
 *
 * `playArea` is the free space between the HUD and the dock; the instruments
 * are laid out inside it.
 */
export function Stage({
  session,
  simulated,
  videoOpacity,
  playArea,
  className,
}: {
  session: StudioSession;
  simulated: boolean;
  /** 0 to 1. */
  videoOpacity: number;
  playArea: RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<FrameBox>({ x: 0, y: 0, w: 1, h: 1 });

  // The camera's video element belongs to the tracker; show it here.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || simulated) return;
    const video = tracker.video;
    Object.assign(video.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      transform: "scaleX(-1)",
    });
    host.append(video);
    if (video.srcObject) void video.play().catch(() => {});
  }, [simulated]);

  useEffect(() => {
    const root = rootRef.current;
    if (root) readPalette(root);
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => {
      motion.reduced = query.matches;
    };
    onMotion();
    query.addEventListener("change", onMotion);
    return () => query.removeEventListener("change", onMotion);
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastView = "";
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const root = rootRef.current;
      const canvas = canvasRef.current;
      if (!root || !canvas) return;
      const sw = root.clientWidth;
      const sh = root.clientHeight;
      if (!sw || !sh) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      if (canvas.width !== Math.round(sw * dpr) || canvas.height !== Math.round(sh * dpr)) {
        canvas.width = Math.round(sw * dpr);
        canvas.height = Math.round(sh * dpr);
      }

      // The picture's box: the camera covers the stage; simulated hands use the stage itself.
      let box: FrameBox;
      if (simulated) {
        box = { x: 0, y: 0, w: sw, h: sh };
        tracker.simAspect = sw / sh;
      } else {
        const aspect = tracker.aspect || 4 / 3;
        const scale = Math.max(sw / aspect, sh);
        const w = scale * aspect;
        const h = scale;
        box = { x: (sw - w) / 2, y: (sh - h) / 2, w, h };
      }
      frameRef.current = box;

      // Where instruments may go: the free area, in picture coordinates.
      const area = playArea.current;
      if (area) {
        const r = area.getBoundingClientRect();
        const s = root.getBoundingClientRect();
        const x0 = (r.left - s.left + VIEW_MARGIN - box.x) / box.w;
        const x1 = (r.right - s.left - VIEW_MARGIN - box.x) / box.w;
        const y0 = (r.top - s.top + VIEW_MARGIN - box.y) / box.h;
        const y1 = (r.bottom - s.top - VIEW_MARGIN - box.y) / box.h;
        const key = [x0, x1, y0, y1].map((v) => v.toFixed(4)).join();
        if (key !== lastView) {
          lastView = key;
          const c = (v: number) => Math.max(0, Math.min(1, v));
          setViewport({ x0: c(x0), x1: c(x1), y0: c(y0), y1: c(y1) });
        }
      } else if (lastView) {
        lastView = "";
        resetViewport();
      }

      const now = performance.now();
      session.tick(now);
      const g = canvas.getContext("2d");
      if (!g) return;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.setTransform(dpr, 0, 0, dpr, box.x * dpr, box.y * dpr);
      session.draw(g, box.w, box.h, now);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      resetViewport();
    };
  }, [session, simulated, playArea]);

  // Simulated hands: the pointer is the right hand (its fingertip or palm, whichever the instrument plays with).
  const toFrame = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return null;
    const s = root.getBoundingClientRect();
    const box = frameRef.current;
    return { x: (clientX - s.left - box.x) / box.w, y: (clientY - s.top - box.y) / box.h };
  };

  return (
    <div
      ref={rootRef}
      className={cn("absolute inset-0 overflow-hidden", simulated ? "dot-field bg-sunken" : "bg-black", simulated && "touch-none", className)}
      onPointerMove={(e) => {
        if (!simulated) return;
        const p = toFrame(e.clientX, e.clientY);
        if (p) tracker.simPointer(p.x, p.y);
      }}
      onPointerDown={(e) => {
        if (!simulated || (e.pointerType === "mouse" && e.button !== 0)) return;
        // A click or tap plays like a quick strike of the pretend hand.
        const p = toFrame(e.clientX, e.clientY);
        if (p) tracker.simStrike(p.x, p.y);
      }}
      onPointerLeave={() => {
        if (simulated) tracker.simHide();
      }}
    >
      <div
        ref={hostRef}
        aria-hidden
        className="absolute inset-0 transition-opacity duration-300 ease-out"
        style={{ opacity: simulated ? 0 : videoOpacity }}
      />
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />
    </div>
  );
}
