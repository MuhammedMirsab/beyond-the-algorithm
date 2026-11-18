"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { localPoint, pushTap, tapRhythm, touchGuess, type TapPoint } from "../../engine/touch";
import { sound } from "../../engine/sound";
import { useShared } from "../../link/link";
import { useCapabilities } from "../../sensors/use-device";
import { ExperimentLayout, type ExperimentProps } from "../experiment-layout";
import { STAGE_BOTTOM, StageShell, type Task } from "../parts";

/** A tap, in the phone's points (for readouts) and as a fraction of the glass (for drawing). */
interface GlassTap extends TapPoint {
  fx: number;
  fy: number;
}

interface Finger {
  id: number;
  fx: number;
  fy: number;
  x: number;
  y: number;
  /** Contact width in CSS px, when the screen reports it. */
  size: number | null;
}

const INPUT_LABEL: Record<string, string> = { touch: "Finger", mouse: "Mouse", pen: "Pen" };
/** Taps closer together than this count as tapping fast. */
const FAST_MS = 350;

function readGlass(event: ReactPointerEvent<HTMLDivElement>) {
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  // Inside the drawn phone, report the phone's own points, not laptop pixels.
  const scale = Number.parseFloat(getComputedStyle(el).getPropertyValue("--phone-scale")) || 1;
  const point = localPoint(event.clientX, event.clientY, rect, scale);
  return {
    ...point,
    fx: rect.width ? (event.clientX - rect.left) / rect.width : 0,
    fy: rect.height ? (event.clientY - rect.top) / rect.height : 0,
    width: Math.round(rect.width / scale),
  };
}

