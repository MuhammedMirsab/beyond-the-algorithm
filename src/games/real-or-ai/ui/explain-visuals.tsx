"use client";

import Image from "next/image";
import { useInView, useReducedMotion } from "motion/react";
import { Bot, Camera } from "lucide-react";
import { useEffect, useEffectEvent, useRef, type ReactNode, type RefObject } from "react";
import type { ClueSpot } from "../engine/clues";
import { loupeBackground, type Size } from "../engine/geometry";
import type { PairPhoto } from "../engine/types";
import { cn } from "@/lib/cn";

/**
 * The motion graphics for How it works, drawn from the visitor's own photos.
 * Each one is a short loop that runs only while it is on screen, writes
 * styles straight to the DOM (no React render per frame), and holds a still
 * frame that tells the whole story under reduced motion.
 */

const VISUAL_SIZES = "(min-width: 1024px) 360px, (min-width: 768px) 45vw, 100vw";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/**
 * Calls `frame(seconds)` every animation frame while `ref` is on screen
 * (starting from 0 each time it comes into view), `frame(0)` while it's off
 * screen, and `frame(still)` once under reduced motion.
 */
function useLoop(ref: RefObject<Element | null>, frame: (t: number) => void, still: number) {
  const inView = useInView(ref, { amount: 0.35 });
  const reduce = useReducedMotion();
  const draw = useEffectEvent(frame);
  useEffect(() => {
    if (reduce) {
      draw(still);
      return;
    }
    if (!inView) {
      draw(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      draw((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, still]);
}

/** The element's size in CSS pixels, kept current without a render. */
function useBoxSize(ref: RefObject<HTMLElement | null>) {
  const size = useRef<Size>({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      size.current = { width: el.clientWidth, height: el.clientHeight };
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

// ───────────────────────────── noise

const NOISE_FRAMES = 6;

/** Static: random brightness around mid grey with a little colour in each pixel, the way an image model's noise looks. */
function makeNoise(width: number, height: number): ImageData[] {
  const frames: ImageData[] = [];
  for (let f = 0; f < NOISE_FRAMES; f++) {
    const img = new ImageData(width, height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const grey = (Math.random() + Math.random()) * 127.5;
      d[i] = grey + (Math.random() - 0.5) * 70;
      d[i + 1] = grey + (Math.random() - 0.5) * 70;
      d[i + 2] = grey + (Math.random() - 0.5) * 70;
      d[i + 3] = 255;
    }
    frames.push(img);
  }
  return frames;
}

/** A canvas of static over the photo; `paint(t, level)` sets how much of the photo it covers. */
function useNoise(ratio: number) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frames = useRef<ImageData[] | null>(null);
  const shownFrame = useRef(-1);
  const width = 150;
  const height = Math.max(40, Math.round(width / ratio));

  const paint = (t: number, level: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.opacity = String(Math.round(level * 1000) / 1000);
    if (level < 0.01) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    frames.current ??= makeNoise(width, height);
    // About 14 new frames of static a second: it should crawl, not strobe.
    const frame = Math.floor(t * 14) % NOISE_FRAMES;
    if (frame === shownFrame.current) return;
    shownFrame.current = frame;
    ctx.putImageData(frames.current[frame], 0, 0);
  };

  const layer = (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[2] size-full opacity-0 [image-rendering:pixelated]"
    />
  );
  return { paint, layer };
}

// ───────────────────────────── shared pieces

function Frame({ ratio, frameRef, children, className }: { ratio: number; frameRef?: RefObject<HTMLDivElement | null>; children: ReactNode; className?: string }) {
  return (
    <div ref={frameRef} className={cn("relative w-full overflow-hidden bg-sunken", className)} style={{ aspectRatio: ratio }}>
      {children}
    </div>
  );
}

function Photo({ photo, alt, imgRef, className }: { photo: PairPhoto; alt: string; imgRef?: RefObject<HTMLImageElement | null>; className?: string }) {
  return (
    <Image
      ref={imgRef}
      src={photo.src}
      alt={alt}
      fill
      sizes={VISUAL_SIZES}
      draggable={false}
      className={cn("select-none object-cover object-center", className)}
    />
  );
}

/** A small label in a photo's corner, as the game draws them. */
export function CornerTag({ kind, className }: { kind: "real" | "ai"; className?: string }) {
  const Icon = kind === "real" ? Camera : Bot;
  return (
    <span
      className={cn(
        "absolute left-2.5 top-2.5 z-[4] inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[0.8125rem] font-semibold [&_svg]:size-3.5",
        kind === "real" ? "bg-canvas text-fg shadow-ring" : "bg-game text-game-ink",
        className,
      )}
    >
      <Icon aria-hidden strokeWidth={2.25} />
      {kind === "real" ? "Real photo" : "AI-made"}
    </span>
  );
}

/**
 * A round lens. `place` sets it at (cx, cy) with diameter d, showing the photo
 * magnified about (lookX, lookY): by default the point under its own centre.
 */
function useLens(photo: PairPhoto, zoom: number) {
  const lensRef = useRef<HTMLDivElement>(null);
  const place = (box: Size, cx: number, cy: number, d: number, show: number, lookX = cx, lookY = cy) => {
    const lens = lensRef.current;
    if (!lens || box.width === 0) return;
    const bg = loupeBackground(box, photo, lookX, lookY, zoom, d);
    lens.style.width = `${d}px`;
    lens.style.height = `${d}px`;
    lens.style.transform = `translate3d(${cx - d / 2}px, ${cy - d / 2}px, 0) scale(${0.85 + 0.15 * show})`;
    lens.style.opacity = String(Math.round(show * 1000) / 1000);
    lens.style.backgroundSize = `${bg.sizeX}px ${bg.sizeY}px`;
    lens.style.backgroundPosition = `${bg.posX}px ${bg.posY}px`;
  };
  const element = (
    <div
      ref={lensRef}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-[3] rounded-full bg-sunken bg-no-repeat opacity-0 shadow-float ring-[3px] ring-fg"
      style={{ backgroundImage: `url("${photo.src}")` }}
    />
  );
  return { place, element };
}

// ───────────────────────────── step 1: the real photo, fine detail and all

/** The real photo, a lens drifting over the fine detail the model will have to redraw. */
export function RealDetailVisual({ photo, ratio, spot, alt }: { photo: PairPhoto; ratio: number; spot: ClueSpot; alt: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const box = useBoxSize(frameRef);
  const lens = useLens(photo, 2.6);

  useLoop(
    frameRef,
    (t) => {
      const { width, height } = box.current;
      const d = Math.max(72, width * 0.36);
      // A slow figure of eight around the spot, kept inside the photo.
      const fx = clamp01(spot.x + 0.06 * Math.sin((t / 6) * Math.PI * 2));
      const fy = clamp01(spot.y + 0.04 * Math.sin((t / 6) * Math.PI * 4));
      const cx = Math.min(width - d / 2, Math.max(d / 2, fx * width));
      const cy = Math.min(height - d / 2, Math.max(d / 2, fy * height));
      lens.place(box.current, cx, cy, d, 1);
    },
    0,
  );

  return (
    <Frame ratio={ratio} frameRef={frameRef}>
      <Photo photo={photo} alt={alt} />
      {lens.element}
      <CornerTag kind="real" />
    </Frame>
  );
}

// ───────────────────────────── step 2: noise goes on

/** The same photo under rising and falling static: the fine detail goes first, the big shapes last. */
export function NoiseVisual({ photo, ratio, alt }: { photo: PairPhoto; ratio: number; alt: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const noise = useNoise(ratio);

  useLoop(
    frameRef,
    (t) => {
      // 0.1 to 0.85 and back over five seconds. At the top the big shapes still show through.
      const level = t === 0 ? 0.1 : 0.1 + 0.75 * (0.5 - 0.5 * Math.cos((t / 5) * Math.PI * 2));
      const img = imgRef.current;
      if (img) img.style.filter = `blur(${(level * 5).toFixed(2)}px) saturate(${(1 - 0.35 * level).toFixed(3)})`;
      noise.paint(t, level * 0.72);
      if (meterRef.current) meterRef.current.style.transform = `scaleX(${level.toFixed(3)})`;
    },
    2.1,
  );

  return (
    <Frame ratio={ratio} frameRef={frameRef}>
      <Photo photo={photo} alt={alt} imgRef={imgRef} />
      {noise.layer}
      <div className="absolute inset-x-2.5 bottom-2.5 z-[4] flex items-center gap-2 rounded-full bg-canvas/85 py-1.5 pl-3 pr-2">
        <span className="type-label text-fg-muted">Noise</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fg/15">
          <div ref={meterRef} className="h-full origin-left rounded-full bg-game" style={{ transform: "scaleX(0.15)" }} />
        </div>
      </div>
    </Frame>
  );
}

// ───────────────────────────── step 3: noise comes off, detail is invented

const DENOISE_STEPS = 6;
const DENOISE_LOOP = 7;
const DENOISE_STILL = 5;

/**
 * Static clearing in steps; under it the scene sharpens into the AI copy.
 * Then the ring and the lens find the detail it invented.
 */
export function DenoiseVisual({
  real,
  ai,
  ratio,
  spot,
  alt,
}: {
  real: PairPhoto;
  ai: PairPhoto;
  ratio: number;
  spot: ClueSpot;
  alt: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const box = useBoxSize(frameRef);
  const realRef = useRef<HTMLImageElement>(null);
  const aiRef = useRef<HTMLImageElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLSpanElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const noise = useNoise(ratio);
  const lens = useLens(ai, 2.6);

  useLoop(
    frameRef,
    (time) => {
      const t = time % DENOISE_LOOP;
      // Which step of the clean-up we're on, eased in over 0.15 s at each step.
      const stepT = (t - 0.3) / 0.5;
      const whole = Math.floor(stepT);
      const done = clamp01((whole + easeOut(clamp01((stepT - whole) / 0.3))) / DENOISE_STEPS);
      const renoise = easeInOut(seg(t, 6.2, 6.9));
      const clean = t < 0.3 ? 0 : Math.max(0, done - renoise);
      const level = 0.8 * (1 - clean);

      if (realRef.current) {
        realRef.current.style.filter = `blur(${(level * 6).toFixed(2)}px) saturate(${(1 - 0.35 * level).toFixed(3)})`;
        realRef.current.style.opacity = String((1 - clean).toFixed(3));
      }
      if (aiRef.current) aiRef.current.style.opacity = String(easeInOut(clean).toFixed(3));
      noise.paint(time, level);

      const lit = Math.min(DENOISE_STEPS, Math.round(clean * DENOISE_STEPS));
      const marks = stepsRef.current?.children;
      if (marks) for (let i = 0; i < marks.length; i++) (marks[i] as HTMLElement).dataset.on = i < lit ? "true" : "false";

      // The found slip: a ring, then the lens.
      const found = easeOut(seg(t, 3.6, 4.1)) * (1 - seg(t, 6, 6.4));
      const { width, height } = box.current;
      if (ringRef.current) {
        ringRef.current.style.opacity = String(found.toFixed(3));
        ringRef.current.style.transform = `translate(-50%, -50%) scale(${(1.6 - 0.6 * found).toFixed(3)})`;
      }
      if (tagRef.current) tagRef.current.style.opacity = String(easeOut(seg(t, 3.2, 3.6) * (1 - seg(t, 6, 6.3))).toFixed(3));
      // The lens sits beside the ring (so the ring stays visible) and shows what's inside it.
      const d = Math.max(72, width * 0.34);
      const cx = Math.min(width - d / 2, Math.max(d / 2, spot.x * width + (spot.x > 0.5 ? -d * 0.75 : d * 0.75)));
      const cy = Math.min(height - d / 2, Math.max(d / 2, spot.y * height));
      lens.place(box.current, cx, cy, d, easeOut(seg(t, 4.1, 4.6)) * (1 - seg(t, 6, 6.3)), spot.x * width, spot.y * height);
    },
    DENOISE_STILL,
  );

  return (
    <Frame ratio={ratio} frameRef={frameRef}>
      <Photo photo={ai} alt={alt} imgRef={aiRef} className="opacity-0" />
      <Photo photo={real} alt="" imgRef={realRef} />
      {noise.layer}
      <div
        ref={ringRef}
        aria-hidden
        className="pointer-events-none absolute z-[3] size-10 rounded-full opacity-0 ring-[2.5px] ring-white shadow-[0_0_0_4.5px_oklch(0_0_0/0.4)]"
        style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
      />
      {lens.element}
      <span ref={tagRef} className="absolute left-0 top-0 z-[4] opacity-0">
        <CornerTag kind="ai" />
      </span>
      <div
        ref={stepsRef}
        aria-hidden
        className="absolute inset-x-2.5 bottom-2.5 z-[4] flex gap-1 rounded-full bg-canvas/85 p-1.5"
      >
        {Array.from({ length: DENOISE_STEPS }, (_, i) => (
          <span key={i} data-on="false" className="h-1.5 flex-1 rounded-full bg-fg/15 transition-colors duration-150 data-[on=true]:bg-game" />
        ))}
      </div>
    </Frame>
  );
}

// ───────────────────────────── Content Credentials: a label that falls off

const CC_LOOP = 6.4;
const CC_STILL = 1.2;

/**
 * An AI photo with its Content Credentials label tied on. Crop marks close
 * in, the photo is cropped, and the label drops away: what happens to the
 * label when a photo is cropped or re-saved.
 */
export function CredentialsVisual({ photo, ratio, alt }: { photo: PairPhoto; ratio: number; alt: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const cornersRef = useRef<HTMLDivElement>(null);

  useLoop(
    frameRef,
    (time) => {
      const t = time % CC_LOOP;
      const close = easeInOut(seg(t, 1.6, 2.3)) * (1 - easeInOut(seg(t, 5.4, 6.1)));
      const inset = 9 * close;
      if (cornersRef.current) {
        cornersRef.current.style.inset = `${inset}%`;
        cornersRef.current.style.opacity = String((seg(t, 1.3, 1.6) * (1 - seg(t, 2.6, 2.9)) || 0).toFixed(3));
      }
      const cut = easeOut(seg(t, 2.3, 2.6)) * (1 - easeInOut(seg(t, 5.4, 6.1)));
      if (clipRef.current) clipRef.current.style.clipPath = `inset(${(9 * cut).toFixed(2)}% round 10px)`;
      // The label: a gentle swing, then it drops away when the photo is cut, and returns for the next loop.
      const fall = easeInOut(seg(t, 2.45, 3.2));
      const back = easeOut(seg(t, 5.9, 6.4));
      const swing = Math.sin(t * 2.2) * 4 * (1 - fall);
      if (tagRef.current) {
        tagRef.current.style.transform = `translate(${(fall * 14).toFixed(1)}px, ${(fall * 70 - (1 - back) * 0).toFixed(1)}px) rotate(${(swing + fall * 28).toFixed(2)}deg)`;
        tagRef.current.style.opacity = String((t < 3.2 ? 1 - fall : back).toFixed(3));
      }
    },
    CC_STILL,
  );

  return (
    <div ref={frameRef} className="relative w-full px-6 pb-7 pt-6">
      <div className="relative mx-auto w-[62%]">
        <div ref={clipRef} className="relative overflow-hidden rounded-[10px]" style={{ aspectRatio: ratio }}>
          <Photo photo={photo} alt={alt} />
        </div>
        <div ref={cornersRef} aria-hidden className="pointer-events-none absolute inset-0 opacity-0">
          {["left-0 top-0 border-l-[3px] border-t-[3px]", "right-0 top-0 border-r-[3px] border-t-[3px]", "bottom-0 left-0 border-b-[3px] border-l-[3px]", "bottom-0 right-0 border-b-[3px] border-r-[3px]"].map((c) => (
            <span key={c} className={cn("absolute size-5 border-fg", c)} />
          ))}
        </div>
        {/* The label, tied to the photo's corner. */}
        <div ref={tagRef} aria-hidden className="absolute -right-5 -top-4 z-[2] origin-top-left">
          <div className="relative flex flex-col gap-0.5 rounded-md bg-fg py-2 pl-3 pr-3.5 text-canvas shadow-float">
            <span className="absolute -left-1 top-2.5 size-2 rounded-full bg-canvas ring-2 ring-fg" />
            <span className="type-label text-[0.6875rem] text-canvas/70">Content Credentials</span>
            <span className="text-[0.8125rem] font-semibold leading-tight">Created with AI</span>
          </div>
        </div>
      </div>
    </div>
  );
}
