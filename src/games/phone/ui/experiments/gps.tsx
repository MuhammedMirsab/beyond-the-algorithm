"use client";

import { LocateFixed, LoaderCircle, Pause, Play } from "lucide-react";
import { useEffect, useReducer, useState } from "react";
import { Button } from "@/components/ui/button";
import { SliderRow } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { DAY_END, DAY_START, DAY_STEP, MAP_SIZE, ROADS, type PlaceId } from "../../data/places";
import { formatDistance, gpsGuess, guessesUntil, positionAt, SCALES, scaleFromAccuracy, sourceGuess, trailUntil } from "../../engine/gps";
import { clockLabel, type Guess } from "../../engine/math";
import { issueCopy } from "../../sensors/status";
import { useCapabilities } from "../../sensors/use-device";
import { useGeolocation, type LocationFix } from "../../sensors/use-geolocation";
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
  type ReadoutRow,
  type Source,
} from "../parts";

interface DayState {
  minute: number;
  /** The latest time the app has seen: its guesses come from everything up to here. */
  seen: number;
}

type DayAction = { type: "set"; minute: number } | { type: "step" } | { type: "restart" };

function dayReducer(state: DayState, action: DayAction): DayState {
  switch (action.type) {
    case "set":
      return { minute: action.minute, seen: Math.max(state.seen, action.minute) };
    case "step": {
      const minute = Math.min(DAY_END, state.minute + DAY_STEP);
      return { minute, seen: Math.max(state.seen, minute) };
    }
    case "restart":
      return { minute: DAY_START, seen: state.seen };
  }
}

const PLAY_STEP_MS = 110;

const WHERE: Record<PlaceId, string> = { home: "A house", school: "School", sports: "Sports ground" };

