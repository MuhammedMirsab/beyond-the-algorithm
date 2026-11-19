"use client";

import { Laptop, Smartphone, Tablet } from "lucide-react";
import { useMemo, useState } from "react";
import { GameGlyph } from "@/components/art/game-glyph";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/dialog";
import { ISSUES, RATINGS } from "@/content/feedback";
import { GAMES, type GameSlug } from "@/content/games";
import { visitStage, type Visit, type VisitEvent, type VisitStage } from "@/content/visits";
import { cn } from "@/lib/cn";

/* ── Helpers ──────────────────────────────────────────────────────── */

const TZ = "Asia/Riyadh";
const gameInfo = new Map(GAMES.map((g) => [g.slug as string, g]));
const isKnownGame = (slug: string): slug is GameSlug => gameInfo.has(slug);
const gameName = (slug: string) => gameInfo.get(slug)?.short ?? slug.replace(/-/g, " ");
const ratingWord = (r: number) => RATINGS.find((x) => x.value === r)?.word ?? "";
const issueLabel = (id: string) => ISSUES.find((i) => i.id === id)?.label ?? id;
const timeOf = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** "4.2 s", "1 min 12 s". */
export function duration(ms: number | null) {
  if (ms === null) return "–";
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s ? `${m} min ${s} s` : `${m} min`;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "–");

export const STAGES: Record<VisitStage, { label: string; tone: "success" | "danger" | "warning" | "neutral" | "game" }> = {
  sent: { label: "Sent", tone: "success" },
  here: { label: "Still on the page", tone: "game" },
  "left-after-rating": { label: "Rated, didn't send", tone: "warning" },
  "left-after-tapping": { label: "Tapped, no rating", tone: "warning" },
  "left-before-tapping": { label: "Left without tapping", tone: "danger" },
  "send-failed": { label: "Send failed", tone: "danger" },
};

const EVENT_WORDS: Record<string, (x?: string | number) => string> = {
  open: (x) => (x ? `Opened from the ${gameName(String(x))} QR` : "Opened"),
  rate: (x) => `Tapped ${x}${typeof x === "number" ? `, ${ratingWord(x).toLowerCase()}` : ""}`,
  game: (x) => `Ticked or unticked ${gameName(String(x ?? ""))}`,
  issue: (x) => `Ticked or unticked "${issueLabel(String(x ?? ""))}"`,
  type: (x) => `Comment box: ${x} characters`,
  invalid: (x) => `Pressed Send with no ${x === "games" ? "game ticked" : "rating"}`,
  send: () => "Pressed Send",
  sent: () => "Answer saved",
  fail: (x) => `Didn't send (${x ?? "error"})`,
  hide: () => "Left the tab or locked the phone",
  show: () => "Came back",
  again: () => "Tapped Try the other games",
};

function DeviceIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = kind === "phone" ? Smartphone : kind === "tablet" ? Tablet : Laptop;
  return <Icon aria-hidden className={className} />;
}

/* ── Panel ────────────────────────────────────────────────────────── */

