"use client";

import { Lock, Wifi, WifiHigh, WifiLow } from "lucide-react";
import { useEffect, useState } from "react";
import { Segmented } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { TECH_DETAILS, WIFI_PLACES, type WifiNetwork, type WifiPlaceId } from "../../data/connection";
import { connectionGuess, connectionLabel, speedClass, type ConnectionInfo } from "../../engine/connection";
import type { Guess } from "../../engine/math";
import { useShared } from "../../link/link";
import { useConnection } from "../../sensors/use-connection";
import { useCapabilities } from "../../sensors/use-device";
import { ExperimentLayout, type ExperimentProps } from "../experiment-layout";
import { ModeSwitch, STAGE_BOTTOM, StageScore, StageShell, useLatch, type ReadoutRow, type Source, type Task } from "../parts";

export function ConnectionExperiment({ ctx }: ExperimentProps) {
  const caps = useCapabilities();
  const [chosen, setMode] = useState<Source>(caps.connection ? "live" : "sim");
  // Safari and Firefox have no connection API: the simulation is all there is, never a reading that can't arrive.
  const mode: Source = caps.connection ? chosen : "sim";
  const local = useConnection(mode !== "sim");
  const [placeId, setPlaceId] = useState<WifiPlaceId>("home");
  const [visited, setVisited] = useState<WifiPlaceId[]>([]);
  const { markTested, mirrored } = ctx;

  // A linked phone's connection, not the laptop's.
  const shared = useShared("connection", { mode, info: local.info, online: local.online, placeId });
  const info: ConnectionInfo | null = shared.info && typeof shared.info === "object" ? shared.info : null;
  const online = shared.online !== false;
  const sim = shared.mode === "sim";
  const live = !sim && info != null;

  useEffect(() => {
    if (live) markTested();
  }, [live, markTested]);

  const place = WIFI_PLACES.find((p) => p.id === shared.placeId) ?? WIFI_PLACES[0];

  const pick = (next: WifiPlaceId) => {
    setMode("sim");
    setPlaceId(next);
    setVisited((list) => (list.includes(next) ? list : [...list, next]));
    markTested();
  };

  const read = useLatch(live);
  const tasks: Task[] = sim
    ? [
        { id: "pick", label: "Pick where you are", done: visited.length > 0 },
        { id: "all", label: "Try all three places", done: visited.length >= WIFI_PLACES.length },
      ]
    : [
        { id: "read", label: caps.touch || mirrored ? "Read this phone's connection" : "Read this laptop's connection", done: read },
        { id: "names", label: "See what Wi-Fi names give away", done: visited.length > 0, action: { label: "Show me", onClick: () => pick("school") } },
      ];

  let guess: Guess | null;
  let readout: ReadoutRow[];
  if (sim) {
    guess = { label: place.guess, because: place.because };
    readout = [
      { label: "Networks nearby", value: String(place.networks.length) },
      { label: "Strongest", value: place.networks[0].name },
      { label: "Open networks", value: String(place.networks.filter((n) => !n.locked).length) },
    ];
  } else {
    guess = info ? connectionGuess(info, online) : null;
    readout = [
      { label: "Online", value: online ? "Yes" : "No" },
      { label: "Connected by", value: connectionLabel(info?.type) ?? "Not shared" },
      { label: "Speed class", value: speedClass(info?.effectiveType) ?? "Not shared" },
      { label: "Download speed", value: info?.downlink != null ? `About ${info.downlink} Mbps` : "Not shared" },
      { label: "Delay", value: info?.rtt != null ? `About ${info.rtt} ms` : "Not shared" },
    ];
  }

  const controls = mirrored ? null : sim ? (
    <div className="flex flex-col gap-3">
      <p className="type-body text-fg-muted">A website can&apos;t see Wi-Fi names, but apps can. Pick where you are and see what the names give away.</p>
      <Segmented label="Where you are" value={placeId} onValueChange={pick} options={WIFI_PLACES.map((p) => ({ value: p.id, label: p.label }))} />
    </div>
  ) : (
    <p className="type-body text-fg-muted">
      These are this {caps.touch ? "phone's" : "laptop's"} real connection readings. This browser lets any website read them, without asking. The browser rounds them on
      purpose.
    </p>
  );

  return (
    <ExperimentLayout
      ctx={ctx}
      live={live}
      source={sim ? "sim" : "live"}
      stageLabel={sim ? "A list of Wi-Fi networks nearby" : "Your connection"}
      stage={sim ? <WifiStage networks={place.networks} guess={place.guess} /> : <ConnectionStage info={info} online={online} />}
      modeSwitch={caps.connection && !mirrored ? <ModeSwitch value={mode} onChange={setMode} /> : null}
      controls={controls}
      tasks={tasks}
      readout={readout}
      guess={guess}
      guessWaiting="Reading your connection."
      numbers={
        sim
          ? `${place.networks.length} networks   strongest ${place.networks[0].name}`
          : info
            ? `${connectionLabel(info.type) ?? "connected"}${info.downlink != null ? `   about ${info.downlink} Mbps` : ""}${info.rtt != null ? `   ${info.rtt} ms` : ""}`
            : null
      }
      extra={<Radios />}
      summary={guess ? `Guess: ${guess.label}.` : "Reading your connection."}
    />
  );
}

