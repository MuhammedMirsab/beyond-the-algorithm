"use client";

import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SensorId } from "@/components/art/sensor-art";
import { HowItWorks } from "@/components/game/panels";
import { cn } from "@/lib/cn";
import type { HowSteps } from "../data/experiments";

/**
 * How it works, for one sensor, in three pictures: what it physically
 * measures (a small looping animation of the part), the numbers it turns
 * that into (the visitor's own readings, streaming), and what an app works
 * out from them (the live guess).
 *
 * The loops are CSS animations: they run on the compositor, pause when
 * scrolled out of view, and under reduced motion each picture rests on its
 * own still frame (the elements' styles without the animation).
 */

const CSS = `
.px-play .px-a { animation-play-state: running; }
.px-a { animation-play-state: paused; animation-timing-function: cubic-bezier(0.77, 0, 0.175, 1); animation-iteration-count: infinite; transform-box: fill-box; transform-origin: center; }
@keyframes px-tilt { 0%, 100% { transform: rotate(-12deg); } 50% { transform: rotate(12deg); } }
@keyframes px-mass { 0%, 100% { transform: translateX(-8px); } 50% { transform: translateX(8px); } }
@keyframes px-pulse { 0% { transform: scale(0.15); opacity: 0.9; } 80%, 100% { transform: scale(1); opacity: 0; } }
@keyframes px-blink { 0%, 100% { opacity: 0.18; } 45%, 60% { opacity: 1; } }
@keyframes px-plate { 0%, 100% { transform: translateX(-3px); } 50% { transform: translateX(3px); } }
@keyframes px-scroll { from { transform: translateX(0); } to { transform: translateX(-48px); } }
@keyframes px-press { 0%, 15% { opacity: 0; transform: scale(1.5); } 30%, 70% { opacity: 1; transform: scale(1); } 85%, 100% { opacity: 0; transform: scale(1); } }
@keyframes px-shrink { 0% { transform: scale(1.7); opacity: 0.25; } 70%, 100% { transform: scale(1); opacity: 1; } }
@keyframes px-needle { 0%, 100% { transform: rotate(-48deg); } 50% { transform: rotate(38deg); } }
@keyframes px-fill { 0%, 100% { transform: scaleX(0.3); } 50% { transform: scaleX(0.92); } }
@keyframes px-ion { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(46px); } }
@keyframes px-flow { 0% { transform: translateX(0); opacity: 0; } 15%, 75% { opacity: 1; } 100% { transform: translateX(64px); opacity: 0; } }
`;

/** Starts the loops only while the picture is on screen. */
function Loop({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "80px" });
  return (
    <div ref={ref} className={cn("relative", inView && "px-play", className)}>
      <style href="phone-how-loops" precedence="medium">
        {CSS}
      </style>
      {children}
    </div>
  );
}

const anim = (name: string, seconds: number, delay = 0) => ({
  animationName: name,
  animationDuration: `${seconds}s`,
  animationDelay: `${delay}s`,
});

/* ── What each sensor physically measures ─────────────────────────── */

