"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  cssMatrix3d,
  followFactor,
  matrixFromQuat,
  quatFromMatrix,
  rotationMatrix,
  slerp,
  twinMatrix,
  type Euler,
  type Quat,
} from "../engine/orientation";

/** How the twin should be turned: a raw orientation reading and the heading the visitor faced. */
export interface TwinPose {
  euler: Euler;
  /** Degrees: the direction the phone pointed when the twin was centred. */
  yaw: number;
}

/** The real proportions of a modern phone: 71.5 mm wide, 8.25 mm thick. */
const THICKNESS = 0.115;
const ASPECT = 2.092;
/** Readings come 25 to 60 times a second; this smooths the steps between them without lag you can feel. */
const SMOOTHING_MS = 70;

interface Strip {
  key: string;
  x: number;
  y: number;
  length: number;
  angle: number;
  shade: number;
}

/**
 * The side band of a rounded slab, as thin strips standing on the outline:
 * four straight sides and six segments per corner. Solid from every angle,
 * and each strip is small, so it costs almost nothing to draw.
 */
function bandStrips(width: number, height: number, radius: number, corner = 6): Strip[] {
  const strips: Strip[] = [];
  const straight = (key: string, x: number, y: number, length: number, angle: number, shade: number) =>
    strips.push({ key, x, y, length, angle, shade });
  straight("top", width / 2, 0, width - 2 * radius, 0, 0.9);
  straight("bottom", width / 2, height, width - 2 * radius, 180, 0.55);
  straight("left", 0, height / 2, height - 2 * radius, 270, 0.7);
  straight("right", width, height / 2, height - 2 * radius, 90, 0.75);
  const corners: [string, number, number, number][] = [
    ["tr", width - radius, radius, -90],
    ["br", width - radius, height - radius, 0],
    ["bl", radius, height - radius, 90],
    ["tl", radius, radius, 180],
  ];
  const step = 90 / corner;
  for (const [name, cx, cy, start] of corners) {
    for (let i = 0; i < corner; i++) {
      const mid = ((start + step * (i + 0.5)) * Math.PI) / 180;
      // A hair longer than the chord, so neighbouring strips meet without a seam.
      const length = 2 * radius * Math.sin(((step / 2) * Math.PI) / 180) + 1;
      strips.push({
        key: `${name}${i}`,
        x: cx + radius * Math.cos(mid),
        y: cy + radius * Math.sin(mid),
        length,
        angle: start + step * (i + 0.5) + 90,
        shade: 0.6 + 0.3 * Math.max(0, -Math.sin(mid)),
      });
    }
  }
  return strips;
}

/**
 * A phone on the booth screen that turns exactly like the one in the
 * visitor's hand. Its front is `children` (a PhoneFrame showing the same
 * screen as the real phone), with a metal band and a back with the camera.
 * The pose is eased towards each new reading every frame, straight on the
 * element, so React only renders when a reading arrives.
 */
export function Twin({ pose, width, children, className }: { pose: TwinPose; width: number; children: ReactNode; className?: string }) {
  const body = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const height = width * ASPECT;
  const depth = width * THICKNESS;
  const radius = width * 0.168;
  const strips = useMemo(() => bandStrips(width, height, radius), [width, height, radius]);

  const target = useMemo(() => quatFromMatrix(twinMatrix(rotationMatrix(pose.euler), pose.yaw)), [pose.euler, pose.yaw]);
  const shown = useRef<Quat | null>(null);
  const goal = useRef<Quat>(target);
  // React sets the first pose only; after that the frame loop owns the transform.
  const [firstPose] = useState(() => cssMatrix3d(matrixFromQuat(target)));

  useEffect(() => {
    goal.current = target;
    const el = body.current;
    if (!el) return;
    if (reduce || !shown.current) {
      shown.current = target;
      el.style.transform = cssMatrix3d(matrixFromQuat(target));
      return;
    }
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const current = shown.current ?? goal.current;
      const next = slerp(current, goal.current, followFactor(now - last, SMOOTHING_MS));
      last = now;
      shown.current = next;
      el.style.transform = cssMatrix3d(matrixFromQuat(next));
      const close = Math.abs(next[0] * goal.current[0] + next[1] * goal.current[1] + next[2] * goal.current[2] + next[3] * goal.current[3]);
      if (close < 0.999_999) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [target, reduce]);

  const plate: CSSProperties = { borderRadius: radius, width, height };
  return (
    <div className={cn("relative", className)} style={{ width, height, perspective: width * 4.6 }}>
      {/* A soft shadow on the floor under the phone. */}
      <div
        aria-hidden
        className="absolute left-1/2 top-full h-10 w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(closest-side, oklch(0 0 0 / 0.55), transparent)" }}
      />
      <div ref={body} className="absolute inset-0 [transform-style:preserve-3d]" style={{ transform: firstPose }}>
        {strips.map((s) => (
          <span
            key={s.key}
            aria-hidden
            className="absolute"
            style={{
              left: s.x - s.length / 2,
              top: s.y - depth / 2,
              width: s.length,
              height: depth,
              transform: `rotateZ(${s.angle.toFixed(2)}deg) rotateX(90deg)`,
              background: `linear-gradient(90deg, oklch(${(0.34 * s.shade + 0.1).toFixed(3)} 0.006 262), oklch(${(0.46 * s.shade + 0.12).toFixed(3)} 0.006 262) 50%, oklch(${(0.34 * s.shade + 0.1).toFixed(3)} 0.006 262))`,
            }}
          />
        ))}
        {/* The back: glass, and the camera block in its top corner as you look at it. */}
        <div
          aria-hidden
          className="absolute left-0 top-0 [backface-visibility:hidden]"
          style={{
            ...plate,
            transform: `rotateY(180deg) translateZ(${depth / 2}px)`,
            background: "linear-gradient(150deg, oklch(0.33 0.012 262), oklch(0.22 0.01 262))",
            boxShadow: "inset 0 0 0 2px oklch(0.45 0.008 262)",
          }}
        >
          <span
            className="absolute rounded-[28%] bg-[oklch(0.27_0.01_262)] shadow-[inset_0_0_0_1.5px_oklch(0.42_0.01_262)]"
            style={{ left: width * 0.07, top: width * 0.07, width: width * 0.42, height: width * 0.42 }}
          >
            {[
              [0.06, 0.06],
              [0.06, 0.22],
              [0.22, 0.14],
            ].map(([x, y]) => (
              <span
                key={`${x}-${y}`}
                className="absolute rounded-full bg-[oklch(0.12_0.01_262)] shadow-[0_0_0_2px_oklch(0.38_0.01_262)]"
                style={{ left: width * x, top: width * y, width: width * 0.13, height: width * 0.13 }}
              />
            ))}
          </span>
        </div>
        {/* The front: the screen the visitor sees on their own phone. */}
        <div className="absolute left-0 top-0 [backface-visibility:hidden]" style={{ ...plate, transform: `translateZ(${depth / 2}px)` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