const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export function TouchExperiment({ ctx }: ExperimentProps) {
  const caps = useCapabilities();
  const [taps, setTaps] = useState<GlassTap[]>([]);
  const [fingers, setFingers] = useState<Finger[]>([]);
  const [count, setCount] = useState(0);
  const [mostFingers, setMostFingers] = useState(0);
  const [glassWidth, setGlassWidth] = useState(0);
  const [contact, setContact] = useState<{ w: number; h: number } | null>(null);
  const [input, setInput] = useState<string | null>(null);
  const down = useRef(new Set<number>());
  const nextId = useRef(0);
  const { markTested, mirrored } = ctx;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = readGlass(event);
    if (!g.inside) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    down.current.add(event.pointerId);
    const size = event.width > 1 || event.height > 1 ? Math.max(event.width, event.height) : null;
    const fingersNow = down.current.size;
    nextId.current += 1;
    const tap: GlassTap = { id: nextId.current, x: g.x, y: g.y, t: Math.round(event.timeStamp), fx: round3(g.fx), fy: round3(g.fy) };
    setFingers((all) => [...all.filter((f) => f.id !== event.pointerId), { id: event.pointerId, fx: round3(g.fx), fy: round3(g.fy), x: g.x, y: g.y, size }]);
    setTaps((all) => pushTap(all, tap));
    setCount((n) => n + 1);
    setMostFingers((n) => Math.max(n, fingersNow));
    setGlassWidth(g.width);
    setInput(event.pointerType);
    if (size) setContact({ w: Math.round(event.width), h: Math.round(event.height) });
    sound.tap();
    markTested();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!down.current.has(event.pointerId)) return;
    const g = readGlass(event);
    setFingers((all) =>
      all.map((f) =>
        f.id === event.pointerId ? { ...f, fx: round3(Math.min(1, Math.max(0, g.fx))), fy: round3(Math.min(1, Math.max(0, g.fy))), x: g.x, y: g.y } : f,
      ),
    );
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!down.current.delete(event.pointerId)) return;
    setFingers((all) => all.filter((f) => f.id !== event.pointerId));
  };

  const clear = () => {
    setTaps([]);
    setCount(0);
    setMostFingers(0);
    setContact(null);
  };

  // The phone's glass, mirrored on the booth screen (positions are fractions of the glass, so they fit any size).
  const shared = useShared("touch", { taps, fingers, count, mostFingers, glassWidth, contact, input });
  const prevCount = useRef(shared.count);
  useEffect(() => {
    if (!mirrored || shared.count === prevCount.current) return;
    prevCount.current = shared.count;
    if (shared.count > 0) {
      sound.tap();
      markTested();
    }
  }, [mirrored, shared.count, markTested]);
  const tapsShown = list<GlassTap>(shared.taps);
  const fingersShown = list<Finger>(shared.fingers);
  const last = tapsShown[tapsShown.length - 1];
  const rhythm = tapRhythm(tapsShown);
  const guess = shared.count > 0 ? touchGuess(tapsShown, shared.glassWidth, fingersShown.length) : null;

  // A finger on a phone, or a mouse on the laptop: the things to try fit the hand that's there.
  const fingerDevice = mirrored ? shared.input !== "mouse" : caps.touch;
  const tasks: Task[] = fingerDevice
    ? [
        { id: "tap", label: "Tap the glass", done: shared.count >= 1 },
        { id: "thumb", label: "Tap 3 more times with one thumb", done: shared.count >= 4 },
        { id: "three", label: "Put 3 fingers down at once", done: shared.mostFingers >= 3 },
      ]
    : [
        { id: "tap", label: "Click the glass", done: shared.count >= 1 },
        { id: "side", label: "Click 3 more times on one side", done: shared.count >= 4 },
        { id: "fast", label: "Click 5 times, as fast as you can", done: tapsShown.length >= 5 && rhythm != null && rhythm < FAST_MS },
      ];

  const readout = [
    { label: "Last tap", value: last ? `x ${last.x}, y ${last.y}` : "Waiting" },
    { label: "Fingers on the glass", value: String(fingersShown.length) },
    { label: "Most at once", value: String(shared.mostFingers) },
    { label: "Taps", value: String(shared.count) },
    { label: "Time between taps", value: rhythm != null ? `${rhythm} ms` : "Tap a few times" },
    {
      label: "Contact size",
      value: shared.contact ? `${shared.contact.w} × ${shared.contact.h} px` : shared.input === "mouse" ? "A mouse has none" : "Not reported",
    },
    { label: "Touched with", value: shared.input ? (INPUT_LABEL[shared.input] ?? shared.input) : "Waiting" },
  ];

  const controls = mirrored ? null : (
    <Button variant="ghost" onClick={clear} disabled={count === 0} className="-ml-3 self-start">
      Clear the taps
    </Button>
  );

  return (
    <ExperimentLayout
      ctx={ctx}
      live={fingersShown.length > 0}
      source="live"
      stageLabel={fingerDevice ? "The touchscreen. Tap anywhere on it." : "The touchscreen. Click anywhere on it."}
      stage={
        <StageShell title="Touch" source="live">
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onLostPointerCapture={onPointerEnd}
            className="relative mx-3 min-h-0 flex-1 cursor-crosshair touch-none select-none overflow-hidden rounded-lg bg-black/40 [-webkit-touch-callout:none]"
            style={{
              backgroundImage:
                "linear-gradient(to right, var(--color-line) 1px, transparent 1px), linear-gradient(to bottom, var(--color-line) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          >
            {shared.count === 0 ? (
              <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
                <div className="flex flex-col gap-2">
                  <span className="type-title-3 text-fg">{fingerDevice ? "Tap the glass" : "Click the glass"}</span>
                  <span className="type-small text-fg-subtle">Every line is a wire carrying a tiny charge.</span>
                </div>
              </div>
            ) : null}

            {last ? (
              <>
                <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-game/40" style={{ left: `${last.fx * 100}%` }} />
                <span aria-hidden className="pointer-events-none absolute inset-x-0 h-px bg-game/40" style={{ top: `${last.fy * 100}%` }} />
              </>
            ) : null}

            {tapsShown.map((tap, i) => (
              <span
                key={tap.id}
                aria-hidden
                className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-game"
                style={{ left: `${tap.fx * 100}%`, top: `${tap.fy * 100}%`, opacity: 0.25 + (0.75 * (i + 1)) / tapsShown.length }}
              />
            ))}

            {fingersShown.map((f, i) => (
              <span
                key={f.id}
                aria-hidden
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${f.fx * 100}%`, top: `${f.fy * 100}%` }}
              >
                <span
                  className="grid place-items-center rounded-full border-2 border-game bg-game/20"
                  style={{ width: Math.max(44, f.size ?? 0), height: Math.max(44, f.size ?? 0) }}
                >
                  <span className="type-label text-fg">{i + 1}</span>
                </span>
                <span className="type-label absolute left-full top-0 ml-2 whitespace-nowrap rounded-xs bg-black/80 px-1.5 py-0.5 tabular-nums text-fg">
                  {f.x}, {f.y}
                </span>
              </span>
            ))}
          </div>
          <div className={cn("flex items-center justify-between gap-3 px-5 pt-4", STAGE_BOTTOM)}>
            <span className="type-label tabular-nums text-fg-subtle">
              Fingers <span className="text-fg">{fingersShown.length}</span>
            </span>
            <span className="type-label tabular-nums text-fg-subtle">
              Taps <span className="text-fg">{shared.count}</span>
            </span>
          </div>
        </StageShell>
      }
      controls={controls}
      tasks={tasks}
      readout={readout}
      guess={guess}
      guessWaiting={fingerDevice ? "Tap the glass to see what it guesses." : "Click the glass to see what it guesses."}
      numbers={last ? `x ${last.x}   y ${last.y}${rhythm != null ? `   ${rhythm} ms apart` : ""}` : null}
      summary={last ? `${shared.count} taps. Last at x ${last.x}, y ${last.y}. Guess: ${guess?.label ?? ""}.` : "No taps yet."}
    />
  );
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