function MotionPart() {
  const springs = (x: number, flip: boolean) =>
    `M${x} 60 ` + Array.from({ length: 6 }, (_, i) => `l${flip ? -3.5 : 3.5} ${i % 2 ? 7 : -7}`).join(" ");
  return (
    <g className="px-a" style={anim("px-tilt", 3.2)}>
      <rect x={62} y={18} width={116} height={84} rx={12} className="fill-fg/[0.04] stroke-fg/35" strokeWidth={2} />
      {/* The fixed plates on either side. */}
      {[78, 84, 156, 162].map((x) => (
        <line key={x} x1={x} y1={40} x2={x} y2={80} className="stroke-fg/30" strokeWidth={2} strokeLinecap="round" />
      ))}
      {/* The weight on its springs, sliding as the chip tilts. */}
      <g className="px-a" style={anim("px-mass", 3.2)}>
        <path d={springs(92, false)} fill="none" className="stroke-fg/50" strokeWidth={1.6} strokeLinejoin="round" />
        <path d={springs(148, true)} fill="none" className="stroke-fg/50" strokeWidth={1.6} strokeLinejoin="round" />
        <rect x={102} y={44} width={36} height={32} rx={6} className="fill-game" />
      </g>
      <path d="M120 106 v8 m-4 -4 l4 4 l4 -4" className="stroke-fg/40" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function CameraPart() {
  const cells = [
    [0.2, 0.5, 0.9, 0.9, 0.5, 0.2],
    [0.4, 0.9, 0.3, 0.3, 0.9, 0.4],
    [0.4, 0.9, 0.9, 0.9, 0.9, 0.4],
    [0.2, 0.6, 0.2, 0.2, 0.6, 0.2],
  ];
  return (
    <g>
      <circle cx={30} cy={60} r={13} className="fill-game" />
      {[-24, 0, 24].map((dy) => (
        <line key={dy} x1={48} y1={60 + dy * 0.3} x2={96} y2={60 + dy} className="stroke-game/60" strokeWidth={1.6} strokeDasharray="3 4" />
      ))}
      <ellipse cx={104} cy={60} rx={6} ry={30} className="fill-fg/[0.06] stroke-fg/40" strokeWidth={1.6} />
      {cells.map((row, r) =>
        row.map((v, c) => (
          <rect
            key={`${r}-${c}`}
            x={128 + c * 17}
            y={26 + r * 17}
            width={14}
            height={14}
            rx={3}
            className="px-a fill-fg"
            style={{ opacity: v, ...anim("px-blink", 2.6, c * 0.18) }}
          />
        )),
      )}
    </g>
  );
}

function MicrophonePart() {
  const wave = Array.from({ length: 21 }, (_, i) => `${i === 0 ? "M" : "L"}${144 + i * 6} ${60 + Math.sin(i * 0.95) * (14 + (i % 3) * 4)}`).join(" ");
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${24 + i * 14} 36 q 10 24 0 48`}
          fill="none"
          className="px-a stroke-fg/45"
          strokeWidth={2}
          strokeLinecap="round"
          style={anim("px-blink", 1.4, i * 0.22)}
        />
      ))}
      <rect x={82} y={30} width={6} height={60} rx={3} className="px-a fill-game" style={anim("px-plate", 0.7)} />
      <line x1={100} y1={32} x2={100} y2={88} className="stroke-fg/30" strokeWidth={2} strokeDasharray="2 4" />
      <svg x={140} y={20} width={84} height={80} viewBox="140 20 84 80" overflow="hidden">
        <path d={wave} fill="none" className="px-a stroke-game" strokeWidth={2} strokeLinejoin="round" style={anim("px-scroll", 1.6)} />
      </svg>
    </g>
  );
}

function TouchPart() {
  return (
    <g>
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={`v${i}`} x1={64 + i * 28} y1={14} x2={64 + i * 28} y2={106} className="stroke-fg/20" strokeWidth={1.5} />
      ))}
      {[0, 1, 2].map((i) => (
        <line key={`h${i}`} x1={50} y1={32 + i * 28} x2={190} y2={32 + i * 28} className="stroke-fg/20" strokeWidth={1.5} />
      ))}
      {/* The wires under the finger light up as their charge changes. */}
      <g className="px-a" style={anim("px-press", 2.4)}>
        <line x1={148} y1={14} x2={148} y2={106} className="stroke-game" strokeWidth={2.4} />
        <line x1={50} y1={60} x2={190} y2={60} className="stroke-game" strokeWidth={2.4} />
        <circle cx={148} cy={60} r={15} className="fill-game/25 stroke-game" strokeWidth={2} />
      </g>
    </g>
  );
}

function GpsPart() {
  const sats: [number, number][] = [
    [40, 18],
    [120, 10],
    [200, 18],
  ];
  return (
    <g>
      {sats.map(([x, y], i) => (
        <g key={x}>
          <circle cx={x} cy={y} r={70} fill="none" className="px-a stroke-fg/35" strokeWidth={1.4} style={anim("px-pulse", 2.4, i * 0.5)} />
          <rect x={x - 5} y={y - 4} width={10} height={8} rx={2} className="fill-fg/70" />
          <rect x={x - 15} y={y - 2} width={8} height={4} rx={1} className="fill-fg/40" />
          <rect x={x + 7} y={y - 2} width={8} height={4} rx={1} className="fill-fg/40" />
        </g>
      ))}
      <circle cx={120} cy={92} r={14} className="px-a fill-game/20 stroke-game" strokeWidth={1.6} style={anim("px-shrink", 2.4)} />
      <circle cx={120} cy={92} r={4} className="fill-game" />
    </g>
  );
}

function LightPart() {
  return (
    <g>
      <circle cx={46} cy={60} r={16} className="fill-game" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={46 + Math.cos(a) * 22}
            y1={60 + Math.sin(a) * 22}
            x2={46 + Math.cos(a) * 30}
            y2={60 + Math.sin(a) * 30}
            className="px-a stroke-game"
            strokeWidth={2.4}
            strokeLinecap="round"
            style={anim("px-blink", 2.8)}
          />
        );
      })}
      <rect x={104} y={52} width={16} height={16} rx={3} className="fill-fg/70" />
      <path d="M150 88 A 34 34 0 0 1 218 88" fill="none" className="stroke-fg/30" strokeWidth={6} strokeLinecap="round" />
      <g className="px-a" style={{ ...anim("px-needle", 2.8), transformOrigin: "184px 88px", transformBox: "view-box" }}>
        <line x1={184} y1={88} x2={184} y2={60} className="stroke-game" strokeWidth={3} strokeLinecap="round" />
      </g>
      <circle cx={184} cy={88} r={4} className="fill-fg/70" />
    </g>
  );
}

function BatteryPart() {
  return (
    <g>
      <rect x={40} y={34} width={150} height={52} rx={10} fill="none" className="stroke-fg/40" strokeWidth={2.4} />
      <rect x={192} y={50} width={8} height={20} rx={3} className="fill-fg/40" />
      <rect x={46} y={40} width={138} height={40} rx={6} className="px-a fill-game/80" style={{ ...anim("px-fill", 4), transformOrigin: "left center" }} />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={78} cy={50 + i * 10} r={3.2} className="px-a fill-fg" style={anim("px-ion", 4, i * 0.15)} />
      ))}
    </g>
  );
}

function ConnectionPart() {
  return (
    <g>
      <rect x={30} y={70} width={34} height={18} rx={4} className="fill-fg/60" />
      <line x1={38} y1={70} x2={38} y2={56} className="stroke-fg/60" strokeWidth={2} strokeLinecap="round" />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${47 - 10 - i * 9} ${58 - 4 - i * 6} a ${12 + i * 9} ${12 + i * 9} 0 0 1 ${2 * (10 + i * 9)} 0`}
          fill="none"
          className="px-a stroke-game"
          strokeWidth={2.2}
          strokeLinecap="round"
          style={anim("px-blink", 1.8, i * 0.25)}
        />
      ))}
      {[0, 1, 2].map((i) => (
        <g key={i} className="px-a" style={anim("px-blink", 3, 0.4 + i * 0.4)}>
          <rect x={112} y={24 + i * 26} width={84 - i * 14} height={14} rx={7} className="fill-fg/25" />
          <rect x={204} y={27 + i * 26} width={8} height={8} rx={2} className={i === 0 ? "fill-game" : "fill-fg/40"} />
        </g>
      ))}
    </g>
  );
}