export function GpsExperiment({ ctx }: ExperimentProps) {
  const caps = useCapabilities();
  const geo = useGeolocation();
  const [mode, setMode] = useState<Source>(caps.location ? "live" : "sim");
  const [day, dispatch] = useReducer(dayReducer, { minute: DAY_START, seen: DAY_START });
  const [playing, setPlaying] = useState(false);
  const { markTested } = ctx;

  const sim = mode === "sim";
  const live = !sim && geo.status === "live" && geo.fix != null;
  const running = sim && playing && day.minute < DAY_END;

  useEffect(() => {
    if (live) markTested();
  }, [live, markTested]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => dispatch({ type: "step" }), PLAY_STEP_MS);
    return () => window.clearInterval(id);
  }, [running]);

  const switchMode = (next: Source) => {
    if (next === mode) return;
    if (next === "sim") geo.stop();
    setPlaying(false);
    setMode(next);
  };

  const position = positionAt(day.minute);
  const guesses = guessesUntil(day.seen);
  const latest = guesses[guesses.length - 1];
  const points = trailUntil(day.minute);

  let guess: Guess | null = null;
  let readout: ReadoutRow[];
  let summary: string;
  if (sim) {
    guess = latest ? { label: latest.title, because: latest.because } : null;
    readout = [
      { label: "Time", value: clockLabel(day.minute) },
      { label: "Phone is at", value: position.place ? WHERE[position.place] : "On the road" },
      { label: "Location points", value: String(points.length) },
      { label: "Places worked out", value: `${guesses.length} of 3` },
    ];
    summary = `${clockLabel(day.minute)}. ${guess ? `Guess: ${guess.label}.` : ""}`;
  } else {
    const fix: LocationFix | null = geo.fix;
    guess = fix ? gpsGuess(fix.accuracy) : null;
    readout = [
      { label: "Accurate to", value: fix ? formatDistance(fix.accuracy) : "Waiting" },
      { label: "Probably from", value: fix ? sourceGuess(fix.accuracy) : "Waiting" },
      { label: "Speed", value: fix?.speed != null ? `${Math.round(fix.speed * 3.6)} km/h` : "Not known" },
      { label: "Fixes so far", value: String(geo.fixes) },
      { label: "Coordinates", value: "Never shown or kept" },
    ];
    summary = fix ? `Accurate to ${formatDistance(fix.accuracy)}. Guess: ${guess?.label ?? ""}.` : "Waiting for a location fix.";
  }

  const island = useIslandNotice(live, <IslandLabel tone="location">Location on</IslandLabel>);

  const playLabel = running ? "Pause" : day.minute >= DAY_END ? "Play the day again" : "Play the day";
  const tryIt = (
    <div className="flex flex-col gap-5">
      {caps.location ? <ModeSwitch value={mode} onChange={switchMode} /> : null}
      {sim ? (
        <div className="flex flex-col gap-4">
          <p className="type-body text-fg-muted">
            One made-up school day. Move through it and watch the app name places from where the phone spends its time.
          </p>
          <SliderRow
            label="Time of day"
            value={day.minute}
            min={DAY_START}
            max={DAY_END}
            step={DAY_STEP}
            valueText={clockLabel(day.minute)}
            onValueChange={(minute) => {
              setPlaying(false);
              dispatch({ type: "set", minute });
              if (minute > DAY_START) markTested();
            }}
          />
          <div>
            <Button
              variant="secondary"
              size="lg"
              icon={running ? <Pause /> : <Play />}
              onClick={() => {
                if (running) {
                  setPlaying(false);
                  return;
                }
                if (day.minute >= DAY_END) dispatch({ type: "restart" });
                setPlaying(true);
                markTested();
              }}
            >
              {playLabel}
            </Button>
          </div>
        </div>
      ) : (
        <LiveControl
          status={geo.status}
          startLabel="Find my location"
          startIcon={<LocateFixed />}
          stopLabel="Stop location"
          onStart={geo.start}
          onStop={geo.stop}
          issue={issueCopy("location", geo.status)}
          onSimulate={() => switchMode("sim")}
          privacy="Your coordinates are never shown, kept or sent. Only how close it can get."
          liveHint="Step near a window or outside and watch the circle shrink. Then try the simulated day."
        />
      )}
    </div>
  );

  return (
    <ExperimentLayout
      ctx={ctx}
      live={live}
      source={sim ? "sim" : "live"}
      stageLabel={sim ? "A map of a made-up town during one day" : "How closely your phone can find you"}
      island={island}
      stage={
        sim ? (
          <DayStage minute={day.minute} seen={day.seen} />
        ) : (
          <AccuracyStage fix={geo.fix} searching={geo.status === "starting"} />
        )
      }
      tryIt={tryIt}
      readout={readout}
      guess={guess}
      guessWaiting={sim ? "Move the time of day to start." : "Find your location to see what it can tell."}
      primaryTaken={!sim && liveControlHasPrimary(geo.status)}
      summary={summary}
    />
  );
}

