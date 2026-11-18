"use client";

import { Mic } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ToggleChip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import { levelPercent, QUIET_LEVEL, rmsFromBytes, soundGuess, synthBytes, wavePath, type SimSound } from "../../engine/audio-level";
import { pushLimited } from "../../engine/math";
import { useLink, useShared } from "../../link/link";
import { issueCopy } from "../../sensors/status";
import { useCapabilities } from "../../sensors/use-device";
import { LEVEL_HISTORY, useMicLevel } from "../../sensors/use-mic-level";
import { ExperimentLayout, type ExperimentProps } from "../experiment-layout";
import {
  IslandLabel,
  ModeSwitch,
  STAGE_BOTTOM,
  StageScore,
  StageShell,
  useIslandNotice,
  useLatch,
  type SensorGate,
  type Source,
  type Task,
} from "../parts";

const WAVE_POINTS = 96;
/** A clap or a shout: louder than talking. */
const CLAP_AT = 70;

const SIM_SOUNDS: { id: SimSound; label: string }[] = [
  { id: "quiet", label: "A quiet room" },
  { id: "talking", label: "Someone talking" },
  { id: "crowd", label: "A busy hall" },
];

const numbers = (value: unknown): number[] => (Array.isArray(value) ? value.filter((v): v is number => typeof v === "number") : []);

export function MicrophoneExperiment({ ctx }: ExperimentProps) {
  const caps = useCapabilities();
  const mic = useMicLevel();
  const [mode, setMode] = useState<Source>(caps.media ? "live" : "sim");
  const [simSound, setSimSound] = useState<SimSound | null>(null);
  const [triedSounds, setTriedSounds] = useState<SimSound[]>([]);
  const [simLevel, setSimLevel] = useState(0);
  const [simHistory, setSimHistory] = useState<number[]>([]);
  const { markTested, mirrored } = ctx;

  const link = useLink();
  const sending = link.role === "phone" && link.linked;
  const [wave, setWave] = useState<number[] | null>(null);

  // A linked phone sends a rough outline of the wave, 12 times a second: enough to draw, far too little to hear.
  const { analyser } = mic;
  useEffect(() => {
    if (!sending || mode !== "live" || mic.status !== "live") return;
    const buffer = new Uint8Array(2048);
    const id = window.setInterval(() => {
      const node = analyser.current;
      if (!node) return;
      node.getByteTimeDomainData(buffer);
      const step = Math.floor(buffer.length / WAVE_POINTS);
      setWave(Array.from({ length: WAVE_POINTS }, (_, i) => buffer[i * step]));
    }, 83);
    return () => window.clearInterval(id);
  }, [sending, mode, mic.status, analyser]);

  const shared = useShared("microphone", {
    mode,
    simSound,
    status: mic.status,
    level: mic.level,
    history: mic.history,
    sampleRate: mic.sampleRate,
    wave: sending && mic.status === "live" ? wave : null,
  });
  const sim = shared.mode === "sim";
  const live = !sim && shared.status === "live";

  useEffect(() => {
    if (live) markTested();
  }, [live, markTested]);

  // The simulated sound runs through the same level maths as the real microphone.
  const playing = shared.simSound;
  useEffect(() => {
    if (!sim || !playing) return;
    let recent: number[] = [];
    const startedAt = performance.now();
    const id = window.setInterval(() => {
      const seconds = (performance.now() - startedAt) / 1000;
      const value = levelPercent(rmsFromBytes(synthBytes(playing, seconds)));
      recent = pushLimited(recent, value, LEVEL_HISTORY);
      setSimLevel(value);
      setSimHistory(recent);
    }, 83);
    return () => window.clearInterval(id);
  }, [sim, playing]);

  const switchMode = (next: Source) => {
    if (next === mode) return;
    if (next === "sim") mic.stop();
    setMode(next);
  };

  const level = sim ? simLevel : Number(shared.level) || 0;
  const history = sim ? simHistory : numbers(shared.history);
  const active = sim ? shared.simSound != null : live;
  const guess = active ? soundGuess(history) : null;
  const island = useIslandNotice(live, <IslandLabel tone="microphone">Microphone on</IslandLabel>);

  const clapped = useLatch(live && level >= CLAP_AT);
  const listened = useLatch(active && history.length >= LEVEL_HISTORY);
  const tasks: Task[] = sim
    ? [
        { id: "pick", label: "Pick a sound", done: triedSounds.length > 0 },
        { id: "all", label: "Try all three, and watch the guess change", done: triedSounds.length >= SIM_SOUNDS.length },
      ]
    : [
        { id: "clap", label: "Clap once, loudly", done: clapped },
        { id: "listen", label: "Let it listen to the room for 3 seconds", done: listened },
      ];

  const readout = [
    { label: "Loudness", value: active ? `${level} of 100` : "Waiting" },
    {
      label: "Samples a second",
      value: sim ? "Simulated" : shared.sampleRate ? Number(shared.sampleRate).toLocaleString("en") : "Waiting",
    },
    { label: "Seconds it listens to", value: "The last 3" },
    { label: "Recorded or saved", value: "Nothing" },
  ];

  const gate: SensorGate | null = sim
    ? null
    : {
        status: shared.status,
        startLabel: "Turn on microphone",
        startIcon: <Mic />,
        onStart: mic.start,
        stopLabel: "Turn off microphone",
        onStop: mic.stop,
        issue: issueCopy("microphone", mic.status),
        onSimulate: () => switchMode("sim"),
        privacy: link.controller
          ? "Sound stays on this phone. The booth screen gets only the loudness and a rough outline of the wave."
          : "Sound stays on this device. Nothing is recorded or uploaded.",
      };

  const controls =
    sim && !mirrored ? (
      <div className="flex flex-wrap gap-2">
        {SIM_SOUNDS.map((s) => (
          <ToggleChip
            key={s.id}
            pressed={shared.simSound === s.id}
            onClick={() => {
              setSimSound(s.id);
              setTriedSounds((list) => (list.includes(s.id) ? list : [...list, s.id]));
              markTested();
            }}
          >
            {s.label}
          </ToggleChip>
        ))}
      </div>
    ) : null;

  return (
    <ExperimentLayout
      ctx={ctx}
      live={live}
      source={sim ? "sim" : "live"}
      stageLabel={sim ? "A made-up sound wave and its loudness" : "Your microphone's sound wave and loudness"}
      island={island}
      stage={
        <StageShell title="Microphone" source={sim ? "sim" : "live"} className="dot-field">
          <div className="flex flex-1 flex-col justify-center gap-6 px-5">
            <StageScore value={active ? level : 0} label="Loudness" />
            <Waveform
              analyser={sim || mirrored ? null : mic.analyser}
              synth={sim ? shared.simSound : null}
              samples={mirrored && !sim ? (shared.wave ? numbers(shared.wave) : null) : null}
              active={active}
            />
            <LevelBars history={history} />
          </div>
          <p className={cn("type-label px-5 text-game", STAGE_BOTTOM)}>{guess ? guess.label : "Not listening"}</p>
        </StageShell>
      }
      gate={gate}
      modeSwitch={caps.media && !mirrored ? <ModeSwitch value={mode} onChange={switchMode} /> : null}
      controls={controls}
      tasks={tasks}
      readout={readout}
      guess={guess}
      guessWaiting="Turn on the microphone, or pick a sound, to see what it guesses."
      numbers={active ? `loudness ${level} of 100${!sim && shared.sampleRate ? `   ${Number(shared.sampleRate).toLocaleString("en")} samples a second` : ""}` : null}
      summary={active ? `Loudness ${level} of 100. Guess: ${guess?.label ?? ""}.` : "Microphone is off."}
    />
  );
}