function SignalIcon({ strength }: { strength: WifiNetwork["strength"] }) {
  const label = strength === 3 ? "Strong signal" : strength === 2 ? "Medium signal" : "Weak signal";
  const Icon = strength === 3 ? Wifi : strength === 2 ? WifiHigh : WifiLow;
  return <Icon aria-label={label} className="size-4 shrink-0" />;
}

function WifiStage({ networks, guess }: { networks: WifiNetwork[]; guess: string }) {
  return (
    <StageShell title="Wi-Fi" source="sim">
      <div className="flex flex-1 flex-col gap-3 px-4">
        <span className="type-label px-1 text-fg-subtle">Networks nearby</span>
        <ul className="flex flex-col overflow-hidden rounded-lg bg-fg/[0.05]">
          {networks.map((n, i) => (
            <li key={n.name} className={cn("flex items-center justify-between gap-3 px-4 py-3.5", i > 0 && "border-t border-line")}>
              <span className="type-body min-w-0 truncate text-fg">{n.name}</span>
              <span className="flex shrink-0 items-center gap-2 text-fg-muted">
                {n.locked ? <Lock aria-label="Password protected" className="size-3.5" /> : null}
                <SignalIcon strength={n.strength} />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className={cn("mx-4 flex flex-col gap-1 rounded-lg bg-game px-4 py-3.5", "mb-[calc(var(--phone-safe-bottom,0px)+14px)]")}>
        <span className="type-label text-game-ink/80">It thinks</span>
        <span className="type-title-3 text-game-ink">{guess}</span>
      </div>
    </StageShell>
  );
}

function ConnectionStage({ info, online }: { info: ConnectionInfo | null; online: boolean }) {
  return (
    <StageShell title="Connection" source="live" className="dot-field">
      <div className="flex flex-1 flex-col justify-center gap-6 px-5">
        {info?.downlink != null ? (
          <StageScore value={info.downlink} suffix=" Mbps" label="Download speed, rounded" format={{ maximumFractionDigits: 1 }} size="md" />
        ) : (
          <p className="type-title-3 text-fg">{online ? "Online" : "Offline"}</p>
        )}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5">
          <dt className="type-label text-fg-subtle">By</dt>
          <dd className="type-label text-right text-fg">{connectionLabel(info?.type) ?? "Not shared"}</dd>
          <dt className="type-label text-fg-subtle">Speed</dt>
          <dd className="type-label text-right text-fg">{speedClass(info?.effectiveType) ?? "Not shared"}</dd>
          <dt className="type-label text-fg-subtle">Delay</dt>
          <dd className="type-label text-right tabular-nums text-fg">{info?.rtt != null ? `${info.rtt} ms` : "Not shared"}</dd>
        </dl>
      </div>
      <div className={STAGE_BOTTOM} />
    </StageShell>
  );
}

/** The original exhibit's techDetails: what each radio reaches and is for. */
function Radios() {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-5 shadow-ring">
      <h3 className="type-body font-semibold text-fg">The radios in your phone</h3>
      <ul className="flex flex-col gap-3">
        {TECH_DETAILS.map((r) => (
          <li key={r.id} className="grid gap-1 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
            <span className="type-body font-semibold text-fg">{r.name}</span>
            <span className="type-small text-fg-muted">
              {r.range}. {r.usedFor}. <span className="type-label text-fg-subtle">{r.band}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
