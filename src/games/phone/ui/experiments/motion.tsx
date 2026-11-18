"use client";

import { Footprints, Rotate3d } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { signed, type Guess } from "../../engine/math";
import { eulerFromTilt, headingName, isEuler, pointingHeading, rotationMatrix, roundEuler, type Euler } from "../../engine/orientation";
import { createStepState, movementGuess, movementKind, stepReducer, syntheticForce, type MovementKind } from "../../engine/steps";
import { ballOffset, dragTilt, keyTilt, LEVEL, SIDEWAYS_AT, tiltGuess, type Tilt } from "../../engine/tilt";
import { useLink, useShared } from "../../link/link";
import { issueCopy, type SensorStatus } from "../../sensors/status";
import { useCapabilities, useThrottled } from "../../sensors/use-device";
import { useDeviceTilt, type CompassState, type MovementReading } from "../../sensors/use-device-tilt";
import { ExperimentLayout, type ExperimentProps } from "../experiment-layout";
import { IslandLabel, ModeSwitch, STAGE_BOTTOM, StageShell, useIslandNotice, useLatch, type SensorGate, type Source, type Task } from "../parts";
import { Twin, type TwinPose } from "../twin";

const TILT_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "0", "Home"]);
const WALK_SECONDS = 4;
/** Tipped back further than this reads as lying flat (the tilt guess's own rule). */
const FLAT_AT = -35;

const PRESETS: { label: string; tilt: Tilt }[] = [
  { label: "Tilt left", tilt: { pitch: 5, roll: -30 } },
  { label: "Level", tilt: LEVEL },
  { label: "Tilt right", tilt: { pitch: 5, roll: 30 } },
  { label: "Lay it flat", tilt: { pitch: -42, roll: 0 } },
];

const KIND_LABEL: Record<MovementKind, string> = { still: "Still", walking: "Walking", running: "Running" };

/** What the phone sends the booth screen: readings only, rounded. */
interface MotionShare {
  mode: Source;
  status: SensorStatus;
  tilt: Tilt;
  euler: Euler;
  yaw: number;
  heading: number | null;
  compass: CompassState;
  movement: MovementReading | null;
  rate: number | null;
  simTilt: Tilt;
  simMovement: MovementReading | null;
}

const roundMovement = (m: MovementReading | null): MovementReading | null =>
  m ? { steps: m.steps, kind: m.kind, trace: m.trace.map((v) => Math.round(v * 10) / 10) } : null;

function isTilt(value: unknown): value is Tilt {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return typeof t.pitch === "number" && Number.isFinite(t.pitch) && typeof t.roll === "number" && Number.isFinite(t.roll);
}