/** The wave itself, redrawn every frame straight from the analyser (4 times a second with reduced motion). */
function Waveform({
  analyser,
  synth,
  samples = null,
  active,
}: {
  analyser: RefObject<AnalyserNode | null> | null;
  synth: SimSound | null;
  /** The outline a linked phone sends, drawn as it arrives. */
  samples?: number[] | null;
  active: boolean;
}) {
  const path = useRef<SVGPathElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = path.current;
    if (!el) return;
    if (!active) {
      el.setAttribute("d", wavePath(null, 100, 40));
      return;
    }
    if (samples) {
      el.setAttribute("d", wavePath(samples, 100, 40));
      return;
    }
    const buffer = new Uint8Array(2048);
    let frame = 0;
    let last = -Infinity;
    const draw = (now: number) => {
      frame = window.requestAnimationFrame(draw);
      if (reduce && now - last < 250) return;
      last = now;
      let data: ArrayLike<number> | null = null;
      if (synth) data = synthBytes(synth, now / 1000, 512);
      else if (analyser?.current) {
        analyser.current.getByteTimeDomainData(buffer);
        data = buffer;
      }
      el.setAttribute("d", wavePath(data, 100, 40));
    };
    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [analyser, synth, samples, active, reduce]);
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden className="h-28 w-full text-game">
      <line x1={0} y1={20} x2={100} y2={20} strokeWidth={1} vectorEffect="non-scaling-stroke" className="stroke-fg/15" />
      <path ref={path} d={wavePath(null, 100, 40)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The last 3 seconds of loudness, the evidence behind the guess. */
function LevelBars({ history }: { history: number[] }) {
  const slots = LEVEL_HISTORY;
  const shown = history.slice(-slots);
  const start = slots - shown.length;
  return (
    <svg viewBox={`0 0 ${slots * 3} 30`} preserveAspectRatio="none" aria-hidden className="h-12 w-full">
      {Array.from({ length: slots }, (_, i) => {
        const value = i >= start ? shown[i - start] : 0;
        const h = Math.max(1, (Math.min(100, value) / 100) * 30);
        return <rect key={i} x={i * 3 + 0.5} y={30 - h} width={2} height={h} rx={0.6} className={value > QUIET_LEVEL ? "fill-game" : "fill-fg/20"} />;
      })}
    </svg>
  );
}