function AccuracyStage({ fix, searching }: { fix: LocationFix | null; searching: boolean }) {
  const scale = fix ? scaleFromAccuracy(fix.accuracy) : null;
  const km = fix ? fix.accuracy >= 1000 : false;
  return (
    <StageShell title="Location" source="live" className="dot-field">
      <div className="flex flex-1 flex-col justify-center gap-8 px-5">
        {fix ? (
          <StageScore
            value={km ? Math.round(fix.accuracy / 100) / 10 : Math.round(fix.accuracy)}
            suffix={km ? " km" : " m"}
            label="Accurate to"
          />
        ) : (
          <div className="flex flex-col gap-3">
            {searching ? <LoaderCircle aria-hidden className="size-6 animate-spin text-game" /> : null}
            <p className="type-title-3 text-fg">{searching ? "Looking for satellites and Wi-Fi" : "Location is off"}</p>
          </div>
        )}
        <ol className="flex flex-col gap-1.5">
          {SCALES.map((step) => {
            const here = step.id === scale;
            return (
              <li
                key={step.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md px-3 py-2.5",
                  here ? "bg-game text-game-ink" : "bg-fg/[0.04] text-fg-subtle",
                )}
              >
                <span className="type-body font-semibold">{step.label}</span>
                <span className={cn("type-label", here ? "text-game-ink" : "text-fg-subtle")}>
                  {here ? "It can tell" : Number.isFinite(step.within) ? `Within ${formatDistance(step.within)}` : ""}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className={cn("type-label px-5 text-fg-subtle", STAGE_BOTTOM)}>Coordinates hidden</p>
    </StageShell>
  );
}

/** A tiny, repeatable wobble so location points scatter like real fixes do. */
function wobble(i: number, axis: 0 | 1) {
  const n = Math.sin(i * 12.9898 + axis * 78.233) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * 3.2;
}

const LABELS: Record<PlaceId, { x: number; y: number }> = {
  home: { x: 22, y: 99 },
  school: { x: 73, y: 9 },
  sports: { x: 76, y: 79 },
};

function DayStage({ minute, seen }: { minute: number; seen: number }) {
  const position = positionAt(minute);
  const points = trailUntil(minute);
  const guessed = new Set(guessesUntil(seen).map((g) => g.place));
  const titles = Object.fromEntries(guessesUntil(seen).map((g) => [g.place, g.title])) as Partial<Record<PlaceId, string>>;
  const [time, suffix] = clockLabel(minute).split(" ");
  return (
    <StageShell title="Location" source="sim">
      <div className="flex items-baseline gap-2 px-5 [&_.type-score]:text-[clamp(2.5rem,15cqw,3.75rem)]">
        <span className="type-score tabular-nums text-fg">{time}</span>
        <span className="type-label text-fg-subtle">{suffix}</span>
      </div>
      <div className="min-h-0 flex-1 px-2 py-2">
        <svg
          viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden
          className="size-full"
        >
          {[
            [6, 48, 36, 26],
            [58, 48, 36, 26],
            [6, 84, 36, 28],
            [6, 4, 36, 30],
            [92, 84, 6, 30],
          ].map(([x, y, w, h]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx={2.5} className="fill-fg/[0.05]" />
          ))}
          {ROADS.map((road, i) => (
            <polyline
              key={i}
              points={road.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              strokeWidth={4.5}
              strokeLinecap="round"
              className="stroke-fg/[0.12]"
            />
          ))}
          <rect x={63} y={18} width={20} height={15} rx={2} className="fill-fg/[0.16]" />
          <rect x={65} y={83} width={22} height={18} rx={3} className="fill-fg/[0.1] stroke-fg/[0.22]" strokeWidth={0.6} />
          <line x1={76} y1={83} x2={76} y2={101} strokeWidth={0.6} className="stroke-fg/[0.22]" />
          <path d="M16 115 V107 L22 102 L28 107 V115 Z" className="fill-fg/[0.2]" />
          <MapName x={73} y={15.5} text="School" />
          <MapName x={76} y={108} text="Sports ground" />

          {points.map((p, i) => (
            <circle key={i} cx={p.x + wobble(i, 0)} cy={p.y + wobble(i, 1)} r={1.1} className="fill-game" opacity={0.4} />
          ))}

          {(Object.keys(LABELS) as PlaceId[]).map((id) =>
            guessed.has(id) ? <GuessTag key={id} x={LABELS[id].x} y={LABELS[id].y} text={titles[id] ?? ""} /> : null,
          )}

          <circle cx={position.point.x} cy={position.point.y} r={3.4} strokeWidth={1.4} className="fill-game stroke-sunken" />
        </svg>
      </div>
      <p className={cn("type-label px-5 text-fg-subtle", STAGE_BOTTOM)}>One dot every 5 minutes</p>
    </StageShell>
  );
}

function MapName({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      className="fill-fg-subtle"
      style={{ fontFamily: "var(--font-mono)", fontSize: 3.6, letterSpacing: "0.06em", textTransform: "uppercase" }}
    >
      {text}
    </text>
  );
}

function GuessTag({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      strokeWidth={2.4}
      strokeLinejoin="round"
      className="fill-game stroke-sunken"
      style={{ fontFamily: "var(--font-sans)", fontSize: 5, fontWeight: 700, paintOrder: "stroke" }}
    >
      {text}
    </text>
  );
}