export function MotionExperiment({ ctx }: ExperimentProps) {
  const caps = useCapabilities();
  const link = useLink();
  const sensor = useDeviceTilt();
  const { start: startSensor, stop: stopSensor } = sensor;
  const [mode, setMode] = useState<Source>(caps.motion ? "live" : "sim");
  const [simTilt, setSimTilt] = useState<Tilt>(LEVEL);
  const [walk, setWalk] = useState<{ kind: "walk" | "run"; id: number } | null>(null);
  const [simMovement, setSimMovement] = useState<MovementReading | null>(null);
  const [yaw, setYaw] = useState<number | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const { markTested, mirrored } = ctx;

  // No prompt on Android, and an iPhone that already said yes doesn't ask again: start straight away.
  useEffect(() => {
    if (mode !== "live" || !caps.motion) return;
    const id = window.requestAnimationFrame(() => startSensor({ quiet: true }));
    return () => window.cancelAnimationFrame(id);
  }, [mode, caps.motion, startSensor]);

  // The phone on the booth screen faces the room the way this phone faced when its readings began.
  if (sensor.status === "live" && yaw == null) setYaw(pointingHeading(rotationMatrix(sensor.euler)) ?? 0);

  // On a linked phone these go to the booth screen; on the booth laptop they come from the phone.
  const shared = useShared<MotionShare>("motion", {
    mode,
    status: sensor.status,
    tilt: sensor.tilt,
    euler: roundEuler(sensor.euler),
    yaw: yaw ?? 0,
    heading: sensor.heading == null ? null : Math.round(sensor.heading),
    compass: sensor.compass,
    movement: roundMovement(sensor.movement),
    rate: sensor.rate,
    simTilt,
    simMovement,
  });
  const live = shared.mode === "live" && shared.status === "live";
  const sim = shared.mode === "sim";
  const tilt = sim ? shared.simTilt : shared.tilt;
  const movement = sim ? shared.simMovement : shared.movement;
  const heading = sim ? null : shared.heading;
  const compass: CompassState = sim ? "none" : shared.compass;
  // The pose may come from another device: anything malformed leaves the twin level rather than breaking it.
  const pose: TwinPose = sim
    ? { euler: eulerFromTilt(isTilt(shared.simTilt) ? shared.simTilt : LEVEL), yaw: 0 }
    : { euler: isEuler(shared.euler) ? shared.euler : eulerFromTilt(LEVEL), yaw: Number.isFinite(shared.yaw) ? shared.yaw : 0 };

  useEffect(() => {
    if (live) markTested();
  }, [live, markTested]);

  // Arrow keys tilt the simulated phone while nothing else has focus.
  useEffect(() => {
    if (!sim || mirrored) return;
    const onKey = (event: KeyboardEvent) => {
      if (!TILT_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target !== document.body && !target.hasAttribute("data-tilt-surface")) return;
      event.preventDefault();
      setSimTilt((t) => keyTilt(t, event.key) ?? t);
      markTested();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sim, mirrored, markTested]);

  // A simulated walk or run: made-up accelerometer force through the real step counter.
  useEffect(() => {
    if (!walk) return;
    let state = createStepState();
    let seconds = 0;
    const id = window.setInterval(() => {
      for (let i = 0; i < 6; i++) {
        seconds += 1 / 60;
        state = stepReducer(state, syntheticForce(walk.kind, seconds), seconds * 1000);
      }
      setSimMovement({ steps: state.steps, kind: movementKind(state.recent), trace: state.recent.slice(-60).map((v) => Math.round(v * 10) / 10) });
      if (seconds >= WALK_SECONDS) {
        window.clearInterval(id);
        setWalk(null);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [walk]);

  const switchMode = (next: Source) => {
    if (next === mode) return;
    if (next === "sim") stopSensor();
    setMode(next);
  };

  const simulate = (kind: "walk" | "run") => {
    setWalk({ kind, id: performance.now() });
    markTested();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!sim) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    drag.current = { id: d.id, x: event.clientX, y: event.clientY };
    setSimTilt((t) => dragTilt(t, dx, dy));
    markTested();
  };
  const endDrag = () => {
    drag.current = null;
  };

  const moving = movement && movement.kind !== "still";
  const guess: Guess = moving ? movementGuess(movement.kind) : tiltGuess(tilt);
  const source: Source = sim ? "sim" : "live";
  const island = useIslandNotice(live, <IslandLabel tone="motion">Motion on</IslandLabel>);

  const sideways = useLatch(Math.abs(tilt.roll) > SIDEWAYS_AT);
  const flat = useLatch(tilt.pitch <= FLAT_AT);
  const shaken = useLatch(movement?.kind === "running");
  const tasks: Task[] = [
    { id: "side", label: "Tip it onto its side", done: sideways },
    { id: "flat", label: "Lay it flat", done: flat },
    sim
      ? { id: "run", label: "Try a made-up run", done: shaken, action: { label: "Run", onClick: () => simulate("run") } }
      : { id: "shake", label: "Shake it hard. What does it think you're doing?", done: shaken },
  ];

  const compassText =
    heading != null
      ? `${heading}°, ${headingName(heading).toLowerCase()}`
      : sim
        ? "A laptop has none"
        : compass === "none"
          ? "Not shared by this browser"
          : "Waiting";

  const readout = [
    { label: "Forward or back", value: `${signed(tilt.pitch)}°` },
    { label: "Left or right", value: `${signed(tilt.roll)}°` },
    { label: "Compass", value: compassText },
    { label: "Steps counted", value: movement ? String(movement.steps) : "0" },
    { label: "Movement", value: movement ? KIND_LABEL[movement.kind] : "Still" },
    ...(live && shared.rate ? [{ label: "Readings a second", value: String(shared.rate) }] : []),
    { label: "Sensors", value: ctx.experiment.tech },
  ];

  const gate: SensorGate | null = sim
    ? null
    : {
        status: shared.status,
        startLabel: "Turn on motion",
        startIcon: <Rotate3d />,
        onStart: () => startSensor(),
        stopLabel: "Turn off motion",
        onStop: stopSensor,
        issue: issueCopy("motion", shared.status),
        onSimulate: () => switchMode("sim"),
        privacy: link.controller ? "Tilt readings go to the booth screen too, and nothing is saved." : "Tilt readings stay on this phone.",
      };

  const controls = sim ? (
    <div className="flex flex-col gap-4">
      <p className="type-body text-fg-muted">
        {caps.touch ? "Drag the picture to tilt the phone." : "Drag the phone to tilt it."} The ball rolls the way gravity pulls.
      </p>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            variant="secondary"
            onClick={() => {
              setSimTilt(preset.tilt);
              markTested();
            }}
          >
            {preset.label}
          </Button>
        ))}
        <Button variant="secondary" icon={<Footprints />} loading={walk?.kind === "walk"} onClick={() => simulate("walk")}>
          Walk
        </Button>
      </div>
    </div>
  ) : link.controller && live ? (
    <Button variant="ghost" onClick={() => setYaw(pointingHeading(rotationMatrix(sensor.euler)) ?? 0)} className="-ml-3 self-start">
      Line up the phone on the booth screen
    </Button>
  ) : null;

  return (
    <ExperimentLayout
      ctx={ctx}
      live={live}
      source={source}
      stageLabel={sim ? "Simulated phone. Drag to tilt it, or use the arrow keys." : "Your phone's tilt, compass and movement"}
      island={island}
      surface={
        sim && !mirrored
          ? {
              tabIndex: 0,
              "data-tilt-surface": "",
              onPointerDown,
              onPointerMove,
              onPointerUp: endDrag,
              onPointerCancel: endDrag,
              onLostPointerCapture: endDrag,
              className: "cursor-grab touch-none select-none outline-offset-4 active:cursor-grabbing",
            }
          : undefined
      }
      wrapFrame={(frame, width) => (
        <Twin pose={pose} width={width}>
          {frame}
        </Twin>
      )}
      stage={<MotionStage tilt={tilt} heading={heading} compass={compass} sim={sim} movement={movement} source={source} />}
      gate={gate}
      modeSwitch={caps.motion && !mirrored ? <ModeSwitch value={mode} onChange={switchMode} /> : null}
      controls={controls}
      tasks={tasks}
      readout={readout}
      guess={sim || live ? guess : null}
      guessWaiting="Turn on motion to see what it guesses."
      numbers={sim || live ? `forward ${signed(tilt.pitch)}°   sideways ${signed(tilt.roll)}°${heading != null ? `   heading ${heading}°` : ""}` : null}
      summary={`Tilted ${signed(tilt.pitch)} degrees forward and ${signed(tilt.roll)} sideways. Guess: ${guess.label}.`}
      keys={
        sim
          ? [
              { keys: ["←", "→", "↑", "↓"], label: "Tilt" },
              { keys: ["0"], label: "Level it" },
            ]
          : undefined
      }
    />
  );
}

/** A heading that turns the short way round, for a ring that never spins back through 360. */
function useUnwrapped(angle: number | null): number {
  const [state, setState] = useState({ raw: angle ?? 0, total: angle ?? 0 });
  if (angle != null && angle !== state.raw) {
    const delta = ((angle - state.raw + 540) % 360) - 180;
    setState({ raw: angle, total: state.total + delta });
  }
  return state.total;
}

const CARDINALS = [
  { deg: 0, label: "N" },
  { deg: 90, label: "E" },
  { deg: 180, label: "S" },
  { deg: 270, label: "W" },
];

/**
 * The phone's own screen: a compass ring around a spirit level. The ring turns
 * with the real heading (only where the browser shares one), the ball rolls
 * the way gravity pulls, and the numbers underneath are the raw tilt.
 */
function MotionStage({
  tilt,
  heading,
  compass,
  sim,
  movement,
  source,
}: {
  tilt: Tilt;
  heading: number | null;
  compass: CompassState;
  sim: boolean;
  movement: MovementReading | null;
  source: Source;
}) {
  const ball = ballOffset(tilt);
  const ring = useUnwrapped(heading);
  const hasCompass = heading != null;
  const note = hasCompass
    ? `Facing ${headingName(heading).toLowerCase()}`
    : sim
      ? "No compass on a laptop"
      : compass === "none"
        ? "This browser doesn't share a compass"
        : "Looking for north";
  return (
    <StageShell title="Motion" source={source} className="dot-field">
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 px-5">
        <p className="type-label text-center text-fg-muted">
          {note}
          {hasCompass ? <span className="tabular-nums text-fg"> {heading}°</span> : null}
        </p>
        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          <svg viewBox="0 0 200 200" className="aspect-square h-full max-h-64 w-auto max-w-full" aria-hidden>
            {/* Compass ring: turns so north stays north. */}
            <g
              style={{ transform: `rotate(${(-ring).toFixed(1)}deg)`, transformOrigin: "100px 100px", transition: "transform 140ms linear" }}
              opacity={hasCompass ? 1 : 0.35}
            >
              <circle cx={100} cy={100} r={93} className="fill-sunken stroke-fg/20" strokeWidth={1.5} />
              {Array.from({ length: 36 }, (_, i) => {
                const deg = i * 10;
                const long = deg % 90 === 0;
                const mid = deg % 30 === 0;
                const len = long ? 11 : mid ? 7 : 4;
                const a = ((deg - 90) * Math.PI) / 180;
                return (
                  <line
                    key={deg}
                    x1={100 + Math.cos(a) * 90}
                    y1={100 + Math.sin(a) * 90}
                    x2={100 + Math.cos(a) * (90 - len)}
                    y2={100 + Math.sin(a) * (90 - len)}
                    className={long ? "stroke-fg/70" : "stroke-fg/30"}
                    strokeWidth={long ? 2.2 : 1.4}
                    strokeLinecap="round"
                  />
                );
              })}
              {hasCompass
                ? CARDINALS.map(({ deg, label }) => {
                    const a = ((deg - 90) * Math.PI) / 180;
                    return (
                      <text
                        key={label}
                        x={100 + Math.cos(a) * 66}
                        y={100 + Math.sin(a) * 66 + 5}
                        textAnchor="middle"
                        className={label === "N" ? "fill-game" : "fill-fg-muted"}
                        style={{
                          font: "700 15px var(--font-sans)",
                          transform: `rotate(${ring.toFixed(1)}deg)`,
                          transformBox: "fill-box",
                          transformOrigin: "center",
                          transition: "transform 140ms linear",
                        }}
                      >
                        {label}
                      </text>
                    );
                  })
                : null}
            </g>
            {/* Where the phone points. */}
            {hasCompass ? <path d="M100 3 l-6 10 h12 z" className="fill-game" /> : null}
            {/* Spirit level. */}
            <circle cx={100} cy={100} r={50} className="fill-canvas stroke-fg/25" strokeWidth={1.5} />
            <circle cx={100} cy={100} r={18} fill="none" className="stroke-fg/20" strokeWidth={1.2} />
            <line x1={50} y1={100} x2={150} y2={100} className="stroke-fg/12" strokeWidth={1} />
            <line x1={100} y1={50} x2={100} y2={150} className="stroke-fg/12" strokeWidth={1} />
            <g style={{ transform: `translate(${(ball.x * 36).toFixed(2)}px, ${(ball.y * 36).toFixed(2)}px)`, transition: "transform 90ms linear" }}>
              <circle cx={100} cy={100} r={11} className="fill-game" />
              <circle cx={100} cy={100} r={3.5} className="fill-game-ink/80" />
            </g>
          </svg>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 pb-1 text-center">
          <TiltNumber value={tilt.pitch} label="Forward" />
          <TiltNumber value={tilt.roll} label="Sideways" />
        </div>
      </div>
      <div className={cn("px-4", STAGE_BOTTOM)}>
        <div className="flex items-center gap-3 rounded-lg bg-fg/[0.05] px-4 py-3">
          <div className="flex shrink-0 flex-col gap-1">
            <span className="type-label text-fg-subtle">Steps</span>
            <span className="type-label tabular-nums text-fg">{movement ? movement.steps : 0}</span>
          </div>
          {/* The trace can come from another device: draw it only if it really is a list of numbers. */}
          <Sparkline values={movement && Array.isArray(movement.trace) ? movement.trace.filter((v) => typeof v === "number") : []} />
          <span className="type-label shrink-0 text-game">{movement ? KIND_LABEL[movement.kind] : "Still"}</span>
        </div>
      </div>
    </StageShell>
  );
}

/** Raw tilt in the scoreboard face, changing at most 4 times a second so the digits read. */
function TiltNumber({ value, label }: { value: number; label: string }) {
  const shown = useThrottled(Math.round(value), 250);
  return (
    <div className="flex flex-col items-center gap-1 [&_.type-score]:text-[clamp(2.5rem,12cqw,3.25rem)]">
      <span className="type-score text-fg">{signed(shown)}°</span>
      <span className="type-label text-fg-subtle">{label}</span>
    </div>
  );
}

/** The accelerometer's total force over the last second: flat when still, waves when walking. */
function Sparkline({ values }: { values: number[] }) {
  const w = 100;
  const h = 32;
  const points =
    values.length > 1
      ? values
          .map((v, i) => {
            const x = (i / (values.length - 1)) * w;
            const y = h - (Math.min(22, Math.max(0, v)) / 22) * h;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ")
      : `0,${(h - (9.81 / 22) * h).toFixed(1)} ${w},${(h - (9.81 / 22) * h).toFixed(1)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden className="h-8 min-w-0 flex-1 text-game">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