export function VisitsPanel({ visits, now }: { visits: Visit[]; now: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const s = useMemo(() => {
    const withStage = visits.map((v) => ({ v, stage: visitStage(v, now) }));
    const count = (st: VisitStage) => withStage.filter((x) => x.stage === st).length;
    const opened = visits.length;
    const tapped = visits.filter((v) => v.firstTapMs !== null).length;
    const rated = visits.filter((v) => v.rating !== null).length;
    const pressed = visits.filter((v) => v.sendMs !== null).length;
    const sent = visits.filter((v) => v.sentMs !== null).length;
    const unsent = withStage.filter((x) => x.stage === "left-after-rating").map((x) => x.v);
    const visitors = new Set(visits.map((v) => v.visitor));
    const phones = new Set(visits.map((v) => v.fp).filter(Boolean));
    const repeatSenders = [...visitors].filter((id) => visits.filter((v) => v.visitor === id && v.sentMs !== null).length > 1).length;
    const devices = ["phone", "tablet", "desktop"].map((kind) => ({ kind, n: visits.filter((v) => v.device.kind === kind).length }));
    const systems = [...new Set(visits.map((v) => v.device.os || "Other"))]
      .map((os) => ({ os, n: visits.filter((v) => (v.device.os || "Other") === os).length }))
      .sort((a, b) => b.n - a.n);
    const sources = [...new Set(visits.map((v) => v.from))]
      .map((from) => {
        const list = visits.filter((v) => v.from === from);
        return { from, opened: list.length, sent: list.filter((v) => v.sentMs !== null).length };
      })
      .sort((a, b) => b.opened - a.opened);
    return {
      withStage,
      opened,
      funnel: [
        { label: "Opened the form", n: opened },
        { label: "Tapped anything", n: tapped },
        { label: "Picked a rating", n: rated },
        { label: "Pressed Send", n: pressed },
        { label: "Saved", n: sent },
      ],
      stages: (Object.keys(STAGES) as VisitStage[]).map((st) => ({ st, n: count(st) })).filter((x) => x.n > 0),
      unsent,
      unsentDist: [1, 2, 3, 4, 5].map((r) => ({ r, n: unsent.filter((v) => v.rating === r).length })),
      firstTap: median(visits.map((v) => v.firstTapMs).filter((x): x is number => x !== null)),
      toSend: median(visits.map((v) => v.sentMs).filter((x): x is number => x !== null)),
      dropTime: median(withStage.filter((x) => x.stage.startsWith("left")).map((x) => x.v.lastMs)),
      visitors: visitors.size,
      phones: phones.size,
      returning: visits.filter((v) => v.returning).length,
      repeatSenders,
      devices,
      systems,
      sources,
    };
  }, [visits, now]);

  const open = openId ? visits.find((v) => v.id === openId) ?? null : null;
  const list = showAll ? s.withStage : s.withStage.slice(0, 30);

  if (visits.length === 0) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-xl bg-surface p-8 shadow-ring">
        <h2 className="type-title-2 text-fg">No visits tracked yet</h2>
        <p className="type-body text-fg-muted">Every time someone opens the form from now on, it shows up here, sent or not.</p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/* Funnel */}
        <div className="flex flex-col gap-5 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="type-title-3 text-fg">From scan to send</h3>
            <span className="type-label text-fg-subtle">{s.opened} opens</span>
          </div>
          <ul className="flex flex-col gap-3">
            {s.funnel.map((step, i) => (
              <li key={step.label} className="grid grid-cols-[minmax(0,1fr)_3rem_3.5rem] items-center gap-3">
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="type-small truncate font-semibold text-fg-muted">{step.label}</span>
                  <span className="block h-2.5 overflow-hidden rounded-full bg-fg/10" aria-hidden>
                    <span
                      className={cn("block h-full origin-left rounded-full", i === s.funnel.length - 1 ? "bg-success" : "bg-fg/70")}
                      style={{ transform: `scaleX(${s.opened ? step.n / s.opened : 0})` }}
                    />
                  </span>
                </span>
                <span className="type-body text-right font-semibold tabular-nums text-fg">{step.n}</span>
                <span className="type-small text-right tabular-nums text-fg-subtle">{pct(step.n, s.opened)}</span>
              </li>
            ))}
          </ul>
          <dl className="type-small grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-3">
            <Fact term="First tap" value={duration(s.firstTap)} note="median after opening" />
            <Fact term="Open to saved" value={duration(s.toSend)} note="median" />
            <Fact term="Drop-offs stayed" value={duration(s.dropTime)} note="median before leaving" />
          </dl>
        </div>

        {/* Where people stopped */}
        <div className="flex flex-col gap-5 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="type-title-3 text-fg">Where each visit ended</h3>
          </div>
          <ul className="flex flex-col gap-2">
            {s.stages.map(({ st, n }) => (
              <li key={st} className="flex items-center justify-between gap-3">
                <Chip tone={STAGES[st].tone}>{STAGES[st].label}</Chip>
                <span className="type-body font-semibold tabular-nums text-fg">
                  {n} <span className="type-small font-medium text-fg-subtle">{pct(n, s.opened)}</span>
                </span>
              </li>
            ))}
          </ul>
          {s.unsent.length ? (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <span className="type-small font-semibold text-fg">Ratings from people who didn&apos;t press Send</span>
              <div className="flex gap-1.5">
                {s.unsentDist.map(({ r, n }) => (
                  <span key={r} className="flex flex-1 flex-col items-center gap-1 rounded-md bg-sunken py-2 shadow-ring">
                    <span className="text-[1.125rem] font-bold tabular-nums text-fg">{n}</span>
                    <span className="type-caption tabular-nums text-fg-subtle">rated {r}</span>
                  </span>
                ))}
              </div>
              <span className="type-caption text-fg-subtle">Not in the answers above. Counted here so the quiet ones aren&apos;t lost.</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
          <h3 className="type-title-3 text-fg">Who</h3>
          <dl className="type-small grid grid-cols-2 gap-x-6 gap-y-3">
            <Fact term="Browsers" value={String(s.visitors)} note="different visitor ids" />
            <Fact term="Devices" value={String(s.phones)} note="different fingerprints" />
            <Fact term="Came back" value={String(s.returning)} note="opens from a known browser" />
            <Fact term="Sent twice or more" value={String(s.repeatSenders)} note="same browser" />
          </dl>
        </div>
        <div className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
          <h3 className="type-title-3 text-fg">On what</h3>
          <ul className="flex flex-col gap-2">
            {s.devices
              .filter((d) => d.n > 0)
              .map((d) => (
                <li key={d.kind} className="flex items-center gap-3">
                  <DeviceIcon kind={d.kind} className="size-4 text-fg-subtle" />
                  <span className="type-small flex-1 font-semibold capitalize text-fg-muted">{d.kind}</span>
                  <span className="type-body font-semibold tabular-nums text-fg">{d.n}</span>
                </li>
              ))}
          </ul>
          <span className="type-caption text-fg-subtle">{s.systems.map((x) => `${x.os} ${x.n}`).join(" · ")}</span>
        </div>
        <div className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-ring sm:col-span-2 sm:p-6 lg:col-span-1">
          <h3 className="type-title-3 text-fg">Which QR</h3>
          <ul className="flex flex-col gap-2">
            {s.sources.map((x) => (
              <li key={x.from || "none"} data-game={isKnownGame(x.from) ? x.from : undefined} className="flex items-center gap-3">
                {isKnownGame(x.from) ? <GameGlyph slug={x.from} className="size-4 text-game" /> : <span className="size-4" />}
                <span className="type-small min-w-0 flex-1 truncate font-semibold text-fg-muted">{x.from ? gameName(x.from) : "No game in the link"}</span>
                <span className="type-small tabular-nums text-fg-subtle">
                  {x.sent} of {x.opened} sent
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Every visit */}
      <div className="flex flex-col gap-3 rounded-xl bg-surface p-2 shadow-ring sm:p-3">
        <ul className="flex flex-col">
          {list.map(({ v, stage }) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => setOpenId(v.id)}
                data-game={isKnownGame(v.from) ? v.from : undefined}
                className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-150 hover:bg-fg/[0.05] focus-visible:outline-2 focus-visible:outline-fg"
              >
                <span className="grid size-9 place-items-center rounded-full bg-game-soft text-[0.9375rem] font-bold tabular-nums text-game">
                  {v.rating ?? "·"}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="type-small truncate font-semibold text-fg">
                    {v.from ? gameName(v.from) : "No game"} · {timeOf.format(new Date(v.openedAt))}
                  </span>
                  <span className="type-caption flex items-center gap-1.5 truncate text-fg-subtle">
                    <DeviceIcon kind={v.device.kind} className="size-3.5 shrink-0" />
                    {[v.device.os, v.device.browser].filter(Boolean).join(" ")} · {duration(v.lastMs)} on page
                    {v.visitNo > 1 ? ` · visit ${v.visitNo}` : ""}
                  </span>
                </span>
                <Chip tone={STAGES[stage].tone}>{STAGES[stage].label}</Chip>
              </button>
            </li>
          ))}
        </ul>
        {s.withStage.length > 30 ? (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((x) => !x)} className="self-start">
            {showAll ? "Show the latest 30" : `Show all ${s.withStage.length}`}
          </Button>
        ) : null}
      </div>

      <VisitModal visit={open} now={now} onClose={() => setOpenId(null)} />
    </div>
  );
}

