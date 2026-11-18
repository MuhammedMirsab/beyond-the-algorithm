"use client";

import { BedDouble, Footprints, Hand, House, Moon, ScanFace, School, Users, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { IsoPhone, isoLiftAboveGlass, isoLitAnchor, isoLitTop, ON_DARK, ON_TILE, type IsoPhoneColors, type PhonePart } from "./iso-phone";
import { cn } from "@/lib/cn";
import { entrance } from "@/lib/entrance";

export type SensorId = "motion" | "gps" | "camera" | "microphone" | "light" | "touch" | "battery" | "connection";

const PART: Record<SensorId, PhonePart> = {
  motion: "motion",
  gps: "gps",
  camera: "camera",
  microphone: "microphone",
  light: "light",
  touch: "touch",
  battery: "battery",
  connection: "connection",
};

const NAME: Record<SensorId, string> = {
  motion: "Motion sensor (accelerometer and gyroscope)",
  gps: "GPS antenna",
  camera: "Camera module",
  microphone: "Microphone",
  light: "Light sensor",
  touch: "Touch layer in the glass",
  battery: "Battery",
  connection: "Wi-Fi and mobile radio",
};

/**
 * Isometric illustration of one sensor inside a phone: the phone exploded
 * into its layers, the sensor lit in the game colour and lifted out.
 * Fills its box; keep the box roughly square. `active` lifts the part further.
 */
export function SensorArt({ sensor, active = false, className }: { sensor: SensorId; active?: boolean; className?: string }) {
  // Glass-level parts need less lift to clear the phone; board parts need more.
  const lift = sensor === "touch" ? 16 : sensor === "light" ? 26 : 40;
  const zoom: Record<SensorId, number> = { motion: 2.3, gps: 1.5, camera: 1.3, microphone: 1.9, light: 2.6, touch: 1, battery: 1, connection: 2 };
  return (
    <div role="img" aria-label={`Where it is: ${NAME[sensor]}`} className={cn("grid size-full place-items-center", className)}>
      <IsoPhone lit={PART[sensor]} lift={lift} litScale={zoom[sensor]} active={active} explode={0.62} colors={ON_DARK} className="size-full" />
    </div>
  );
}

/* ── The intro loop: each sensor lights up and gives something away ── */

/** The same order as the game: the sensors you can feel first. */
export const LOOP_ORDER: SensorId[] = ["motion", "camera", "microphone", "touch", "gps", "light", "battery", "connection"];

const LOOP_ZOOM: Record<SensorId, number> = { motion: 1.9, camera: 1.2, microphone: 1.6, touch: 1, gps: 1.3, light: 2.2, battery: 1, connection: 1.7 };
const EXPLODE = 0.7;
/** Every part rises clear of the cover glass, so it never hides against the dark screen. */
const LOOP_LIFT = Object.fromEntries(
  (Object.keys(LOOP_ZOOM) as SensorId[]).map((s) => [s, isoLiftAboveGlass(PART[s], EXPLODE, s === "touch" ? 12 : 9)]),
) as Record<SensorId, number>;
const TOP = Math.max(...LOOP_ORDER.map((s) => isoLitTop({ lit: PART[s], explode: EXPLODE, lift: LOOP_LIFT[s], litScale: LOOP_ZOOM[s] }))) + 6;
/** Each sensor's turn. */
const STEP_MS = 2300;
/** The still frame under reduced motion: the camera, the clearest "it sees you". */
const STILL: SensorId = "camera";

/** What each sensor gives away, as an icon: no words needed. */
export const SENSOR_GIVES_AWAY: Record<SensorId, LucideIcon> = {
  motion: Footprints,
  camera: ScanFace,
  microphone: Users,
  touch: Hand,
  gps: House,
  light: Moon,
  battery: BedDouble,
  connection: School,
};

/** The raw signal each sensor produces, drawn in a 128 x 64 card. */
function Signal({ sensor }: { sensor: SensorId }) {
  const stroke = { stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  switch (sensor) {
    case "motion":
      return <polyline points="14,36 30,36 38,20 46,46 54,22 62,44 70,20 78,46 86,22 94,44 102,36 114,36" {...stroke} />;
    case "camera": {
      const face = [
        [0.3, 0.6, 0.9, 0.9, 0.9, 0.6, 0.3],
        [0.5, 1, 0.35, 0.9, 0.35, 1, 0.5],
        [0.4, 0.9, 0.9, 0.6, 0.9, 0.9, 0.4],
        [0.2, 0.6, 0.35, 0.35, 0.35, 0.6, 0.2],
      ];
      return (
        <g fill="currentColor">
          {face.map((row, r) => row.map((v, c) => <circle key={`${r}-${c}`} cx={28 + c * 12} cy={14 + r * 12} r={1 + v * 3.6} />))}
        </g>
      );
    }
    case "microphone": {
      const d = Array.from({ length: 34 }, (_, i) => {
        const x = 12 + i * 3.1;
        const env = Math.sin((i / 33) * Math.PI);
        return `${i ? "L" : "M"}${x.toFixed(1)} ${(32 + Math.sin(i * 1.7) * 22 * env).toFixed(1)}`;
      }).join("");
      return <path d={d} {...stroke} strokeWidth={2} />;
    }
    case "touch":
      return (
        <g {...stroke}>
          <line x1={20} y1={32} x2={108} y2={32} strokeOpacity={0.35} />
          <line x1={64} y1={8} x2={64} y2={56} strokeOpacity={0.35} />
          <circle cx={64} cy={32} r={13} />
          <circle cx={64} cy={32} r={3.5} fill="currentColor" />
        </g>
      );
    case "gps":
      return (
        <g {...stroke}>
          <circle cx={64} cy={32} r={24} strokeDasharray="3 5" strokeOpacity={0.5} />
          <circle cx={64} cy={32} r={14} strokeOpacity={0.75} />
          <circle cx={64} cy={32} r={4} fill="currentColor" />
        </g>
      );
    case "light":
      return (
        <g {...stroke}>
          <circle cx={34} cy={32} r={8} fill="currentColor" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <line key={i} x1={34 + Math.cos(a) * 13} y1={32 + Math.sin(a) * 13} x2={34 + Math.cos(a) * 18} y2={32 + Math.sin(a) * 18} />;
          })}
          <rect x={62} y={26} width={50} height={12} rx={6} strokeOpacity={0.5} />
          <rect x={62} y={26} width={36} height={12} rx={6} fill="currentColor" stroke="none" />
        </g>
      );
    case "battery":
      return (
        <g {...stroke}>
          <rect x={30} y={16} width={62} height={32} rx={7} />
          <rect x={95} y={26} width={5} height={12} rx={2} fill="currentColor" stroke="none" />
          <rect x={35} y={21} width={34} height={22} rx={4} fill="currentColor" stroke="none" fillOpacity={0.35} />
          <path d="M64 21 l-8 12 h9 l-5 10" strokeWidth={2.4} />
        </g>
      );
    case "connection":
      return (
        <g {...stroke}>
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M${34 - 6 - i * 7} ${40 - 3 - i * 5} a ${8 + i * 7} ${8 + i * 7} 0 0 1 ${2 * (6 + i * 7)} 0`} />
          ))}
          <circle cx={34} cy={42} r={2.6} fill="currentColor" stroke="none" />
          {[0, 1, 2].map((i) => (
            <line key={`l${i}`} x1={66} y1={18 + i * 14} x2={110 - i * 12} y2={18 + i * 14} strokeOpacity={i ? 0.45 : 1} />
          ))}
        </g>
      );
  }
}

/** On the tile: the lifted part in ink with a white edge, so it reads over white parts and the dark screen alike. */
const LOOP_TILE: IsoPhoneColors = { ...ON_TILE, litLine: "oklch(1 0 0 / 0.96)" };

const TONES = {
  tile: { colors: LOOP_TILE, card: "oklch(1 0 0 / 0.95)", ink: "var(--game-ink)", dot: "var(--game-ink)", iconInk: "oklch(1 0 0)" },
  dark: { colors: ON_DARK, card: "var(--color-raised)", ink: "var(--color-fg)", dot: "var(--game)", iconInk: "var(--game-ink)" },
} as const;

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReduce(onChange: () => void) {
  const list = window.matchMedia(REDUCE_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/** Reduced motion, read so the server's picture (moving) and the first client render agree. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduce,
    () => window.matchMedia(REDUCE_QUERY).matches,
    () => false,
  );
}

const POP_CSS = `
.ps-pop { animation: ps-pop 560ms cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes ps-pop { from { opacity: 0; transform: translateY(16px); } }
`;

/**
 * The intro's wordless breakdown of the game: an exploded phone whose sensors
 * light up one at a time. Each one lifts out of its place, its raw signal
 * appears (the numbers it produces, drawn as a shape), and an arrow leads to
 * what that signal gives away about you. Pauses off screen; under reduced
 * motion it holds one still frame.
 */
export function PhoneSensorsLoop({
  tone = "tile",
  sensors = LOOP_ORDER,
  callout = true,
  className,
}: {
  tone?: keyof typeof TONES;
  sensors?: SensorId[];
  /** Show the signal and what it gives away beside the phone. */
  callout?: boolean;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduce = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  const list = sensors.length ? sensors : LOOP_ORDER;

  useEffect(() => {
    if (!inView || reduce || list.length < 2) return;
    const id = window.setInterval(() => setStep((s) => s + 1), STEP_MS);
    return () => window.clearInterval(id);
  }, [inView, reduce, list.length]);

  const sensor = reduce && list.includes(STILL) ? STILL : list[step % list.length];
  const t = TONES[tone];
  const options = { lit: PART[sensor], explode: EXPLODE, lift: LOOP_LIFT[sensor], litScale: LOOP_ZOOM[sensor], topZ: TOP };
  const anchor = isoLitAnchor(options);
  const phoneW = anchor?.width ?? 192;
  const phoneH = anchor?.height ?? 214;
  const cardX = phoneW + 28;
  const width = callout ? cardX + 132 : phoneW;
  const Icon = SENSOR_GIVES_AWAY[sensor];

  let detail: ReactNode = null;
  if (callout && anchor) {
    const midY = phoneH / 2;
    const cardY = midY - 64;
    detail = (
      <AnimatePresence initial={false}>
        <motion.g key={sensor} initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
          <motion.path
            d={`M${anchor.x.toFixed(1)} ${anchor.y.toFixed(1)} C ${(anchor.x + 40).toFixed(1)} ${(anchor.y - 10).toFixed(1)}, ${cardX - 40} ${cardY + 32}, ${cardX - 4} ${cardY + 32}`}
            fill="none"
            stroke={t.ink}
            strokeWidth={2}
            strokeDasharray="1 6"
            strokeLinecap="round"
            initial={entrance({ pathLength: 0, opacity: 0 })}
            animate={{ pathLength: 1, opacity: 1, transition: { duration: 0.4, delay: 0.15, ease: [0.22, 1, 0.36, 1] } }}
          />
          <circle cx={anchor.x} cy={anchor.y} r={3.5} fill={t.dot} />
          <motion.g
            initial={entrance({ opacity: 0, x: -8 })}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.35, delay: 0.35, ease: [0.22, 1, 0.36, 1] } }}
            style={{ color: t.ink }}
          >
            <rect x={cardX} y={cardY} width={128} height={64} rx={14} fill={t.card} />
            <g transform={`translate(${cardX} ${cardY})`}>
              <Signal sensor={sensor} />
            </g>
          </motion.g>
          <motion.path
            d={`M${cardX + 64} ${cardY + 74} v 18 m -6 -6 l 6 6 l 6 -6`}
            fill="none"
            stroke={t.ink}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={entrance({ opacity: 0 })}
            animate={{ opacity: 1, transition: { duration: 0.25, delay: 0.75 } }}
          />
          <motion.g
            initial={entrance({ opacity: 0, scale: 0.6 })}
            animate={{ opacity: 1, scale: 1, transition: { type: "spring", duration: 0.45, bounce: 0.3, delay: 0.95 } }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          >
            <circle cx={cardX + 64} cy={cardY + 126} r={26} fill={t.ink} />
            <Icon x={cardX + 64 - 14} y={cardY + 126 - 14} width={28} height={28} color={t.iconInk} strokeWidth={2} aria-hidden />
          </motion.g>
        </motion.g>
      </AnimatePresence>
    );
  }

  return (
    <>
      <style href="phone-sensors-loop" precedence="medium">
        {POP_CSS}
      </style>
      <svg
        ref={ref}
        viewBox={`-6 -6 ${(width + 12).toFixed(1)} ${(phoneH + 12).toFixed(1)}`}
        className={cn("size-full overflow-visible", className)}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <svg x={0} y={0} width={phoneW} height={phoneH} overflow="visible">
          <IsoPhone {...options} colors={t.colors} litStroke={1.6} litClassName={reduce ? undefined : "ps-pop"} className="size-full overflow-visible" />
        </svg>
        {detail}
      </svg>
    </>
  );
}
