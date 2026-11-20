"use client";

import { Download, Globe2, Laptop, LayoutGrid, RefreshCw, Smartphone, Tablet, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { GameGlyph } from "@/components/art/game-glyph";
import { Button } from "@/components/ui/button";
import { Chip, ToggleChip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/dialog";
import { GAMES, type GameSlug } from "@/content/games";
import { ARCADE, engagedMs, playStage, type PlayEvent, type PlaySession, type PlayStage } from "@/content/plays";
import { cn } from "@/lib/cn";
import { duration } from "./visits-panel";

/* ── Helpers ──────────────────────────────────────────────────────── */

const TZ = "Asia/Riyadh";
const gameInfo = new Map(GAMES.map((g) => [g.slug as string, g]));
const isKnownGame = (slug: string): slug is GameSlug => gameInfo.has(slug);
const gameName = (slug: string) => (slug === ARCADE ? "Arcade page" : (gameInfo.get(slug)?.short ?? slug.replace(/-/g, " ")));

const fullDate = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const timeOnly = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const hourOf = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" });

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const words = (name: string) => {
  const s = name.replace(/[-_]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
};

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function countBy<T>(list: T[], key: (item: T) => string) {
  const map = new Map<string, number>();
  for (const item of list) {
    const k = key(item);
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
}

/** Someone actually there: touched it, pressed a key or started a game. */
const isPlayer = (s: PlaySession) => s.firstInputMs !== null || s.starts > 0;

const STAGES: Record<PlayStage, { label: string; tone: "success" | "danger" | "warning" | "neutral" | "game"; bar: string }> = {
  finished: { label: "Finished a game", tone: "success", bar: "bg-success" },
  playing: { label: "Playing now", tone: "game", bar: "bg-fg" },
  here: { label: "On the page now", tone: "game", bar: "bg-fg/60" },
  "left-mid-game": { label: "Left mid-game", tone: "warning", bar: "bg-warning" },
  "left-before-start": { label: "Tapped, never started", tone: "danger", bar: "bg-danger" },
  "looked-only": { label: "Only looked", tone: "neutral", bar: "bg-fg/25" },
};

function DeviceIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = kind === "phone" ? Smartphone : kind === "tablet" ? Tablet : Laptop;
  return <Icon aria-hidden className={className} />;
}

function place(s: PlaySession) {
  return [s.net.city, s.net.country].filter(Boolean).join(", ");
}

/** "Started (camera)", "Round: win"... one line per event in a session's timeline. */
function eventLine(e: PlayEvent): string {
  const v = e.v === undefined ? "" : String(e.v);
  switch (e.k) {
    case "open":
      return e.x === "next" ? "New player (the last one pressed Next player or it reset)" : "Opened the page";
    case "start":
      return `Started${e.x ? ` · ${e.x}` : ""}${v ? ` · ${v}` : ""}`;
    case "step":
      return `${words(e.x ?? "step")}${v ? `: ${v}` : ""}`;
    case "end":
      return `Finished${e.x ? ` · ${e.x}` : ""}${v ? ` · score ${v}` : ""}`;
    case "camera":
      return e.x === "ok" ? "Allowed the camera" : `Camera didn't start (${e.x ?? "error"})`;
    case "hide":
      return "Switched away or locked the screen";
    case "show":
      return `Came back${v ? ` after ${duration(Number(v) * 1000)}` : ""}`;
    case "next":
      return e.x === "idle" ? "Reset itself after nobody touched it" : "Next player pressed";
    case "leave":
      if (e.x === "closed") return "Closed or reloaded the page";
      if (e.x === "page") return "Left the page";
      if (e.x === ARCADE) return "Went back to the arcade";
      return e.x && (isKnownGame(e.x) || e.x === ARCADE) ? `Went to ${gameName(e.x)}` : "Left";
    case "error":
      return `Page error: ${e.x ?? ""}`;
    default:
      return `${e.k} ${e.x ?? ""} ${v}`;
  }
}

const eventTone: Partial<Record<PlayEvent["k"], string>> = {
  start: "bg-game",
  end: "bg-success",
  error: "bg-danger",
  next: "bg-fg",
  leave: "bg-fg",
  camera: "bg-warning",
};

/* ── Dashboard ────────────────────────────────────────────────────── */

export function PlaysDashboard({ sessions: all, docs, fetchedAt }: { sessions: PlaySession[]; docs: number; fetchedAt: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [day, setDay] = useState<string>("all");
  const [kind, setKind] = useState<"all" | "desktop" | "phone">("all");
  const [game, setGame] = useState<string | null>(null);
  const [deviceFilter, setDeviceFilter] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<PlayStage | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [shownCount, setShownCount] = useState(40);

  const days = useMemo(() => [...new Set(all.map((s) => dayKey.format(new Date(s.openedAt))))].sort(), [all]);

  // Devices are numbered by when they were first seen: "Laptop 1", "Phone 4".
  const deviceNames = useMemo(() => {
    const first = new Map<string, PlaySession>();
    for (const s of [...all].sort((a, b) => a.openedAt.localeCompare(b.openedAt))) if (!first.has(s.deviceId)) first.set(s.deviceId, s);
    const counters: Record<string, number> = {};
    const names = new Map<string, string>();
    for (const [id, s] of first) {
      const word = s.device.kind === "phone" ? "Phone" : s.device.kind === "tablet" ? "Tablet" : "Laptop";
      counters[word] = (counters[word] ?? 0) + 1;
      names.set(id, `${word} ${counters[word]}`);
    }
    return names;
  }, [all]);
  const deviceName = (id: string) => deviceNames.get(id) ?? "Device";

  // Day and device type narrow everything below.
  const scoped = useMemo(
    () =>
      all.filter(
        (s) =>
          (day === "all" || dayKey.format(new Date(s.openedAt)) === day) &&
          (kind === "all" || (kind === "phone" ? s.device.kind !== "desktop" : s.device.kind === "desktop")),
      ),
    [all, day, kind],
  );

  const games = useMemo(() => scoped.filter((s) => s.page !== ARCADE), [scoped]);
  const hub = useMemo(() => scoped.filter((s) => s.page === ARCADE), [scoped]);

  const stats = useMemo(() => {
    const players = games.filter(isPlayer);
    const started = games.filter((s) => s.starts > 0);
    const finished = games.filter((s) => s.ends > 0);
    const devices = new Map<string, PlaySession[]>();
    for (const s of scoped) devices.set(s.deviceId, [...(devices.get(s.deviceId) ?? []), s]);
    const phones = [...devices.values()].filter((l) => l[0].device.kind !== "desktop").length;
    const totalMs = players.reduce((n, s) => n + engagedMs(s), 0);
    return {
      opened: games.length,
      players: players.length,
      started: started.length,
      finished: finished.length,
      rounds: games.reduce((n, s) => n + s.ends, 0),
      medianMs: median(players.map(engagedMs)),
      totalMs,
      devices: devices.size,
      phones,
      laptops: devices.size - phones,
      cameraFails: games.filter((s) => s.camera && s.camera !== "ok").length,
      errors: games.reduce((n, s) => n + s.errors, 0),
    };
  }, [games, scoped]);

  const byGame = useMemo(
    () =>
      GAMES.map((g) => {
        const list = games.filter((s) => s.page === g.slug);
        const players = list.filter(isPlayer);
        const finished = list.filter((s) => s.ends > 0);
        const scored = finished.filter((s) => s.lastScore !== null);
        const outOf = median(scored.map((s) => s.outOf).filter((x): x is number => x !== null));
        return {
          slug: g.slug,
          opened: list.length,
          players: players.length,
          started: list.filter((s) => s.starts > 0).length,
          finished: finished.length,
          rounds: list.reduce((n, s) => n + s.ends, 0),
          wins: list.reduce((n, s) => n + s.wins, 0),
          medianMs: median(players.map(engagedMs)),
          avgScore: scored.length ? scored.reduce((n, s) => n + (s.lastScore ?? 0), 0) / scored.length : null,
          best: scored.length ? Math.max(...scored.map((s) => s.best ?? s.lastScore ?? 0)) : null,
          outOf,
        };
      }).sort((a, b) => b.players - a.players || b.opened - a.opened),
    [games],
  );

  const stages = useMemo(() => {
    const list = games.map((s) => playStage(s, fetchedAt));
    return (Object.keys(STAGES) as PlayStage[]).map((st) => ({ st, n: list.filter((x) => x === st).length }));
  }, [games, fetchedAt]);

  const devices = useMemo(() => {
    const map = new Map<string, PlaySession[]>();
    for (const s of scoped) map.set(s.deviceId, [...(map.get(s.deviceId) ?? []), s]);
    return [...map.entries()]
      .map(([id, list]) => {
        const latest = list[0];
        const played = list.filter((s) => s.page !== ARCADE);
        return {
          id,
          latest,
          sessions: played.length,
          players: played.filter(isPlayer).length,
          finished: played.filter((s) => s.ends > 0).length,
          ms: played.filter(isPlayer).reduce((n, s) => n + engagedMs(s), 0),
          games: countBy(played, (s) => s.page),
          ips: [...new Set(list.map((s) => s.net.ip).filter(Boolean))],
          firstAt: list[list.length - 1].openedAt,
          lastAt: latest.lastAt,
        };
      })
      .sort((a, b) => b.sessions - a.sessions || b.lastAt.localeCompare(a.lastAt));
  }, [scoped]);

  const listed = useMemo(
    () =>
      games.filter(
        (s) =>
          (!game || s.page === game) &&
          (!deviceFilter || s.deviceId === deviceFilter) &&
          (!stageFilter || playStage(s, fetchedAt) === stageFilter),
      ),
    [games, game, deviceFilter, stageFilter, fetchedAt],
  );

  const open = openId ? (all.find((s) => s.id === openId) ?? null) : null;
  const filtered = game !== null || deviceFilter !== null || stageFilter !== null;

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-14 px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-10 lg:px-8">
      {/* Title */}
      <section className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div className="flex flex-col gap-3">
          <span className="type-label enter text-fg-subtle">
            Game analytics · {docs} Firestore {docs === 1 ? "read" : "reads"} for {all.length} sessions
          </span>
          <h1 className="type-display-2 enter text-fg [--enter-delay:60ms]">How people played</h1>
          <p className="type-body-lg enter max-w-[38rem] text-fg-muted [--enter-delay:120ms]">
            One session per player: it starts when a game opens or someone presses Next player, and ends when the next player takes over or they leave.
          </p>
        </div>
        <div className="enter flex flex-wrap gap-2 [--enter-delay:180ms]">
          <Button variant="secondary" icon={<RefreshCw className={cn(refreshing && "animate-spin")} />} onClick={() => startRefresh(() => router.refresh())}>
            Refresh
          </Button>
          <Button variant="secondary" icon={<Download />} onClick={() => downloadCsv(scoped, deviceName)} disabled={scoped.length === 0}>
            Download CSV
          </Button>
        </div>
      </section>

      {/* Scope */}
      <section aria-label="Show" className="-mt-6 flex flex-wrap items-center gap-2">
        <ToggleChip pressed={day === "all"} onClick={() => setDay("all")}>
          All days
        </ToggleChip>
        {days.map((d) => (
          <ToggleChip key={d} pressed={day === d} onClick={() => setDay(d)}>
            {dayLabel.format(new Date(`${d}T12:00:00+03:00`))}
          </ToggleChip>
        ))}
        <span aria-hidden className="mx-1 h-6 w-px bg-line-strong" />
        <ToggleChip pressed={kind === "all"} onClick={() => setKind("all")}>
          Every device
        </ToggleChip>
        <ToggleChip pressed={kind === "desktop"} onClick={() => setKind("desktop")} icon={<Laptop />}>
          Laptops
        </ToggleChip>
        <ToggleChip pressed={kind === "phone"} onClick={() => setKind("phone")} icon={<Smartphone />}>
          Phones and tablets
        </ToggleChip>
      </section>

      {all.length === 0 ? (
        <section className="flex flex-col items-start gap-3 rounded-xl bg-surface p-8 shadow-ring">
          <h2 className="type-title-2 text-fg">No game sessions yet</h2>
          <p className="type-body text-fg-muted">Sessions show up here a few seconds after someone opens a game.</p>
        </section>
      ) : (
        <>
          {/* Headline numbers */}
          <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <BigStat value={String(stats.players)} label="Players" note={`${stats.opened} game sessions opened, ${stats.opened - stats.players} only looked`} />
            <BigStat
              value={`${pct(stats.finished, stats.started)}%`}
              label="Finished what they started"
              note={`${stats.started} started, ${stats.finished} saw a result · ${stats.rounds} rounds in all`}
              accent="text-success"
            />
            <BigStat value={duration(stats.medianMs)} label="Time per player" note={`Middle value · ${duration(stats.totalMs)} played in all`} />
            <BigStat value={String(stats.devices)} label="Devices" note={`${stats.laptops} laptops, ${stats.phones} phones or tablets`} />
          </section>

          {/* Funnel per game */}
          <section className="flex flex-col gap-5">
            <SectionHead title="Each game, opened to finished" line="Click a game to see what its players did inside it, and only its sessions below." />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {byGame.map((g) => (
                <GameCard key={g.slug} g={g} active={game === g.slug} onClick={() => setGame((c) => (c === g.slug ? null : g.slug))} />
              ))}
            </div>
          </section>

          {game ? <GameDetail slug={game} sessions={games.filter((s) => s.page === game)} now={fetchedAt} onClose={() => setGame(null)} /> : null}

          {/* When + how it ended */}
          <section className="grid gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Panel title="When people played" label="Jeddah time">
              <Activity sessions={games} />
            </Panel>
            <Panel title="How sessions ended" label={`${games.length} sessions`}>
              <ul className="flex flex-col gap-1">
                {stages.map(({ st, n }) => (
                  <li key={st}>
                    <button
                      type="button"
                      aria-pressed={stageFilter === st}
                      onClick={() => setStageFilter((c) => (c === st ? null : st))}
                      className={cn(
                        "grid w-full grid-cols-[minmax(0,1fr)_3rem] items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150",
                        "hover:bg-fg/[0.05] focus-visible:outline-2 focus-visible:outline-fg",
                        stageFilter === st && "bg-fg/[0.07]",
                        n === 0 && "opacity-50",
                      )}
                    >
                      <span className="flex min-w-0 flex-col gap-1.5">
                        <span className="type-small truncate font-semibold text-fg-muted">{STAGES[st].label}</span>
                        <Bar value={games.length ? n / games.length : 0} className={STAGES[st].bar} />
                      </span>
                      <span className="type-body text-right font-semibold tabular-nums text-fg">{n}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {stats.cameraFails || stats.errors ? (
                <p className="type-small border-t border-line pt-3 text-fg-subtle">
                  {stats.cameraFails ? `${stats.cameraFails} sessions where the camera didn't start. ` : ""}
                  {stats.errors ? `${stats.errors} page errors (open a session to read them).` : ""}
                </p>
              ) : null}
            </Panel>
          </section>

          {/* Devices */}
          <section className="flex flex-col gap-5">
            <SectionHead
              title="Devices"
              line="A device is a browser on a laptop or phone: one booth laptop serves many players, so players are counted by session, not by device. Click one to see only its sessions."
            />
            <ul className="grid gap-3 md:grid-cols-2">
              {devices.slice(0, 24).map((d) => (
                <li key={d.id}>
                  <DeviceCard d={d} name={deviceName(d.id)} active={deviceFilter === d.id} onClick={() => setDeviceFilter((c) => (c === d.id ? null : d.id))} now={fetchedAt} />
                </li>
              ))}
            </ul>
            {devices.length > 24 ? <p className="type-small text-fg-subtle">{devices.length - 24} more devices are in the CSV.</p> : null}
          </section>

          {/* Arcade page */}
          {hub.length ? <ArcadePanel hub={hub} /> : null}

          {/* Every session */}
          <section className="flex flex-col gap-5" aria-labelledby="all-sessions">
            <SectionHead
              id="all-sessions"
              title="Every session"
              line={filtered ? `${listed.length} of ${games.length} match the filters.` : `${games.length} game sessions, newest first. Click one for its full timeline.`}
            />
            {filtered ? (
              <div className="flex flex-wrap items-center gap-2">
                {game ? (
                  <ToggleChip pressed onClick={() => setGame(null)} icon={<X />}>
                    {gameName(game)}
                  </ToggleChip>
                ) : null}
                {deviceFilter ? (
                  <ToggleChip pressed onClick={() => setDeviceFilter(null)} icon={<X />}>
                    {deviceName(deviceFilter)}
                  </ToggleChip>
                ) : null}
                {stageFilter ? (
                  <ToggleChip pressed onClick={() => setStageFilter(null)} icon={<X />}>
                    {STAGES[stageFilter].label}
                  </ToggleChip>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setGame(null);
                    setDeviceFilter(null);
                    setStageFilter(null);
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : null}
            {listed.length === 0 ? (
              <p className="type-body rounded-lg bg-surface p-6 text-fg-muted shadow-ring">Nothing matches. Try fewer filters.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-2">
                  {listed.slice(0, shownCount).map((s) => (
                    <li key={s.id}>
                      <SessionRow s={s} deviceName={deviceName(s.deviceId)} now={fetchedAt} onOpen={() => setOpenId(s.id)} />
                    </li>
                  ))}
                </ul>
                {listed.length > shownCount ? (
                  <Button variant="secondary" className="self-start" onClick={() => setShownCount((n) => n + 60)}>
                    Show more ({listed.length - shownCount} left)
                  </Button>
                ) : null}
              </>
            )}
          </section>
        </>
      )}

      <SessionModal session={open} deviceName={open ? deviceName(open.deviceId) : ""} now={fetchedAt} onClose={() => setOpenId(null)} />
    </main>
  );
}

/* ── Sections ─────────────────────────────────────────────────────── */

interface GameRow {
  slug: GameSlug;
  opened: number;
  players: number;
  started: number;
  finished: number;
  rounds: number;
  wins: number;
  medianMs: number | null;
  avgScore: number | null;
  best: number | null;
  outOf: number | null;
}

function GameCard({ g, active, onClick }: { g: GameRow; active: boolean; onClick: () => void }) {
  const steps = [
    { label: "Opened", n: g.opened },
    { label: "Played", n: g.players },
    { label: "Started", n: g.started },
    { label: "Finished", n: g.finished },
  ];
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return (
    <button
      type="button"
      data-game={g.slug}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex flex-col gap-5 rounded-lg bg-surface p-5 text-left shadow-ring transition-[background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.98]",
        "hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        active && "bg-game-soft shadow-[inset_0_0_0_2px_var(--color-game)] hover:bg-game-soft",
        g.opened === 0 && "opacity-60",
      )}
    >
      <span className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-game-soft text-game">
          <GameGlyph slug={g.slug} className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="type-title-3 truncate text-fg">{gameName(g.slug)}</span>
          <span className="type-caption text-fg-subtle">{g.medianMs !== null ? `${duration(g.medianMs)} per player` : "No players yet"}</span>
        </span>
        <span className="flex flex-col items-end">
          <span className="text-[1.75rem] font-bold leading-none tabular-nums text-game">{g.players}</span>
          <span className="type-caption text-fg-subtle">players</span>
        </span>
      </span>

      {/* Funnel: each bar is a share of the sessions that opened the game. */}
      <span className="flex flex-col gap-2">
        {steps.map((st, i) => (
          <span key={st.label} className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] items-center gap-2">
            <span className="type-caption text-fg-subtle">{st.label}</span>
            <Bar value={g.opened ? st.n / g.opened : 0} className={i === 3 ? "bg-game" : i === 0 ? "bg-fg/25" : "bg-game/55"} />
            <span className="type-caption text-right tabular-nums text-fg-muted">
              <span className="font-semibold text-fg">{st.n}</span>
              {i > 0 && g.opened ? ` · ${pct(st.n, g.opened)}%` : ""}
            </span>
          </span>
        ))}
      </span>

      <span className="type-caption flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-fg-subtle">
        <span>
          <span className="font-semibold tabular-nums text-fg-muted">{g.rounds}</span> rounds
        </span>
        {g.rounds ? (
          <span>
            <span className="font-semibold tabular-nums text-fg-muted">{pct(g.wins, g.rounds)}%</span> won
          </span>
        ) : null}
        {g.avgScore !== null ? (
          <span>
            score <span className="font-semibold tabular-nums text-fg-muted">{fmt(g.avgScore)}</span>
            {g.outOf !== null ? ` of ${fmt(g.outOf)}` : ""} on average, best {fmt(g.best ?? 0)}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** What players did inside one game: their steps, how they played and where they stopped. */
function GameDetail({ slug, sessions, now, onClose }: { slug: string; sessions: PlaySession[]; now: string; onClose: () => void }) {
  const d = useMemo(() => {
    const steps = new Map<string, { n: number; sessions: Set<string>; values: Map<string, number> }>();
    for (const s of sessions) {
      for (const e of s.events) {
        if (e.k !== "step" || !e.x) continue;
        const row = steps.get(e.x) ?? { n: 0, sessions: new Set<string>(), values: new Map<string, number>() };
        row.n++;
        row.sessions.add(s.id);
        if (e.v !== undefined) row.values.set(String(e.v), (row.values.get(String(e.v)) ?? 0) + 1);
        steps.set(e.x, row);
      }
    }
    const left = sessions.filter((s) => playStage(s, now) === "left-mid-game");
    return {
      steps: [...steps.entries()]
        .map(([name, r]) => ({ name, n: r.n, sessions: r.sessions.size, values: [...r.values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4) }))
        .sort((a, b) => b.sessions - a.sessions || b.n - a.n),
      modes: countBy(
        sessions.flatMap((s) => s.events.filter((e) => e.k === "start")),
        (e) => e.x ?? "",
      ),
      endings: countBy(
        sessions.flatMap((s) => s.events.filter((e) => e.k === "end")),
        (e) => e.x ?? "",
      ).slice(0, 8),
      lastSteps: countBy(left, (s) => s.lastStep || "before any step").slice(0, 8),
      left: left.length,
    };
  }, [sessions, now]);

  const maxSessions = Math.max(1, ...d.steps.map((s) => s.sessions));

  return (
    <section data-game={isKnownGame(slug) ? slug : undefined} className="-mt-6 flex flex-col gap-5 rounded-xl bg-surface p-5 shadow-[inset_0_0_0_2px_var(--color-game)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="type-label text-game">Inside the game</span>
          <h2 className="type-title-1 text-fg">What {gameName(slug)} players did</h2>
        </div>
        <Button variant="ghost" size="sm" icon={<X />} onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex flex-col gap-3">
          <span className="type-label text-fg-subtle">Steps · share of sessions that reached each</span>
          {d.steps.length === 0 ? (
            <p className="type-small text-fg-subtle">No in-game steps recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {d.steps.slice(0, 18).map((st) => (
                <li key={st.name} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="type-small font-semibold text-fg">{words(st.name)}</span>
                    <span className="type-caption shrink-0 tabular-nums text-fg-subtle">
                      {st.sessions} sessions · {st.n} times
                    </span>
                  </span>
                  <Bar value={st.sessions / maxSessions} className="bg-game" />
                  {st.values.length ? (
                    <span className="type-caption flex flex-wrap gap-x-3 text-fg-subtle">
                      {st.values.map(([v, n]) => (
                        <span key={v}>
                          {v} <span className="tabular-nums text-fg-muted">×{n}</span>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <MiniList title="How they played" rows={d.modes.map((m) => ({ label: words(m.k), n: m.n }))} empty="No starts yet" />
          <MiniList title="Results they saw" rows={d.endings.map((m) => ({ label: m.k, n: m.n }))} empty="No results yet" />
          <MiniList
            title={`Last step of the ${d.left} who left mid-game`}
            rows={d.lastSteps.map((m) => ({ label: words(m.k), n: m.n }))}
            empty="Nobody left mid-game"
          />
        </div>
      </div>
    </section>
  );
}

function MiniList({ title, rows, empty }: { title: string; rows: { label: string; n: number }[]; empty: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="type-label text-fg-subtle">{title}</span>
      {rows.length === 0 ? (
        <span className="type-small text-fg-faint">{empty}</span>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {rows.map((r) => (
            <li key={r.label} className="inline-flex h-8 items-center gap-2 rounded-full bg-sunken pl-3 pr-1.5 shadow-ring">
              <span className="type-small font-semibold text-fg">{r.label}</span>
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-game-soft px-1.5 text-[0.75rem] font-bold tabular-nums text-game">{r.n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Sessions per hour (or per day once the spread is long), finished ones in colour. */
function Activity({ sessions }: { sessions: PlaySession[] }) {
  if (!sessions.length) return <p className="type-small text-fg-subtle">No sessions in this view.</p>;
  const days = [...new Set(sessions.map((s) => dayKey.format(new Date(s.openedAt))))].sort();
  const perHour = days.length <= 3;
  const buckets = perHour
    ? days.flatMap((d) => {
        const list = sessions.filter((s) => dayKey.format(new Date(s.openedAt)) === d);
        const hours = list.map((s) => Number(hourOf.format(new Date(s.openedAt))));
        const lo = Math.min(...hours);
        const hi = Math.max(...hours);
        return Array.from({ length: hi - lo + 1 }, (_, i) => {
          const h = lo + i;
          const inHour = list.filter((s) => Number(hourOf.format(new Date(s.openedAt))) === h);
          return { key: `${d}-${h}`, day: d, label: `${String(h).padStart(2, "0")}:00`, n: inHour.length, done: inHour.filter((s) => s.ends > 0).length };
        });
      })
    : days.map((d) => {
        const list = sessions.filter((s) => dayKey.format(new Date(s.openedAt)) === d);
        return { key: d, day: d, label: dayLabel.format(new Date(`${d}T12:00:00+03:00`)), n: list.length, done: list.filter((s) => s.ends > 0).length };
      });
  const max = Math.max(1, ...buckets.map((b) => b.n));
  const busiest = buckets.reduce((a, b) => (b.n > a.n ? b : a), buckets[0]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex min-h-44 flex-1 items-end gap-1 overflow-x-auto pb-1" role="img" aria-label={`Busiest: ${busiest.label}, ${busiest.n} sessions`}>
        {buckets.map((b, i) => {
          const newDay = perHour && i > 0 && buckets[i - 1].day !== b.day;
          return (
            <div key={b.key} className={cn("group flex h-44 min-w-5 flex-1 flex-col items-center justify-end gap-1.5", newDay && "ml-3")}>
              <span className="type-caption tabular-nums text-fg-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100">{b.n || ""}</span>
              <span
                className="flex w-full flex-col justify-end overflow-hidden rounded-t-[5px] bg-fg/25 transition-colors duration-150 group-hover:bg-fg/40"
                style={{ height: `${Math.max(b.n ? 6 : 2, (b.n / max) * 100)}%` }}
                title={`${perHour ? `${dayLabel.format(new Date(`${b.day}T12:00:00+03:00`))}, ` : ""}${b.label}: ${b.n} sessions, ${b.done} finished`}
              >
                <span className="block w-full bg-success" style={{ height: `${b.n ? (b.done / b.n) * 100 : 0}%` }} />
              </span>
            </div>
          );
        })}
      </div>
      <div className="type-caption flex flex-wrap justify-between gap-x-4 gap-y-1 text-fg-subtle">
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-success" /> finished
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-fg/25" /> didn&apos;t finish
          </span>
        </span>
        <span>
          Busiest: <span className="font-semibold text-fg">{busiest.label}</span>, {busiest.n} sessions
        </span>
      </div>
    </div>
  );
}

interface DeviceRow {
  id: string;
  latest: PlaySession;
  sessions: number;
  players: number;
  finished: number;
  ms: number;
  games: { k: string; n: number }[];
  ips: string[];
  firstAt: string;
  lastAt: string;
}

function DeviceCard({ d, name, active, onClick, now }: { d: DeviceRow; name: string; active: boolean; onClick: () => void; now: string }) {
  const dev = d.latest.device;
  const recent = Date.parse(now) - Date.parse(d.lastAt) < 120_000;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-full w-full flex-col gap-4 rounded-lg bg-surface p-5 text-left shadow-ring transition-[background-color,box-shadow] duration-150",
        "hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        active && "bg-raised shadow-[inset_0_0_0_2px_var(--color-fg)]",
      )}
    >
      <span className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-fg/[0.07] text-fg">
          <DeviceIcon kind={dev.kind} className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <span className="type-title-3 text-fg">{name}</span>
            {recent ? <Chip tone="success">Active now</Chip> : null}
          </span>
          <span className="type-caption truncate text-fg-subtle">
            {[dev.os, dev.browser, dev.screen].filter(Boolean).join(" · ")}
            {dev.gpu ? ` · ${dev.gpu.replace(/^ANGLE \(|\)$/g, "")}` : ""}
          </span>
        </span>
        <span className="flex flex-col items-end">
          <span className="text-[1.5rem] font-bold leading-none tabular-nums text-fg">{d.players}</span>
          <span className="type-caption text-fg-subtle">players</span>
        </span>
      </span>

      <span className="type-caption grid grid-cols-3 gap-2 text-fg-subtle">
        <span className="flex flex-col">
          <span className="font-semibold tabular-nums text-fg-muted">{duration(d.ms)}</span>played
        </span>
        <span className="flex flex-col">
          <span className="font-semibold tabular-nums text-fg-muted">{d.finished}</span>finished
        </span>
        <span className="flex flex-col">
          <span className="font-semibold tabular-nums text-fg-muted">{timeOnly.format(new Date(d.lastAt))}</span>last seen
        </span>
      </span>

      {d.games.length ? (
        <span className="flex flex-wrap gap-1.5">
          {d.games.slice(0, 6).map((g) => (
            <span key={g.k} data-game={isKnownGame(g.k) ? g.k : undefined} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-game-soft px-2.5 text-[0.8125rem] font-semibold text-game">
              {isKnownGame(g.k) ? <GameGlyph slug={g.k} className="size-3.5" /> : null}
              {gameName(g.k)}
              <span className="tabular-nums opacity-70">{g.n}</span>
            </span>
          ))}
        </span>
      ) : null}

      <span className="type-caption flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-fg-faint">
        {place(d.latest) ? (
          <span className="inline-flex items-center gap-1">
            <Globe2 aria-hidden className="size-3.5" /> {place(d.latest)}
          </span>
        ) : null}
        {d.ips.length ? <span className="font-mono text-[0.6875rem]">{d.ips.slice(0, 2).join(", ")}{d.ips.length > 2 ? ` +${d.ips.length - 2}` : ""}</span> : null}
        <span className="font-mono text-[0.6875rem]">{dev.fp || d.id}</span>
      </span>
    </button>
  );
}

function ArcadePanel({ hub }: { hub: PlaySession[] }) {
  const clicks = countBy(
    hub.flatMap((s) => s.events.filter((e) => e.k === "step" && e.x === "game")),
    (e) => String(e.v ?? ""),
  );
  const clicked = hub.filter((s) => s.events.some((e) => e.k === "step" && e.x === "game")).length;
  const max = Math.max(1, ...clicks.map((c) => c.n));
  return (
    <section className="flex flex-col gap-5">
      <SectionHead title="The arcade page" line="The game list everybody lands on first: how often it was opened and which game people picked from it." />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
          <span className="grid size-10 place-items-center rounded-md bg-fg/[0.07] text-fg">
            <LayoutGrid aria-hidden className="size-5" />
          </span>
          <span className="font-dots text-[3.5rem] font-extrabold leading-[0.9] tabular-nums text-fg [font-variation-settings:'ROND'_70]">{hub.length}</span>
          <span className="type-small text-fg-muted">
            times opened · {pct(clicked, hub.length)}% went on to a game, median {duration(median(hub.map((s) => s.lastActiveMs)))} on the page
          </span>
        </div>
        <Panel title="Picked from the arcade" label="clicks">
          {clicks.length === 0 ? (
            <p className="type-small text-fg-subtle">No game picked from the arcade yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {clicks.map((c) => (
                <li key={c.k} data-game={isKnownGame(c.k) ? c.k : undefined} className="grid grid-cols-[8rem_minmax(0,1fr)_2.5rem] items-center gap-3">
                  <span className="type-small truncate font-semibold text-fg">{gameName(c.k)}</span>
                  <Bar value={c.n / max} className="bg-game" />
                  <span className="type-small text-right font-semibold tabular-nums text-fg">{c.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </section>
  );
}

function SessionRow({ s, deviceName, now, onOpen }: { s: PlaySession; deviceName: string; now: string; onOpen: () => void }) {
  const stage = playStage(s, now);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-game={isKnownGame(s.page) ? s.page : undefined}
      className={cn(
        "grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-lg bg-surface px-4 py-3 text-left shadow-ring transition-colors duration-150",
        "hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        "md:grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1fr)_6rem_minmax(0,1.2fr)]",
      )}
    >
      <span className="grid size-10 place-items-center rounded-md bg-game-soft text-game">
        {isKnownGame(s.page) ? <GameGlyph slug={s.page} className="size-5" /> : null}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="type-body truncate font-semibold text-fg">{gameName(s.page)}</span>
        <span className="type-caption tabular-nums text-fg-subtle">{fullDate.format(new Date(s.openedAt))}</span>
      </span>
      <span className="type-small hidden min-w-0 items-center gap-2 text-fg-muted md:flex">
        <DeviceIcon kind={s.device.kind} className="size-4 shrink-0" />
        <span className="truncate">
          {deviceName}
          {place(s) ? ` · ${place(s)}` : ""}
        </span>
      </span>
      <span className="type-small hidden tabular-nums text-fg-muted md:block">{duration(engagedMs(s))}</span>
      <span className="flex flex-wrap items-center justify-end gap-1.5 max-md:col-span-3 max-md:justify-start md:justify-start">
        <Chip tone={STAGES[stage].tone}>{STAGES[stage].label}</Chip>
        {s.lastScore !== null ? <Chip tone="game">{s.outOf !== null ? `${s.lastScore} of ${s.outOf}` : `Score ${s.lastScore}`}</Chip> : null}
        {s.ends > 1 ? <Chip>{s.ends} rounds</Chip> : null}
        <span className="type-caption tabular-nums text-fg-subtle md:hidden">{duration(engagedMs(s))}</span>
      </span>
    </button>
  );
}

function SessionModal({ session, deviceName, now, onClose }: { session: PlaySession | null; deviceName: string; now: string; onClose: () => void }) {
  // Keep the last session on screen while the modal animates out.
  const [last, setLast] = useState<PlaySession | null>(session);
  if (session && session !== last) setLast(session);
  const s = session ?? last;
  const stage = s ? playStage(s, now) : null;

  return (
    <Modal open={session !== null} onOpenChange={(o) => (o ? null : onClose())} size="lg" title={s ? gameName(s.page) : "Session"} description={s ? fullDate.format(new Date(s.openedAt)) : undefined}>
      {s && stage ? (
        <div data-game={isKnownGame(s.page) ? s.page : undefined} className="flex flex-col gap-7">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={STAGES[stage].tone}>{STAGES[stage].label}</Chip>
            <Chip icon={<DeviceIcon kind={s.device.kind} />}>{deviceName}</Chip>
            {s.mode ? <Chip tone="game">{words(s.mode)}</Chip> : null}
            {s.camera ? <Chip tone={s.camera === "ok" ? "success" : "danger"}>{s.camera === "ok" ? "Camera on" : `Camera: ${s.camera}`}</Chip> : null}
            {s.via === "next" ? <Chip>After Next player</Chip> : null}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Time spent" value={duration(engagedMs(s))} />
            <MiniStat label="Rounds finished" value={`${s.ends} of ${s.starts}`} />
            <MiniStat label="Score" value={s.lastScore === null ? "–" : s.outOf !== null ? `${s.lastScore}/${s.outOf}` : String(s.lastScore)} />
            <MiniStat label="Taps and keys" value={String(s.taps + s.keys)} />
          </div>

          <div className="flex flex-col gap-3">
            <span className="type-label text-fg-subtle">What they did</span>
            <ol className="flex flex-col">
              {s.events.map((e, i) => (
                <li key={`${e.t}-${i}`} className="relative grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 border-l border-line py-1.5 pl-4">
                  <span aria-hidden className={cn("absolute -left-[4.5px] top-[0.7rem] size-2 rounded-full", eventTone[e.k] ?? "bg-fg/30")} />
                  <span className="type-small tabular-nums text-fg-subtle">{duration(e.t)}</span>
                  <span className={cn("type-small", e.k === "start" || e.k === "end" ? "font-semibold text-fg" : "text-fg-muted")}>{eventLine(e)}</span>
                </li>
              ))}
            </ol>
            {s.events.length >= 240 ? <p className="type-caption text-fg-faint">Only the first 240 events of a session are kept.</p> : null}
          </div>

          <dl className="type-small grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 border-t border-line pt-4 text-fg-subtle">
            <dt>Opened</dt>
            <dd className="tabular-nums text-fg-muted">{fullDate.format(new Date(s.openedAt))}</dd>
            <dt>Last heard</dt>
            <dd className="tabular-nums text-fg-muted">{fullDate.format(new Date(s.lastAt))}</dd>
            <dt>Page visible</dt>
            <dd className="tabular-nums text-fg-muted">{duration(s.visibleMs)} of {duration(s.lastMs)}</dd>
            <dt>Ended by</dt>
            <dd className="text-fg-muted">{{ "": "Still open or tab closed", "next-player": "Next player", idle: "Idle reset", left: "Leaving the page", away: "Away over 15 minutes" }[s.close]}</dd>
            <dt>Where</dt>
            <dd className="text-fg-muted">{[s.net.city, s.net.region, s.net.country].filter(Boolean).join(", ") || "–"}</dd>
            <dt>IP address</dt>
            <dd className="font-mono text-[0.75rem] text-fg-muted">{s.net.ip || "–"}</dd>
            <dt>Device</dt>
            <dd className="text-fg-muted">
              {[s.device.os, s.device.browser, s.device.lang, `screen ${s.device.screen}`, `window ${s.device.viewport}`].filter(Boolean).join(" · ")}
            </dd>
            <dt>Hardware</dt>
            <dd className="text-fg-muted">
              {[s.device.cores ? `${s.device.cores} cores` : "", s.device.memory ? `${s.device.memory} GB` : "", s.device.touch ? `${s.device.touch} touch points` : "", s.device.net].filter(Boolean).join(" · ") || "–"}
            </dd>
            <dt>Graphics</dt>
            <dd className="text-fg-muted">{s.device.gpu || "–"}</dd>
            <dt>Browser string</dt>
            <dd className="break-all font-mono text-[0.6875rem] text-fg-faint">{s.net.ua || "–"}</dd>
            <dt>Ids</dt>
            <dd className="break-all font-mono text-[0.6875rem] text-fg-faint">
              device {s.deviceId} · fingerprint {s.device.fp || "–"} · session {s.id}
            </dd>
          </dl>
        </div>
      ) : null}
    </Modal>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────── */

function BigStat({ value, label, note, accent }: { value: string; label: string; note: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface p-5 shadow-ring sm:p-6">
      <span className="type-label text-fg-subtle">{label}</span>
      <span className={cn("font-dots text-[clamp(2.25rem,1.6rem+2.2vw,3.75rem)] font-extrabold leading-[0.9] tabular-nums [font-variation-settings:'ROND'_70]", accent ?? "text-fg")}>
        {value}
      </span>
      <span className="type-small text-fg-muted">{note}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-sunken p-3.5 shadow-ring">
      <span className="type-caption text-fg-subtle">{label}</span>
      <span className="text-[1.25rem] font-bold tabular-nums text-fg">{value}</span>
    </div>
  );
}

function Panel({ title, label, children }: { title: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="type-title-3 text-fg">{title}</h2>
        <span className="type-label text-fg-subtle">{label}</span>
      </div>
      {children}
    </div>
  );
}

function SectionHead({ title, line, id }: { title: string; line: string; id?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 id={id} className="type-title-1 text-fg">
        {title}
      </h2>
      <p className="type-body max-w-[48rem] text-fg-muted">{line}</p>
    </div>
  );
}

function Bar({ value, className }: { value: number; className: string }) {
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-fg/10" aria-hidden>
      <span className={cn("block h-full origin-left rounded-full", className)} style={{ transform: `scaleX(${Math.max(0, Math.min(1, value))})` }} />
    </span>
  );
}

/* ── Export ───────────────────────────────────────────────────────── */

function downloadCsv(sessions: PlaySession[], deviceName: (id: string) => string) {
  const cell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows: (string | number | null)[][] = [
    [
      "Opened (Jeddah)", "Game", "Device", "Kind", "OS", "Browser", "Screen", "Graphics", "IP", "City", "Country",
      "Outcome", "Time spent (s)", "Starts", "Finished", "Wins", "Last score", "Out of", "Best", "Mode", "Last step", "Camera",
      "Taps", "Keys", "Errors", "Ended by", "Steps", "Session id", "Device id", "Fingerprint", "User agent",
    ],
    ...sessions.map((s) => [
      fullDate.format(new Date(s.openedAt)), gameName(s.page), deviceName(s.deviceId), s.device.kind, s.device.os, s.device.browser,
      s.device.screen, s.device.gpu, s.net.ip, s.net.city, s.net.country, STAGES[playStage(s, new Date().toISOString())].label,
      Math.round(engagedMs(s) / 1000), s.starts, s.ends, s.wins, s.lastScore, s.outOf, s.best, s.mode, s.lastStep, s.camera,
      s.taps, s.keys, s.errors, s.close,
      s.events.filter((e) => e.k === "step").map((e) => `${e.x}${e.v !== undefined ? `=${e.v}` : ""}`).join(" > "),
      s.id, s.deviceId, s.device.fp, s.net.ua,
    ]),
  ];
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `edex-game-sessions-${dayKey.format(new Date())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
