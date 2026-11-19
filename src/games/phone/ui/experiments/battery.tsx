"use client";

import { FlaskConical, Plug, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import { ACTIVITIES, CHARGING_WEEK, type BatteryActivity } from "../../data/battery";
import { batteryGuess, daySegments, drain, formatDuration, FULL, LOW_AT, roughClock, sleepWindow } from "../../engine/battery";
import { useShared } from "../../link/link";
import { useBattery } from "../../sensors/use-battery";
import { useCapabilities } from "../../sensors/use-device";
import { ExperimentLayout, type ExperimentProps } from "../experiment-layout";
import { ModeSwitch, STAGE_BOTTOM, StageScore, StageShell, useLatch, type Source, type Task } from "../parts";

const SLEEP = sleepWindow(CHARGING_WEEK);

export function BatteryExperiment({ ctx }: ExperimentProps) {
  const caps = useCapabilities();
  const [chosen, setMode] = useState<Source>(caps.battery ? "live" : "sim");
  // Safari and Firefox have no battery API: the simulation is all there is, never a reading that can't arrive.
  const mode: Source = caps.battery ? chosen : "sim";
  const battery = useBattery(mode !== "sim");
  const [simLevel, setSimLevel] = useState(FULL);
  const [simCharging, setSimCharging] = useState(false);
  const [lastActivity, setLastActivity] = useState<BatteryActivity | null>(null);
  const { markTested, mirrored } = ctx;

  // A linked phone's battery, not the laptop's. JSON has no Infinity, so "not known" travels as -1.
  const local = battery.reading;
  const shared = useShared("battery", {
    mode,
    reading: local
      ? {
          ...local,
          chargingTime: Number.isFinite(local.chargingTime) ? local.chargingTime : -1,
          dischargingTime: Number.isFinite(local.dischargingTime) ? local.dischargingTime : -1,
        }
      : null,
    simLevel,
    simCharging,
    lastActivity,
  });
  const sim = shared.mode === "sim";
  const reading =
    shared.reading && typeof shared.reading.level === "number"
      ? {
          ...shared.reading,
          chargingTime: shared.reading.chargingTime < 0 ? Infinity : shared.reading.chargingTime,
          dischargingTime: shared.reading.dischargingTime < 0 ? Infinity : shared.reading.dischargingTime,
        }
      : null;
  const live = !sim && reading != null;

  useEffect(() => {
    if (live) markTested();
  }, [live, markTested]);

  const level = sim ? shared.simLevel : (reading?.level ?? null);
  const charging = sim ? shared.simCharging : (reading?.charging ?? false);
  const guess = level != null ? batteryGuess(level, charging) : null;

  const run = (activity: BatteryActivity) => {
    setMode("sim");
    setSimLevel((l) => drain(l, activity.drain));
    setSimCharging(false);
    setLastActivity(activity);
    markTested();
  };
  const charge = () => {
    setSimLevel(FULL);
    setSimCharging(true);
    setLastActivity(null);
    markTested();
  };

  const used = useLatch(sim && shared.lastActivity != null);
  const charged = useLatch(sim && shared.simCharging);
  const read = useLatch(live);
  const tasks: Task[] = sim
    ? [
        { id: "use", label: "Spend an hour on something", done: used },
        { id: "charge", label: "Charge it back up", done: charged, action: { label: "Charge it", onClick: charge } },
      ]
    : [
        { id: "read", label: caps.touch || mirrored ? "Read this phone's battery" : "Read this laptop's battery", done: read },
        { id: "use", label: "See what an hour of gaming costs", done: used, action: { label: "Try it", onClick: () => run(ACTIVITIES[0]) } },
      ];

  const readout = sim
    ? [
        { label: "Battery", value: `${shared.simLevel}%` },
        { label: "Charging", value: shared.simCharging ? "Yes" : "No" },
        { label: "Last hour", value: shared.lastActivity ? shared.lastActivity.name : "Nothing yet" },
      ]
    : [
        { label: "Battery", value: reading ? `${reading.level}%` : "Waiting" },
        { label: "Charging", value: reading ? (reading.charging ? "Yes" : "No") : "Waiting" },
        {
          label: reading?.charging ? "Full in" : "Empty in",
          value: reading ? (formatDuration(reading.charging ? reading.chargingTime : reading.dischargingTime) ?? "Not known yet") : "Waiting",
        },
      ];

  const controls = mirrored ? null : sim ? (
    <div className="flex flex-col gap-4">
      <p className="type-body text-fg-muted">Spend an hour on each and watch the battery drop. The numbers are rough.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ACTIVITIES.map((a) => (
          <Button key={a.id} variant="secondary" size="lg" onClick={() => run(a)} className="justify-between">
            <span>{a.name}</span>
            <span className="tabular-nums text-fg-subtle">{`−${a.drain}%`}</span>
          </Button>
        ))}
        <Button variant="secondary" size="lg" icon={<Plug />} onClick={charge}>
          Charge it
        </Button>
      </div>
      {shared.lastActivity ? (
        <p className="type-body text-fg-muted" aria-live="polite">
          <span className="font-semibold text-fg">{shared.lastActivity.name}:</span> {shared.lastActivity.reason}
        </p>
      ) : null}
    </div>
  ) : battery.failed ? (
    <p className="type-body text-fg-muted">This browser didn&apos;t share the battery. Try the simulation.</p>
  ) : (
    <p className="type-body text-fg-muted">
      These are this {caps.touch ? "phone's" : "laptop's"} real battery readings. This browser lets any website read them, without asking.
    </p>
  );

  return (
    <ExperimentLayout
      ctx={ctx}
      live={live}
      source={sim ? "sim" : "live"}
      stageLabel={sim ? "A simulated battery" : "Your battery"}
      stage={<BatteryStage level={level} charging={charging} source={sim ? "sim" : "live"} />}
      modeSwitch={caps.battery && !mirrored ? <ModeSwitch value={mode} onChange={setMode} /> : null}
      controls={controls}
      tasks={tasks}
      readout={readout}
      guess={guess}
      guessWaiting="Reading the battery."
      numbers={level != null ? `${level}%   ${charging ? "charging" : "not charging"}` : null}
      extra={<ChargingWeek />}
      summary={level != null ? `Battery ${level} percent${charging ? ", charging" : ""}. Guess: ${guess?.label ?? ""}.` : "Reading the battery."}
    />
  );
}

