"use client";

import { Camera, CameraOff, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Segmented, SliderRow } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import {
  applyLightAndFocus,
  blurFromFocus,
  cameraGuess,
  cellGrid,
  frameStatsFromLuma,
  lumaFromRGBA,
  renderScene,
  SCENE_HEIGHT,
  SCENE_WIDTH,
} from "../../engine/frame-stats";
import { useLink, useShared } from "../../link/link";
import { issueCopy } from "../../sensors/status";
import { useCameraFrames, type CellView } from "../../sensors/use-camera-frames";
import { useCapabilities } from "../../sensors/use-device";
import { ExperimentLayout, type ExperimentProps } from "../experiment-layout";
import {
  IslandLabel,
  LiveControl,
  liveControlHasPrimary,
  ModeSwitch,
  STAGE_BOTTOM,
  StageShell,
  useIslandNotice,
  type Source,
} from "../parts";

type View = "picture" | "numbers";
const SIM_CELL = 5;

export function CameraExperiment({ ctx }: ExperimentProps) {
  const caps = useCapabilities();
  const { attachVideoElement, ...cam } = useCameraFrames();
  const [mode, setMode] = useState<Source>(caps.media ? "live" : "sim");
  const [view, setView] = useState<View>("picture");
  const [light, setLight] = useState(50);
  const [focus, setFocus] = useState(30);
  const { markTested } = ctx;

  // The picture never leaves the phone. A linked booth screen gets only the numbers and the coarse dot grid.
  const link = useLink();
  const mirrored = link.role === "host" && link.linked;
  const shared = useShared("camera", {
    mode,
    view,
    light,
    focus,
    status: cam.status,
    stats: cam.stats,
    grid: cam.view ? { cols: cam.view.cols, rows: cam.view.rows, cells: Array.from(cam.view.cells, (v) => Math.round(v * 100)) } : null,
  });
  const remoteView = useMemo<CellView | null>(
    () =>
      shared.grid ? { cols: shared.grid.cols, rows: shared.grid.rows, cells: Float32Array.from(shared.grid.cells, (v) => v / 100) } : null,
    [shared.grid],
  );
  const status = shared.status;
  const sim = shared.mode === "sim";
  const live = !sim && status === "live";
  const shownView: View = mirrored && !sim ? "numbers" : shared.view;

  useEffect(() => {
    if (live && cam.stats) markTested();
  }, [live, cam.stats, markTested]);

  // The simulated picture goes through exactly the same measurements as the camera.
  const scene = useMemo(() => renderScene(), []);
  const simFrame = useMemo(
    () => applyLightAndFocus(scene, SCENE_WIDTH, SCENE_HEIGHT, shared.light / 100, blurFromFocus(shared.focus)),
    [scene, shared.light, shared.focus],
  );
  const simLuma = useMemo(() => lumaFromRGBA(simFrame, SCENE_WIDTH, SCENE_HEIGHT), [simFrame]);
  const simStats = useMemo(() => frameStatsFromLuma(simLuma, SCENE_WIDTH, SCENE_HEIGHT), [simLuma]);
  const simView = useMemo<CellView>(() => {
    const cols = SCENE_WIDTH / SIM_CELL;
    const rows = SCENE_HEIGHT / SIM_CELL;
    return { cells: cellGrid(simLuma, SCENE_WIDTH, SCENE_HEIGHT, cols, rows), cols, rows };
  }, [simLuma]);

  const stats = sim ? simStats : shared.stats;
  const cells = sim ? simView : mirrored ? remoteView : cam.view;
  const guess = stats ? cameraGuess(stats) : null;

  const switchMode = (next: Source) => {
    if (next === mode) return;
    if (next === "sim") cam.stop();
    setMode(next);
  };

  const island = useIslandNotice(live, <IslandLabel tone="camera">Camera on</IslandLabel>);

  const readout = [
    { label: "Brightness", value: stats ? `${Math.round(stats.brightness * 100)}%` : "Waiting" },
    { label: "Sharpness", value: stats ? `${Math.round(stats.sharpness * 100)} of 100` : "Waiting" },
    { label: "Numbers in the grid", value: cells ? `${cells.cols} × ${cells.rows}` : "Waiting" },
    { label: "Measured", value: sim ? "Each time you move a slider" : "8 times a second" },
    { label: "Saved or uploaded", value: "Nothing" },
  ];

  const tryIt = (
    <div className="flex flex-col gap-5">
      {caps.media ? <ModeSwitch value={mode} onChange={switchMode} /> : null}
      {sim ? (
        <div className="flex flex-col gap-2">
          <p className="type-body text-fg-muted">A made-up photo of a sign and a face. Make it readable.</p>
          <SliderRow
            label="Light"
            value={light}
            min={2}
            max={100}
            valueText={light < 15 ? "Very dark" : light < 40 ? "Dim" : light < 75 ? "Normal" : "Bright"}
            onValueChange={(v) => {
              setLight(v);
              markTested();
            }}
          />
          <SliderRow
            label="Focus"
            value={focus}
            valueText={focus >= 90 ? "Sharp" : focus >= 50 ? "Slightly soft" : "Blurry"}
            onValueChange={(v) => {
              setFocus(v);
              markTested();
            }}
          />
        </div>
      ) : (
        <LiveControl
          status={status}
          startLabel="Turn on camera"
          startIcon={<Camera />}
          stopLabel="Turn off camera"
          onStart={cam.start}
          onStop={cam.stop}
          issue={issueCopy("camera", cam.status)}
          onSimulate={() => switchMode("sim")}
          privacy="The picture stays on this device. Nothing is recorded or uploaded."
          liveHint={
            <>
              {caps.touch ? "Hold the phone at arm's length, then cover the camera with a finger." : "Look at the camera, then cover it with your hand."}{" "}
              On a real phone, a green dot at the top of the screen means an app is using the camera right now.
            </>
          }
        />
      )}
      <Segmented
        label="What the screen shows"
        value={view}
        onValueChange={setView}
        options={[
          { value: "picture", label: "Picture" },
          { value: "numbers", label: "What the phone gets" },
        ]}
      />
    </div>
  );

  return (
    <ExperimentLayout
      ctx={ctx}
      live={live}
      source={sim ? "sim" : "live"}
      stageLabel={sim ? "A made-up photo, measured like a camera picture" : "Your camera picture, measured live"}
      island={island}
      stage={
        <StageShell title="Camera" source={sim ? "sim" : "live"} overlay className="bg-black">
          {sim ? (
            <SceneCanvas frame={simFrame} />
          ) : (
            <>
              <video
                ref={attachVideoElement}
                muted
                playsInline
                autoPlay
                aria-hidden
                className="absolute inset-0 size-full -scale-x-100 object-cover"
              />
              {status !== "live" ? <CameraOffNotice starting={status === "starting"} /> : null}
            </>
          )}
          {shownView === "numbers" && cells ? <DotsCanvas view={cells} /> : null}
          <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-5 pt-10", STAGE_BOTTOM)}>
            <div className="flex items-end justify-between gap-4">
              <Meter label="Bright" value={stats?.brightness ?? 0} />
              <Meter label="Sharp" value={stats?.sharpness ?? 0} />
            </div>
          </div>
        </StageShell>
      }
      tryIt={tryIt}
      readout={readout}
      guess={guess}
      guessWaiting="Turn on the camera to see what it can make out."
      primaryTaken={!sim && liveControlHasPrimary(status)}
      summary={
        stats
          ? `Brightness ${Math.round(stats.brightness * 100)} percent, sharpness ${Math.round(stats.sharpness * 100)}. Guess: ${guess?.label ?? ""}.`
          : "Camera is off."
      }
    />
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-label text-white/80">{label}</span>
        <span className="type-label tabular-nums text-white">{pct}</span>
      </div>
      <span className="block h-1.5 overflow-hidden rounded-full bg-white/20" aria-hidden>
        <span
          className="block h-full origin-left rounded-full bg-game transition-transform duration-200 ease-out"
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </span>
    </div>
  );
}

