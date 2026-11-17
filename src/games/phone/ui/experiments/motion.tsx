"use client";

import { Footprints, Rotate3d } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { signed, type Guess } from "../../engine/math";
import { createStepState, movementGuess, movementKind, stepReducer, syntheticForce, type MovementKind } from "../../engine/steps";
import { ballOffset, dragTilt, keyTilt, LEVEL, tiltGuess, type Tilt } from "../../engine/tilt";
import { issueCopy } from "../../sensors/status";
import { useCapabilities } from "../../sensors/use-device";
import { useDeviceTilt, type MovementReading } from "../../sensors/use-device-tilt";
import { ExperimentLayout, type ExperimentProps } from "../experiment-layout";
import {
  IslandLabel,
  KeyHint,
  LiveControl,
  liveControlHasPrimary,
  ModeSwitch,
  STAGE_BOTTOM,
  StageScore,
  StageShell,
  useIslandNotice,
  type Source,
} from "../parts";

const TILT_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "0", "Home"]);
const WALK_SECONDS = 4;

const PRESETS: { label: string; tilt: Tilt }[] = [
  { label: "Tilt left", tilt: { pitch: 5, roll: -30 } },
  { label: "Level", tilt: LEVEL },
  { label: "Tilt right", tilt: { pitch: 5, roll: 30 } },
  { label: "Lay it flat", tilt: { pitch: -42, roll: 0 } },
];

const KIND_LABEL: Record<MovementKind, string> = { still: "Still", walking: "Walking", running: "Running" };