function BatteryStage({ level, charging, source }: { level: number | null; charging: boolean; source: Source }) {
  const pct = level ?? 0;
  const low = level != null && level <= LOW_AT;
  return (
    <StageShell title="Battery" source={source} className="dot-field">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5">
        <div className="flex w-[34%] max-w-[7.5rem] flex-col items-center">
          <span aria-hidden className="h-2.5 w-[38%] rounded-t-md bg-fg/30" />
          <div className="relative aspect-[1/1.85] w-full overflow-hidden rounded-[22%] border-[3px] border-fg/30 bg-sunken p-1.5">
            <div className="relative size-full overflow-hidden rounded-[16%]">
              <span
                className={cn("absolute inset-0 origin-bottom transition-[transform,background-color] duration-500 ease-out", low ? "bg-warning" : "bg-game")}
                style={{ transform: `scaleY(${pct / 100})` }}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 text-center [&>div]:items-center">
          <StageScore value={pct} suffix="%" label="Battery" />
          {charging ? (
            <span className="type-label inline-flex items-center gap-1.5 text-game">
              <Zap aria-hidden className="size-3.5" />
              Charging
            </span>
          ) : (
            <span className={cn("type-label", low ? "text-warning" : "text-fg-subtle")}>{low ? "Low battery" : "On battery"}</span>
          )}
        </div>
      </div>
      <div className={STAGE_BOTTOM} />
    </StageShell>
  );
}

const HOURS = [
  { at: 0, label: "12 am" },
  { at: 6, label: "6 am" },
  { at: 12, label: "12 pm" },
  { at: 18, label: "6 pm" },
];

/** A made-up week of charging and the routine an app reads from it. */
function ChargingWeek() {
  return (
    <div className="flex flex-col gap-4 rounded-lg bg-surface p-5 shadow-ring">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="type-body font-semibold text-fg">A week of charging</h3>
        <Chip icon={<FlaskConical />}>Made-up example</Chip>
      </div>
      <div className="flex flex-col gap-1.5" role="img" aria-label="Charging every night from about 11 pm until morning, plus two short top-ups in the afternoon.">
        {CHARGING_WEEK.map((day, i) => (
          <div key={day.day} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3">
            <span className="type-label text-fg-subtle">{day.day}</span>
            <span className="relative h-3 overflow-hidden rounded-full bg-fg/[0.07]">
              {daySegments(CHARGING_WEEK, i).map((s) => (
                <span
                  key={`${s.from}-${s.to}`}
                  className="absolute inset-y-0 rounded-full bg-game"
                  style={{ left: `${(s.from / 1440) * 100}%`, width: `${((s.to - s.from) / 1440) * 100}%` }}
                />
              ))}
            </span>
          </div>
        ))}
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3">
          <span />
          <span className="relative h-4">
            {HOURS.map((h) => (
              <span key={h.at} className="type-label absolute top-0 text-fg-subtle" style={{ left: `${(h.at / 24) * 100}%` }}>
                {h.label}
              </span>
            ))}
          </span>
        </div>
      </div>
      {SLEEP ? (
        <p className="type-body text-fg-muted">
          <span className="font-semibold text-fg">Its guess:</span> you go to sleep around {roughClock(SLEEP.bedtime)} and get up around {roughClock(SLEEP.wake)}. It
          only had to average the overnight charges.
        </p>
      ) : null}
    </div>
  );
}
