"use client";

import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { PenFrame } from "../engine/airPen";
import { cssColor } from "../engine/canvasColor";
import { drawStroke, drawStrokes, inkSizeFor } from "../engine/render";
import type { StrokeStore } from "../engine/strokes";
import { cn } from "@/lib/cn";

/** The original app's canvas colours, mapped onto the design tokens. */
const INK_VARS = {
  "--ink": "var(--color-fg)",
  "--accent": "var(--game)",
  "--accent-soft": "var(--game-soft)",
  "--ink-2": "var(--color-fg-subtle)",
} as CSSProperties;

interface InkColors {
  ink: string;
  accent: string;
  /** Null when the canvas can't parse the soft token; then accent is drawn at low alpha. */
  soft: string | null;
  muted: string;
}

/** Right-click drag erases with the mouse. Radius in surface-height units. */
const POINTER_ERASER_R = 0.045;

/**
 * Two stacked canvases: committed ink (redrawn only when strokes change)
 * and a live layer (current stroke + fingertip cursor, redrawn every frame).
 * Mouse, touch and stylus draw here too, so the reading half works without a camera.
 */
export function WritingSurface({
  store,
  frameRef,
  sizeRef,
  pointerEnabled,
  onActivity,
  className,
}: {
  store: StrokeStore;
  frameRef: RefObject<PenFrame | null>;
  sizeRef: RefObject<{ width: number; height: number }>;
  pointerEnabled: boolean;
  onActivity: () => void;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const colors = useRef<InkColors>({ ink: "#f7f8fa", accent: "#5cb8f2", soft: null, muted: "#9aa1ad" });
  const dprRef = useRef(1);
  const pointerDrawing = useRef(false);
  const pointerEraser = useRef<{ x: number; y: number; r: number; active: boolean } | null>(null);

  // Size the canvases to the element at device resolution; redraw ink when strokes change.
  useEffect(() => {
    const root = rootRef.current;
    const ink = inkRef.current;
    const live = liveRef.current;
    if (!root || !ink || !live) return;

    colors.current = {
      ink: cssColor(root, "--ink", "#f7f8fa"),
      accent: cssColor(root, "--accent", "#5cb8f2"),
      soft: cssColor(root, "--accent-soft", "") || null,
      muted: cssColor(root, "--ink-2", "#9aa1ad"),
    };

    const redrawInk = () => {
      const ctx = ink.getContext("2d");
      if (!ctx) return;
      const { width, height } = sizeRef.current;
      const dpr = dprRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      drawStrokes(ctx, store.strokes, width, height, { size: inkSizeFor(width, height), color: colors.current.ink });
    };

    const resize = () => {
      const rect = root.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dprRef.current = dpr;
      sizeRef.current.width = Math.max(1, rect.width);
      sizeRef.current.height = Math.max(1, rect.height);
      for (const c of [ink, live]) {
        c.width = Math.round(rect.width * dpr);
        c.height = Math.round(rect.height * dpr);
      }
      redrawInk();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(root);
    const unsubscribe = store.subscribe(redrawInk);
    return () => {
      ro.disconnect();
      unsubscribe();
    };
  }, [store, sizeRef]);

  // Live layer: the stroke being written and the cursor. Direct feedback, so it runs even with reduced motion.
  useEffect(() => {
    const live = liveRef.current;
    const ctx = live?.getContext("2d");
    if (!live || !ctx) return;
    let raf = 0;
    const tick = () => {
      const { width, height } = sizeRef.current;
      const dpr = dprRef.current;
      const size = inkSizeFor(width, height);
      const c = colors.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (store.current) drawStroke(ctx, store.current, width, height, { size, color: c.ink }, false);

      const frame = frameRef.current;
      const eraser = frame?.handVisible ? frame.eraser : pointerEraser.current;
      const halo = (x: number, y: number, r: number) => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (c.soft) {
          ctx.fillStyle = c.soft;
          ctx.fill();
        } else {
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = c.accent;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      };

      if (eraser) {
        const x = eraser.x * width;
        const y = eraser.y * height;
        const r = eraser.r * height;
        ctx.lineWidth = 1.5;
        if (eraser.active) {
          halo(x, y, r);
          ctx.strokeStyle = c.accent;
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = c.muted;
          ctx.setLineDash([5, 6]);
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (frame?.handVisible && frame.cursor) {
        const x = Math.min(Math.max(frame.cursor.x, 0), 1) * width;
        const y = Math.min(Math.max(frame.cursor.y, 0), 1) * height;
        // Two looks that can't be confused, matching the status chip: pen down is a
        // solid nib in the game colour with a glow; pen lifted is an empty dashed ring.
        if (frame.penDown) {
          halo(x, y, size * 0.5 + 12);
          ctx.fillStyle = c.accent;
          ctx.beginPath();
          ctx.arc(x, y, size * 0.5 + 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = c.muted;
          ctx.lineWidth = 2;
          ctx.globalAlpha = frame.settling ? 0.45 : 0.95;
          ctx.setLineDash([4, 5]);
          ctx.beginPath();
          ctx.arc(x, y, size * 0.5 + 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = c.muted;
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [store, frameRef, sizeRef]);

  const toPoint = (e: { clientX: number; clientY: number }) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height, t: performance.now() };
  };

  const aspect = () => sizeRef.current.width / sizeRef.current.height;

  const finish = () => {
    if (pointerEraser.current) {
      pointerEraser.current = null;
      store.eraseEnd();
    }
    if (!pointerDrawing.current) return;
    pointerDrawing.current = false;
    store.end();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerEnabled || (e.button !== 0 && e.button !== 2)) return;
    const p = toPoint(e);
    if (!p) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; drawing works without it.
    }
    if (e.button === 2) {
      pointerEraser.current = { x: p.x, y: p.y, r: POINTER_ERASER_R, active: true };
      store.eraseBegin();
      store.eraseSegment(p, p, POINTER_ERASER_R, aspect());
    } else {
      pointerDrawing.current = true;
      store.begin(p, "pointer");
    }
    onActivity();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const er = pointerEraser.current;
    if (er) {
      const p = toPoint(e);
      if (!p) return;
      store.eraseSegment(er, p, er.r, aspect());
      pointerEraser.current = { ...er, x: p.x, y: p.y };
      return;
    }
    if (!pointerDrawing.current) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = toPoint(ev);
      if (p) store.add(p);
    }
  };

  return (
    <div
      ref={rootRef}
      style={INK_VARS}
      className={cn("absolute inset-0 touch-none select-none", pointerEnabled ? "cursor-crosshair" : "cursor-default", className)}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <canvas ref={inkRef} className="absolute inset-0 size-full" />
      <canvas ref={liveRef} className="absolute inset-0 size-full" />
    </div>
  );
}