function Fact({ term, value, note }: { term: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-fg-subtle">{term}</dt>
      <dd className="text-[1.25rem] font-bold tabular-nums text-fg">{value}</dd>
      <dd className="type-caption text-fg-faint">{note}</dd>
    </div>
  );
}

/** One visit, step by step. Also used from an answer's detail view. */
export function VisitTimeline({ visit: v, now }: { visit: Visit; now: string }) {
  const stage = visitStage(v, now);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={STAGES[stage].tone}>{STAGES[stage].label}</Chip>
        <Chip icon={<DeviceIcon kind={v.device.kind} />}>{[v.device.os, v.device.browser].filter(Boolean).join(" ") || v.device.kind}</Chip>
        {v.country ? <Chip>{v.country}</Chip> : null}
        <Chip>{v.visitNo > 1 ? `Visit ${v.visitNo} from this browser` : "First visit"}</Chip>
        {v.sentBefore > 0 ? <Chip>{v.sentBefore} sent before</Chip> : null}
      </div>
      <ol className="flex flex-col">
        {v.events.map((e: VisitEvent, i) => (
          <li key={`${e.t}-${i}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 border-l border-line py-1.5 pl-4">
            <span className="type-small tabular-nums text-fg-subtle">{duration(e.t)}</span>
            <span className="type-small text-fg">{(EVENT_WORDS[e.k] ?? ((x?: string | number) => `${e.k} ${x ?? ""}`))(e.x)}</span>
          </li>
        ))}
      </ol>
      <dl className="type-small grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 border-t border-line pt-4 text-fg-subtle">
        <dt>Opened</dt>
        <dd className="tabular-nums text-fg-muted">{timeOf.format(new Date(v.openedAt))}</dd>
        <dt>Comment</dt>
        <dd className="text-fg-muted">{v.commentLen ? `${v.commentLen} characters` : "None"}</dd>
        <dt>Visitor id</dt>
        <dd className="truncate font-mono text-[0.75rem] text-fg-faint">{v.visitor}</dd>
        <dt>Fingerprint</dt>
        <dd className="truncate font-mono text-[0.75rem] text-fg-faint">{v.fp || "–"}</dd>
      </dl>
    </div>
  );
}

function VisitModal({ visit, now, onClose }: { visit: Visit | null; now: string; onClose: () => void }) {
  // Keep the last visit on screen while the modal animates out.
  const [last, setLast] = useState<Visit | null>(visit);
  if (visit && visit !== last) setLast(visit);
  const v = visit ?? last;
  return (
    <Modal
      open={visit !== null}
      onOpenChange={(o) => (o ? null : onClose())}
      size="lg"
      title={v ? `${v.from ? gameName(v.from) : "No game"}${v.rating ? `, rated ${v.rating}` : ""}` : "Visit"}
      description={v ? timeOf.format(new Date(v.openedAt)) : undefined}
    >
      {v ? <VisitTimeline visit={v} now={now} /> : null}
    </Modal>
  );
}
