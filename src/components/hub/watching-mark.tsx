"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { BY_HUE } from "./spectrum-mark";

/* The brand mark drawn large, in user units: ten dots stacked 1, 2, 3, 4. */
const GAP = 100;
const RISE = GAP * 0.866;
const R = 40;
const PUPIL = 16;
/** How far a pupil can travel from the centre of its eye. */
const TRAVEL = R - PUPIL - 6;
const W = GAP * 3 + R * 2;
const H = Math.round((RISE * 3 + R * 2) * 10) / 10;

const EYES = (() => {
  const eyes: { cx: number; cy: number; slug: (typeof BY_HUE)[number] }[] = [];
  let i = 0;
  for (let row = 0; row < 4; row++) {
    for (let k = 0; k <= row; k++) {
      eyes.push({ cx: Math.round(W / 2 + (k - row / 2) * GAP), cy: Math.round(R + row * RISE), slug: BY_HUE[i++] });
    }
  }
  return eyes;
})();

/**
 * The footer's sign-off: the brand mark's ten dots open their eyes and follow
 * the visitor's pointer, blinking now and then. It is the arcade's whole idea
 * as a joke: every game here was watching. Left alone (or on a touch screen)
 * the eyes glance around by themselves. Decorative; under reduced motion the
 * eyes stay open and still.
 */
export function WatchingMark({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const eyeRefs = useRef<(SVGGElement | null)[]>([]);
  const pupilRefs = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Eyes open the first time the mark scrolls into view.
    let raf = 0;
    let running = false;
    let blinkTimer = 0;
    let glanceTimer = 0;
    const look = { x: 0, y: 0 };
    let haveLook = false;
    const offsets = EYES.map(() => ({ x: 0, y: 0 }));
    let last = performance.now();

    // A mouse is followed for as long as it is there. With no mouse (a phone,
    // or before the first move) the eyes glance around on their own.
    const glance = () => {
      const rect = svg.getBoundingClientRect();
      const angle = Math.random() * Math.PI * 2;
      const reach = 80 + Math.random() * 260;
      look.x = rect.left + rect.width / 2 + Math.cos(angle) * reach * 1.6;
      look.y = rect.top + rect.height / 2 + Math.sin(angle) * reach;
      haveLook = true;
      glanceTimer = window.setTimeout(glance, 900 + Math.random() * 2200);
    };
    const stopGlancing = () => {
      window.clearTimeout(glanceTimer);
      glanceTimer = 0;
    };

    const tick = (now: number) => {
      const step = Math.min(4, (now - last) / (1000 / 60));
      last = now;
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / W;
      const ease = 1 - 0.8 ** step;
      EYES.forEach((eye, i) => {
        let tx = 0;
        let ty = 0;
        if (haveLook) {
          const dx = look.x - (rect.left + eye.cx * scale);
          const dy = look.y - (rect.top + eye.cy * scale);
          const dist = Math.hypot(dx, dy);
          if (dist > 0.5) {
            const reach = TRAVEL * (1 - Math.exp(-dist / 140));
            tx = (dx / dist) * reach;
            ty = (dy / dist) * reach;
          }
        }
        const o = offsets[i];
        o.x += (tx - o.x) * ease;
        o.y += (ty - o.y) * ease;
        const pupil = pupilRefs.current[i];
        if (pupil) pupil.style.translate = `${o.x.toFixed(2)}px ${o.y.toFixed(2)}px`;
      });
      raf = requestAnimationFrame(tick);
    };

    const blink = () => {
      const all = Math.random() < 0.2;
      const pick = Math.floor(Math.random() * EYES.length);
      eyeRefs.current.forEach((eye, i) => {
        if (!eye || (!all && i !== pick)) return;
        eye.animate([{ scale: "1 1" }, { scale: "1 0.08" }, { scale: "1 1" }], {
          duration: 190,
          delay: all ? i * 18 : 0,
          easing: "ease-in-out",
        });
      });
      blinkTimer = window.setTimeout(blink, 1800 + Math.random() * 3400);
    };

    let following = false;
    const onPointer = (e: PointerEvent) => {
      look.x = e.clientX;
      look.y = e.clientY;
      haveLook = true;
      stopGlancing();
      following = e.pointerType !== "touch";
      // A tap is looked at for a moment, then the glancing resumes.
      if (!following) glanceTimer = window.setTimeout(glance, 2400);
    };

    const start = () => {
      svg.dataset.awake = "true";
      if (reduce || running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerdown", onPointer, { passive: true });
      blinkTimer = window.setTimeout(blink, 1400);
      if (!following) glanceTimer = window.setTimeout(glance, 700);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.clearTimeout(blinkTimer);
      stopGlancing();
    };

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry?.isIntersecting) start();
        else stop();
      },
      { rootMargin: "80px 0px" },
    );
    io.observe(svg);
    return () => {
      io.disconnect();
      stop();
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden
      className={cn("watching-mark h-auto overflow-visible", className)}
    >
      {EYES.map((eye, i) => (
        <g
          key={eye.slug}
          ref={(el) => {
            eyeRefs.current[i] = el;
          }}
          style={{ transformOrigin: `${eye.cx}px ${eye.cy}px` }}
        >
          <circle cx={eye.cx} cy={eye.cy} r={R} fill={`var(--color-${eye.slug})`} />
          <g
            ref={(el) => {
              pupilRefs.current[i] = el;
            }}
            className="watching-pupil"
            style={{ transformOrigin: `${eye.cx}px ${eye.cy}px`, ["--i" as string]: i }}
          >
            <circle cx={eye.cx} cy={eye.cy} r={PUPIL} fill="var(--color-canvas)" />
            <circle cx={eye.cx - PUPIL * 0.34} cy={eye.cy - PUPIL * 0.34} r={PUPIL * 0.3} fill="var(--color-fg)" opacity={0.9} />
          </g>
        </g>
      ))}
    </svg>
  );
}
