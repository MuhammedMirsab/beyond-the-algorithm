"use client";

import { Mic } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ToggleChip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import { levelPercent, QUIET_LEVEL, rmsFromBytes, soundGuess, synthBytes, wavePath, type SimSound } from "../../engine/audio-level";
import { pushLimited } from "../../engine/math";
import { issueCopy } from "../../sensors/status";
import { useCapabilities } from "../../sensors/use-device";
import { LEVEL_HISTORY, useMicLevel } from "../../sensors/use-mic-level";
import { ExperimentLayout, type ExperimentProps } from "../experiment-layout";
import {
  IslandLabel,
  LiveControl,
  liveControlHasPrimary,
  ModeSwitch,
  STAGE_BOTTOM,
  StageScore,
  StageShell,
  useIslandNotice,
  type Source,
} from "../parts";

const SIM_SOUNDS: { id: SimSound; label: string }[] = [
  { id: "quiet", label: "A quiet room" },
  { id: "talking", label: "Someone talking" },
  { id: "crowd", label: "A busy hall" },
];

export function MicrophoneExperiment({ ctx }: ExperimentProps) {
  const caps = useCapabilities();
  const mic = useMicLevel();
  const [mode, setMode] = useState<Source>(caps.media ? "live" : "sim");
  const [simSound, setSimSound] = useState<SimSound | null>(null);
  const [simLevel, setSimLevel] = useState(0);
  const [simHistory, setSimHistory] = useState<number[]>([]);
  const { markTested } = ctx;

  const sim = mode === "sim";
  const live = !sim && mic.status === "live";

  useEffect(() => {
    if (live) markTested();
  }, [live, markTested]);

  // The simulated sound runs through the same level maths as the real microphone.
  useEffect(() => {
    if (!sim || !simSound) return;
    let recent: number[] = [];
    const startedAt = performance.now();
    const id = window.setInterval(() => {
      const seconds = (performance.now() - startedAt) / 1000;
      const value = levelPercent(rmsFromBytes(synthBytes(simSound, seconds)));
      recent = pushLimited(recent, value, LEVEL_HISTORY);
      setSimLevel(value);
      setSimHistory(recent);
    }, 83);
    return () => window.clearInterval(id);
  }, [sim, simSound]);

  const switchMode = (next: Source) => {
    if (next === mode) return;
    if (next === "sim") mic.stop();
    setMode(next);
  };

  const level = sim ? simLevel : mic.level;
  const history = sim ? simHistory : mic.history;
  const active = sim ? simSound != null : live;
  const guess = active ? soundGuess(history) : null;
  const island = useIslandNotice(live, <IslandLabel tone="microphone">Microphone on</IslandLabel>);

  const readout = [
    { label: "Loudness", value: active ? `${level} of 100` : "Waiting" },
    {
      label: "Samples a second",
      value: sim ? "Simulated" : mic.sampleRate ? mic.sampleRate.toLocaleString("en") : "Waiting",
    },
    { label: "Seconds it listens to", value: "The last 3" },
    { label: "Recorded or saved", value: "Nothing" },
  ];

  const tryIt = (
    <div className="flex flex-col gap-5">
      {caps.media ? <ModeSwitch value={mode} onChange={switchMode} /> : null}
      {sim ? (
        <div className="flex flex-col gap-3">
          <p className="type-body text-fg-muted">Pick a sound. Each one is a made-up wave.</p>
          <div className="flex flex-wrap gap-2">
            {SIM_SOUNDS.map((s) => (
              <ToggleChip
                key={s.id}
                pressed={simSound === s.id}
                onClick={() => {
                  setSimSound(s.id);
                  markTested();
                }}
              >
                {s.label}
              </ToggleChip>
            ))}
          </div>
        </div>
      ) : (
        <LiveControl
          status={mic.status}
          startLabel="Turn on microphone"
          startIcon={<Mic />}
          stopLabel="Turn off microphone"
          onStart={mic.start}
          onStop={mic.stop}
          issue={issueCopy("microphone", mic.status)}
          onSimulate={() => switchMode("sim")}
          privacy="Sound stays on this device. Nothing is recorded or uploaded."
          liveHint="Talk, clap, then stay quiet for a few seconds. On a real phone, an orange or green dot at the top of the screen means an app is using the microphone."
        />
      )}
    </div>
  );

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
            <Waveform analyser={sim ? null : mic.analyser} synth={sim ? simSound : null} active={active} />
            <LevelBars history={history} />
          </div>
          <p className={cn("type-label px-5 text-game", STAGE_BOTTOM)}>{guess ? guess.label : "Not listening"}</p>
        </StageShell>
      }
      tryIt={tryIt}
      readout={readout}
      guess={guess}
      guessWaiting="Turn on the microphone, or pick a sound, to see what it guesses."
      primaryTaken={!sim && liveControlHasPrimary(mic.status)}
      summary={active ? `Loudness ${level} of 100. Guess: ${guess?.label ?? ""}.` : "Microphone is off."}
    />
  );
}

/** The wave itself, redrawn every frame straight from the analyser (4 times a second with reduced motion). */
function Waveform({
  analyser,
  synth,
  active,
}: {
  analyser: RefObject<AnalyserNode | null> | null;
  synth: SimSound | null;
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
  }, [analyser, synth, active, reduce]);
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
  const start = slots - history.length;
  return (
    <svg viewBox={`0 0 ${slots * 3} 30`} preserveAspectRatio="none" aria-hidden className="h-12 w-full">
      {Array.from({ length: slots }, (_, i) => {
        const value = i >= start ? history[i - start] : 0;
        const h = Math.max(1, (value / 100) * 30);
        return <rect key={i} x={i * 3 + 0.5} y={30 - h} width={2} height={h} rx={0.6} className={value > QUIET_LEVEL ? "fill-game" : "fill-fg/20"} />;
      })}
    </svg>
  );
}