const PARTS: Record<SensorId, () => ReactNode> = {
  motion: MotionPart,
  camera: CameraPart,
  microphone: MicrophonePart,
  touch: TouchPart,
  gps: GpsPart,
  light: LightPart,
  battery: BatteryPart,
  connection: ConnectionPart,
};

export function MeasureArt({ sensor }: { sensor: SensorId }) {
  const Part = PARTS[sensor];
  return (
    <Loop className="dot-field">
      <svg viewBox="0 0 240 120" className="block h-32 w-full" aria-hidden>
        <Part />
      </svg>
    </Loop>
  );
}

/* ── The numbers, streaming ───────────────────────────────────────── */

const STREAM_LINES = 5;
const STREAM_EVERY_MS = 280;

interface StreamLine {
  id: number;
  text: string;
}

/** The last few distinct readings, newest last, added at a readable pace. */
function useStream(line: string | null): StreamLine[] {
  const [lines, setLines] = useState<StreamLine[]>(() => (line ? [{ id: 0, text: line }] : []));
  const lastAt = useRef(0);
  useEffect(() => {
    if (!line) return;
    const wait = Math.max(0, lastAt.current + STREAM_EVERY_MS - performance.now());
    const id = window.setTimeout(() => {
      lastAt.current = performance.now();
      setLines((list) => {
        const last = list[list.length - 1];
        if (last?.text === line) return list;
        return [...list.slice(-(STREAM_LINES - 1)), { id: (last?.id ?? 0) + 1, text: line }];
      });
    }, wait);
    return () => window.clearTimeout(id);
  }, [line]);
  return lines;
}