export function MotionExperiment({ ctx }: ExperimentProps) {
  const caps = useCapabilities();
  const reduceMotion = useReducedMotion();
  const sensor = useDeviceTilt();
  const [mode, setMode] = useState<Source>(caps.motion ? "live" : "sim");
  const [simTilt, setSimTilt] = useState<Tilt>(LEVEL);
  const [walk, setWalk] = useState<{ kind: "walk" | "run"; id: number } | null>(null);
  const [simMovement, setSimMovement] = useState<MovementReading | null>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const { markTested } = ctx;

  const live = mode === "live" && sensor.status === "live";
  const sim = mode === "sim";
  const tilt = sim ? simTilt : sensor.tilt;
  const movement = sim ? simMovement : sensor.movement;

  useEffect(() => {
    if (live) markTested();
  }, [live, markTested]);

  // Arrow keys tilt the simulated phone while nothing else has focus.
  useEffect(() => {
    if (!sim) return;
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
  }, [sim, markTested]);

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
      setSimMovement({ steps: state.steps, kind: movementKind(state.recent), trace: state.recent.slice(-60) });
      if (seconds >= WALK_SECONDS) {
        window.clearInterval(id);
        setWalk(null);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [walk]);

  const switchMode = (next: Source) => {
    if (next === mode) return;
    if (next === "sim") sensor.stop();
    setMode(next);
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

  const readout = [
    { label: "Forward or back", value: `${signed(tilt.pitch)}°` },
    { label: "Left or right", value: `${signed(tilt.roll)}°` },
    { label: "Steps counted", value: movement ? String(movement.steps) : "0" },
    { label: "Movement", value: movement ? KIND_LABEL[movement.kind] : "Still" },
    ...(live && sensor.rate ? [{ label: "Readings a second", value: String(sensor.rate) }] : []),
    { label: "Sensors", value: ctx.experiment.tech },
  ];

  const tryIt = (
    <div className="flex flex-col gap-5">
      {caps.motion ? <ModeSwitch value={mode} onChange={switchMode} /> : null}
      {sim ? (
        <div className="flex flex-col gap-5">
          <p className="type-body text-fg-muted">
            {caps.touch ? "Drag the picture to tilt the phone." : "Drag the phone to tilt it."} The ball rolls the way gravity would pull it.
          </p>
          <KeyHint>
            Or use <Kbd>←</Kbd> <Kbd>→</Kbd> <Kbd>↑</Kbd> <Kbd>↓</Kbd>, and <Kbd>0</Kbd> to level it.
          </KeyHint>
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
          </div>
          <div className="flex flex-col gap-3">
            <p className="type-body text-fg-muted">
              {caps.touch ? "Or try a made-up walk and run." : "A laptop can't walk, so try a made-up walk and run instead."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon={<Footprints />}
                loading={walk?.kind === "walk"}
                onClick={() => {
                  setWalk({ kind: "walk", id: performance.now() });
                  markTested();
                }}
              >
                Simulate a walk
              </Button>
              <Button
                variant="secondary"
                icon={<Footprints />}
                loading={walk?.kind === "run"}
                onClick={() => {
                  setWalk({ kind: "run", id: performance.now() });
                  markTested();
                }}
              >
                Simulate a run
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <LiveControl
          status={sensor.status}
          startLabel="Turn on motion sensors"
          startIcon={<Rotate3d />}
          stopLabel="Turn off motion sensors"
          onStart={sensor.start}
          onStop={sensor.stop}
          issue={issueCopy("motion", sensor.status)}
          onSimulate={() => switchMode("sim")}
          privacy="Tilt readings stay on this phone."
          liveHint="Tilt your phone, then walk a few steps holding it. Shake it too, and see what it guesses."
        />
      )}
    </div>
  );

  const framedTilt = `perspective(1600px) rotateX(${(-tilt.pitch * 0.45).toFixed(1)}deg) rotateY(${(tilt.roll * 0.45).toFixed(1)}deg)`;

  return (
    <ExperimentLayout
      ctx={ctx}
      live={live}
      source={source}
      stageLabel={sim ? "Simulated phone. Drag to tilt it, or use the arrow keys." : "Your phone's tilt and movement"}
      island={island}
      surface={
        sim
          ? {
              tabIndex: 0,
              "data-tilt-surface": "",
              onPointerDown,
              onPointerMove,
              onPointerUp: endDrag,
              onPointerCancel: endDrag,
              onLostPointerCapture: endDrag,
              className: cn(
                "cursor-grab touch-none select-none outline-offset-4 active:cursor-grabbing",
                !reduceMotion && "transition-transform duration-150 ease-out",
              ),
            }
          : undefined
      }
      frameStyle={{ transform: framedTilt }}
      stage={<MotionStage tilt={tilt} movement={movement} source={source} />}
      tryIt={tryIt}
      readout={readout}
      guess={sim || live ? guess : null}
      guessWaiting="Turn on the motion sensors to see what it guesses."
      primaryTaken={!sim && liveControlHasPrimary(sensor.status)}
      summary={`Tilted ${signed(tilt.pitch)} degrees forward and ${signed(tilt.roll)} sideways. Guess: ${guess.label}.`}
    />
  );
}

function MotionStage({ tilt, movement, source }: { tilt: Tilt; movement: MovementReading | null; source: Source }) {
  const ball = ballOffset(tilt);
  return (
    <StageShell title="Motion" source={source} className="dot-field">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5">
        <div className="relative aspect-square w-[min(68%,15rem)]">
          <span aria-hidden className="absolute inset-0 rounded-full border border-fg/20 bg-sunken" />
          <span aria-hidden className="absolute inset-[24%] rounded-full border border-fg/12" />
          <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-fg/12" />
          <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-fg/12" />
          <span
            aria-hidden
            className="absolute inset-0 grid place-items-center"
            style={{ transform: `translate(${(ball.x * 38).toFixed(2)}%, ${(ball.y * 38).toFixed(2)}%)` }}
          >
            <span className="grid size-[20%] place-items-center rounded-full bg-game shadow-[0_4px_14px_oklch(0_0_0/0.45)]">
              <span className="size-[30%] rounded-full bg-game-ink/80" />
            </span>
          </span>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 text-center [&>div]:items-center">
          <StageScore value={Math.round(tilt.pitch)} label="Forward" suffix="°" size="md" />
          <StageScore value={Math.round(tilt.roll)} label="Sideways" suffix="°" size="md" />
        </div>
      </div>
      <div className={cn("px-4", STAGE_BOTTOM)}>
        <div className="flex items-center gap-3 rounded-lg bg-fg/[0.05] px-4 py-3">
          <div className="flex shrink-0 flex-col gap-1">
            <span className="type-label text-fg-subtle">Steps</span>
            <span className="type-label tabular-nums text-fg">{movement ? movement.steps : 0}</span>
          </div>
          <Sparkline values={movement?.trace ?? []} />
          <span className="type-label shrink-0 text-game">{movement ? KIND_LABEL[movement.kind] : "Still"}</span>
        </div>
      </div>
    </StageShell>
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
            const y = h - ((Math.min(22, Math.max(0, v)) - 0) / 22) * h;
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