function CameraOffNotice({ starting }: { starting: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-sunken px-8 text-center">
      <div className="flex flex-col items-center gap-3">
        {starting ? (
          <LoaderCircle aria-hidden className="size-7 animate-spin text-game" />
        ) : (
          <CameraOff aria-hidden className="size-7 text-fg-subtle" />
        )}
        <p className="type-body text-fg-muted">{starting ? "Starting the camera" : "Camera is off"}</p>
      </div>
    </div>
  );
}

/** The simulated photo, drawn pixel for pixel so blur shows as soft pixels. */
function SceneCanvas({ frame }: { frame: Uint8ClampedArray<ArrayBuffer> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(frame, SCENE_WIDTH, SCENE_HEIGHT), 0, 0);
  }, [frame]);
  return (
    <canvas
      ref={canvas}
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      aria-hidden
      className="absolute inset-0 size-full object-cover [image-rendering:pixelated]"
    />
  );
}

/** What the phone actually gets: one brightness number per cell, drawn as a dot. */
function DotsCanvas({ view }: { view: CellView }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pitch = 12;
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    ctx.fillStyle = "#0b0d12";
    ctx.fillRect(0, 0, el.width, el.height);
    ctx.fillStyle = "#ffffff";
    for (let r = 0; r < view.rows; r++) {
      for (let c = 0; c < view.cols; c++) {
        const v = view.cells[r * view.cols + c];
        ctx.beginPath();
        ctx.arc(c * pitch + pitch / 2, r * pitch + pitch / 2, 0.5 + v * (pitch / 2 - 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [view]);
  return (
    <canvas
      ref={canvas}
      width={view.cols * pitch}
      height={view.rows * pitch}
      aria-hidden
      className="absolute inset-0 size-full object-cover"
    />
  );
}