/** The visitor's own readings as a stream of numbers: exactly what the app gets. Still when nothing is measured. */
export function NumbersStream({ line, idle }: { line: string | null; idle: string }) {
  const lines = useStream(line);
  return (
    <div className="flex h-32 flex-col justify-end gap-1 overflow-hidden px-4 py-3" aria-hidden>
      {lines.length === 0 ? (
        <span className="type-label text-fg-subtle">{idle}</span>
      ) : (
        <AnimatePresence initial={false}>
          {lines.map((l, i) => (
            <motion.span
              key={l.id}
              layout="position"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: i === lines.length - 1 ? 1 : 0.25 + (0.45 * i) / lines.length, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={cn("type-label truncate tabular-nums", i === lines.length - 1 ? "text-fg" : "text-fg-subtle")}
            >
              {l.text}
            </motion.span>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}

/* ── From numbers to a guess ──────────────────────────────────────── */

export function InferArt({ guess, idle }: { guess: string | null; idle: string }) {
  return (
    <Loop>
      <div className="flex h-32 items-center gap-3 px-4" aria-hidden>
        <div className="relative h-2 w-16 shrink-0 overflow-hidden">
          {guess
            ? [0, 1, 2].map((i) => (
                <span key={i} className="px-a absolute left-0 top-0 size-2 rounded-full bg-fg/70" style={anim("px-flow", 1.8, i * 0.6)} />
              ))
            : null}
        </div>
        <ArrowRight className="size-4 shrink-0 text-fg-subtle" />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={guess ?? "idle"}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "min-w-0 rounded-md px-3 py-2 text-[0.9375rem] font-semibold leading-snug",
              guess ? "bg-game text-game-ink" : "bg-fg/[0.06] text-fg-subtle",
            )}
          >
            {guess ?? idle}
          </motion.span>
        </AnimatePresence>
      </div>
    </Loop>
  );
}

/**
 * The three steps for one sensor. `numbers` is the visitor's latest reading
 * as one line (null before there is one); `guess` is the live guess.
 */
export function SensorHow({ sensor, how, numbers, guess }: { sensor: SensorId; how: HowSteps; numbers: string | null; guess: string | null }) {
  return (
    <HowItWorks
      title="How it works"
      steps={[
        { title: "What it measures", text: how.measures, visual: <MeasureArt sensor={sensor} /> },
        { title: "The numbers", text: how.numbers, visual: <NumbersStream line={numbers} idle="No readings yet" /> },
        { title: "What an app works out", text: how.infers, visual: <InferArt guess={guess} idle="Waiting for numbers" /> },
      ]}
    />
  );
}
