"use client";

import { Camera } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SliderRow } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import {
  LIGHT_MODE_LABEL,
  LIGHT_PRESETS,
  lightGuessFromCamera,
  lightGuessFromLux,
  lightMode,
  luxFromSlider,
  screenBrightness,
  SLIDER_MAX,
  SLIDER_MIN,
  sliderFromCamera,
} from "../../engine/light";
import { issueCopy } from "../../sensors/status";
import { useCameraFrames } from "../../sensors/use-camera-frames";
import { useCapabilities } from "../../sensors/use-device";
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

/** The room behind the drawn phone: from a dark room to a sunny day. */
function roomColor(level: number) {
  return `color-mix(in oklab, var(--color-sunken), oklch(0.93 0.035 85) ${Math.round(level)}%)`;
}

export function LightExperiment({ ctx }: ExperimentProps) {
  const caps = useCapabilities();
  const { attachVideoElement, ...cam } = useCameraFrames();
  const [mode, setMode] = useState<Source>(caps.media ? "live" : "sim");
  const [room, setRoom] = useState<number>(LIGHT_PRESETS[1].value);
  const { markTested } = ctx;

  const sim = mode === "sim";
  const live = !sim && cam.status === "live" && cam.stats != null;

  useEffect(() => {
    if (live) markTested();
  }, [live, markTested]);

  const switchMode = (next: Source) => {
    if (next === mode) return;
    if (next === "sim") cam.stop();
    setMode(next);
  };

  const lux = luxFromSlider(room);
  const cameraLevel = cam.stats ? sliderFromCamera(cam.stats.brightness) : null;
  const level = sim ? room : cameraLevel;
  const screen = level != null ? screenBrightness(level) : null;
  const guess = sim ? lightGuessFromLux(lux) : cam.stats ? lightGuessFromCamera(cam.stats.brightness) : null;
  const island = useIslandNotice(cam.status === "live" && !sim, <IslandLabel tone="camera">Camera on</IslandLabel>);

  const readout = sim
    ? [
        { label: "Light in the room", value: `${lux.toLocaleString("en")} lux` },
        { label: "Screen brightness", value: `${screen}%` },
        { label: "Screen mode", value: LIGHT_MODE_LABEL[lightMode(lux)] },
      ]
    : [
        { label: "Camera brightness", value: cameraLevel != null ? `${cameraLevel}%` : "Waiting" },
        { label: "Screen brightness", value: screen != null ? `${screen}%` : "Waiting" },
        { label: "Light sensor", value: "Hidden from websites" },
      ];

  const tryIt = (
    <div className="flex flex-col gap-5">
      {caps.media ? <ModeSwitch value={mode} onChange={switchMode} /> : null}
      {sim ? (
        <div className="flex flex-col gap-3">
          <SliderRow
            label="Light in the room"
            value={room}
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            valueText={`${lux.toLocaleString("en")} lux`}
            onValueChange={(v) => {
              setRoom(v);
              markTested();
            }}
          />
          <div className="flex flex-wrap gap-2">
            {LIGHT_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant="secondary"
                onClick={() => {
                  setRoom(preset.value);
                  markTested();
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <LiveControl
          status={cam.status}
          startLabel="Measure with the camera"
          startIcon={<Camera />}
          stopLabel="Turn off camera"
          onStart={cam.start}
          onStop={cam.stop}
          issue={issueCopy("camera", cam.status)}
          onSimulate={() => switchMode("sim")}
          privacy="Browsers don't let websites read the light sensor, so this estimates the light from the camera. Nothing is recorded."
          liveHint="Cover the camera with your hand, then point it at a lamp or a window. Watch the screen follow."
        />
      )}
    </div>
  );

  return (
    <ExperimentLayout
      ctx={ctx}
      live={live}
      source={sim ? "sim" : "live"}
      stageLabel="A phone screen that dims and brightens with the light"
      island={island}
      backdrop={level != null ? roomColor(level) : undefined}
      stage={
        <StageShell title="Light" source={sim ? "sim" : "live"}>
          {!sim ? (
            <video
              ref={attachVideoElement}
              muted
              playsInline
              autoPlay
              aria-hidden
              className={cn(
                "absolute right-5 top-[calc(var(--phone-safe-top,0px)+44px)] z-10 size-14 -scale-x-100 rounded-full object-cover shadow-ring",
                cam.status !== "live" && "invisible",
              )}
            />
          ) : null}
          <div className="relative mx-4 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-lg bg-fg p-5">
            <span className="h-3 w-2/3 rounded-full bg-canvas/80" />
            <span className="h-2 w-full rounded-full bg-canvas/35" />
            <span className="h-2 w-11/12 rounded-full bg-canvas/35" />
            <span className="h-2 w-4/5 rounded-full bg-canvas/35" />
            <span className="mt-2 aspect-[4/3] w-full rounded-md bg-game/70" />
            <span className="h-2 w-full rounded-full bg-canvas/35" />
            <span className="h-2 w-3/4 rounded-full bg-canvas/35" />
            {/* The screen's own brightness: a dark layer that lifts as the light rises. */}
            <span
              aria-hidden
              className="absolute inset-0 bg-black transition-opacity duration-300 ease-out"
              style={{ opacity: screen != null ? ((100 - screen) / 100) * 0.9 : 0.9 }}
            />
          </div>
          <div className={cn("flex items-end justify-between gap-4 px-5 pt-5", STAGE_BOTTOM)}>
            {sim ? (
              <StageScore value={lux} label="Lux" size="md" />
            ) : (
              <StageScore value={cameraLevel ?? 0} suffix="%" label="Camera light" size="md" />
            )}
            <div className="flex flex-col items-end gap-1 pb-1 text-right">
              <span className="type-label text-fg-subtle">Screen</span>
              <span className="type-label tabular-nums text-fg">{screen != null ? `${screen}%` : "Off"}</span>
            </div>
          </div>
        </StageShell>
      }
      tryIt={tryIt}
      readout={readout}
      guess={guess}
      guessWaiting="Measure the light to see what it guesses."
      primaryTaken={!sim && liveControlHasPrimary(cam.status)}
      summary={
        sim
          ? `${lux} lux. Screen at ${screen} percent. Guess: ${guess?.label ?? ""}.`
          : cameraLevel != null
            ? `Camera brightness ${cameraLevel} percent. Guess: ${guess?.label ?? ""}.`
            : "Camera is off."
      }
    />
  );
}
