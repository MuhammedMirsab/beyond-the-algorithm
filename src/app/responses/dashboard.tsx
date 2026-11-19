"use client";

import { ChevronLeft, ChevronRight, Download, MessageSquareText, RefreshCw, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { GameGlyph } from "@/components/art/game-glyph";
import { Button } from "@/components/ui/button";
import { Chip, ToggleChip } from "@/components/ui/chip";
import { Segmented } from "@/components/ui/controls";
import { Modal } from "@/components/ui/dialog";
import { ISSUES, RATINGS } from "@/content/feedback";
import { GAMES, type GameSlug } from "@/content/games";
import type { FeedbackEntry } from "@/lib/feedback-admin";
import { cn } from "@/lib/cn";

/* ── Helpers ──────────────────────────────────────────────────────── */

const TZ = "Asia/Riyadh";
const gameInfo = new Map(GAMES.map((g) => [g.slug as string, g]));
const isKnownGame = (slug: string): slug is GameSlug => gameInfo.has(slug);
const gameName = (slug: string) => gameInfo.get(slug)?.short ?? slug.replace(/-/g, " ");
const ratingWord = (r: number) => RATINGS.find((x) => x.value === r)?.word ?? "No rating";
const issueLabel = (id: string) => ISSUES.find((i) => i.id === id)?.label ?? id;

/** Same text on the server and in the browser: fixed locale and time zone. */
const fullDate = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const hourOf = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" });

/** "12 min ago", measured from when the server read the data (so server and browser agree). */
function ago(iso: string, now: string) {
  const s = Math.max(0, (Date.parse(now) - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Ratings carry a word too, never colour alone. */
const ratingTone = (r: number) => (r >= 4 ? "text-success" : r === 3 ? "text-warning" : "text-danger");
const ratingBg = (r: number) => (r >= 4 ? "bg-success" : r === 3 ? "bg-warning" : "bg-danger");

const avg = (list: FeedbackEntry[]) => (list.length ? list.reduce((s, e) => s + e.rating, 0) / list.length : 0);

type Sort = "newest" | "oldest" | "lowest" | "highest";

/* ── Dashboard ────────────────────────────────────────────────────── */

export function Dashboard({ entries, fetchedAt }: { entries: FeedbackEntry[]; fetchedAt: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [query, setQuery] = useState("");
  const [games, setGames] = useState<string[]>([]);
  const [ratings, setRatings] = useState<number[]>([]);
  const [withComment, setWithComment] = useState(false);
  const [sort, setSort] = useState<Sort>("newest");
  const [openId, setOpenId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = entries.length;
    const happy = entries.filter((e) => e.rating >= 4).length;
    const comments = entries.filter((e) => e.comment).length;
    const named = entries.filter((e) => e.name).length;
    const byRating = [5, 4, 3, 2, 1].map((r) => ({ r, n: entries.filter((e) => e.rating === r).length }));
    const slugs = new Set<string>(GAMES.map((g) => g.slug));
    entries.forEach((e) => e.games.forEach((g) => slugs.add(g)));
    const byGame = [...slugs]
      .map((slug) => {
        const list = entries.filter((e) => e.games.includes(slug));
        return { slug, list, n: list.length, avg: avg(list), dist: [1, 2, 3, 4, 5].map((r) => list.filter((e) => e.rating === r).length) };
      })
      .sort((a, b) => b.n - a.n || b.avg - a.avg);
    const issues = ISSUES.map((i) => ({ ...i, n: entries.filter((e) => e.issues.includes(i.id)).length }))
      .filter((i) => i.n > 0)
      .sort((a, b) => b.n - a.n);
    return { total, happy, comments, named, byRating, byGame, issues, avg: avg(entries) };
  }, [entries]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = entries.filter(
      (e) =>
        (games.length === 0 || games.some((g) => e.games.includes(g))) &&
        (ratings.length === 0 || ratings.includes(e.rating)) &&
        (!withComment || e.comment) &&
        (!q ||
          e.name.toLowerCase().includes(q) ||
          e.comment.toLowerCase().includes(q) ||
          e.games.some((g) => gameName(g).toLowerCase().includes(q))),
    );
    const by: Record<Sort, (a: FeedbackEntry, b: FeedbackEntry) => number> = {
      newest: (a, b) => b.at.localeCompare(a.at),
      oldest: (a, b) => a.at.localeCompare(b.at),
      lowest: (a, b) => a.rating - b.rating || b.at.localeCompare(a.at),
      highest: (a, b) => b.rating - a.rating || b.at.localeCompare(a.at),
    };
    return list.sort(by[sort]);
  }, [entries, query, games, ratings, withComment, sort]);

  const filtered = games.length > 0 || ratings.length > 0 || withComment || query.trim() !== "";
  const clear = () => {
    setGames([]);
    setRatings([]);
    setWithComment(false);
    setQuery("");
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const openIndex = openId ? shown.findIndex((e) => e.id === openId) : -1;
  const open = openIndex >= 0 ? shown[openIndex] : null;

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-14 px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-10 lg:px-8">
      {/* Title */}
      <section className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div className="flex flex-col gap-3">
          <span className="type-label enter text-fg-subtle">Feedback · read from Firestore {ago(fetchedAt, fetchedAt)}</span>
          <h1 className="type-display-2 enter text-fg [--enter-delay:60ms]">What visitors said</h1>
          <p className="type-body-lg enter max-w-[36rem] text-fg-muted [--enter-delay:120ms]">
            Every answer from the QR form after each game. Click any card to read it in full.
          </p>
        </div>
        <div className="enter flex flex-wrap gap-2 [--enter-delay:180ms]">
          <Button variant="secondary" icon={<RefreshCw className={cn(refreshing && "animate-spin")} />} onClick={() => startRefresh(() => router.refresh())}>
            Refresh
          </Button>
          <Button variant="secondary" icon={<Download />} onClick={() => downloadCsv(entries)} disabled={entries.length === 0}>
            Download CSV
          </Button>
        </div>
      </section>

      {entries.length === 0 ? (
        <section className="flex flex-col items-start gap-3 rounded-xl bg-surface p-8 shadow-ring">
          <h2 className="type-title-2 text-fg">No feedback yet</h2>
          <p className="type-body text-fg-muted">Answers show up here as soon as visitors send the form.</p>
        </section>
      ) : (
        <>
          {/* Headline numbers */}
          <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <BigStat value={String(stats.total)} label="Responses" note={`${stats.named} left a name`} />
            <BigStat value={stats.avg.toFixed(1)} label="Average rating" note="out of 5" accent="text-game" game="face-control" />
            <BigStat
              value={`${Math.round((stats.happy / stats.total) * 100)}%`}
              label="Liked or loved it"
              note={`${stats.happy} rated 4 or 5`}
            />
            <BigStat value={String(stats.comments)} label="Wrote a comment" note={`${Math.round((stats.comments / stats.total) * 100)}% of answers`} />
          </section>

          {/* Distribution + timeline */}
          <section className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <Panel title="Ratings" label="How it went">
              <ul className="flex flex-col gap-3">
                {stats.byRating.map(({ r, n }) => {
                  const pct = stats.total ? n / stats.total : 0;
                  const active = ratings.includes(r);
                  return (
                    <li key={r}>
                      <button
                        type="button"
                        onClick={() => setRatings((l) => toggle(l, r))}
                        aria-pressed={active}
                        className={cn(
                          "grid w-full grid-cols-[2.25rem_minmax(0,1fr)_3rem] items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors duration-150",
                          "hover:bg-fg/[0.05] focus-visible:outline-2 focus-visible:outline-fg",
                          active && "bg-fg/[0.07]",
                        )}
                      >
                        <span className={cn("text-[1.25rem] font-bold tabular-nums", ratingTone(r))}>{r}</span>
                        <span className="flex min-w-0 flex-col gap-1.5">
                          <span className="type-small truncate font-semibold text-fg-muted">{ratingWord(r)}</span>
                          <span className="block h-2 overflow-hidden rounded-full bg-fg/10" aria-hidden>
                            <span className={cn("block h-full origin-left rounded-full", ratingBg(r))} style={{ transform: `scaleX(${pct})` }} />
                          </span>
                        </span>
                        <span className="type-body text-right font-semibold tabular-nums text-fg">{n}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
            <Panel title="When they answered" label="Jeddah time">
              <Timeline entries={entries} />
            </Panel>
          </section>

          {/* Per game */}
          <section className="flex flex-col gap-5">
            <SectionHead title="By game" line="Click a game to see only its answers. A visitor can rate several games at once." />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stats.byGame.map((g) => {
                const active = games.includes(g.slug);
                return (
                  <button
                    key={g.slug}
                    type="button"
                    data-game={isKnownGame(g.slug) ? g.slug : undefined}
                    aria-pressed={active}
                    onClick={() => setGames((l) => toggle(l, g.slug))}
                    className={cn(
                      "group flex flex-col gap-4 rounded-lg bg-surface p-5 text-left shadow-ring transition-[background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.98]",
                      "hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                      active && "bg-game-soft shadow-[inset_0_0_0_2px_var(--color-game)] hover:bg-game-soft",
                      g.n === 0 && "opacity-60",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-game-soft text-game">
                        {isKnownGame(g.slug) ? <GameGlyph slug={g.slug} className="size-5" /> : <MessageSquareText className="size-5" />}
                      </span>
                      <span className="type-title-3 min-w-0 flex-1 truncate text-fg">{gameName(g.slug)}</span>
                      <span className="text-[1.75rem] font-bold leading-none tabular-nums text-game">{g.n}</span>
                    </span>
                    <span className="flex items-center justify-between gap-3">
                      <RatingDots value={g.avg} />
                      <span className="type-small tabular-nums text-fg-subtle">{g.n ? `${g.avg.toFixed(1)} average` : "No answers yet"}</span>
                    </span>
                    {/* Stacked distribution, 1 on the left to 5 on the right. */}
                    <span className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-fg/10" aria-hidden>
                      {g.dist.map((n, i) =>
                        n ? <span key={i} className={cn("h-full", ratingBg(i + 1))} style={{ flexGrow: n }} /> : null,
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {stats.issues.length > 0 ? (
            <section className="flex flex-col gap-5">
              <SectionHead title="What to fix" line="Picked by visitors who rated a game 1 or 2." />
              <div className="flex flex-wrap gap-2">
                {stats.issues.map((i) => (
                  <span key={i.id} className="inline-flex h-11 items-center gap-3 rounded-full bg-surface pl-4 pr-2 shadow-ring">
                    <span className="text-[0.9375rem] font-semibold text-fg">{i.label}</span>
                    <span className="grid h-7 min-w-7 place-items-center rounded-full bg-danger/15 px-2 text-[0.875rem] font-bold tabular-nums text-danger">
                      {i.n}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {/* Every answer */}
          <section className="flex flex-col gap-5" aria-labelledby="all-answers">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <SectionHead
                id="all-answers"
                title="Every answer"
                line={filtered ? `${shown.length} of ${entries.length} match the filters.` : `${entries.length} answers.`}
              />
              <Segmented<Sort>
                label="Sort"
                value={sort}
                onValueChange={setSort}
                options={[
                  { value: "newest", label: "Newest" },
                  { value: "oldest", label: "Oldest" },
                  { value: "lowest", label: "Lowest" },
                  { value: "highest", label: "Highest" },
                ]}
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute left-5 top-1/2 size-[18px] -translate-y-1/2 text-fg-subtle" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search names, comments and games"
                  aria-label="Search answers"
                  className="h-12 w-full min-w-0 rounded-full bg-sunken pl-12 pr-6 text-[1rem] font-medium text-fg shadow-ring outline-none transition-shadow duration-150 placeholder:text-fg-faint focus:shadow-[0_0_0_2px_var(--color-fg)]"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[5, 4, 3, 2, 1].map((r) => (
                  <ToggleChip key={r} pressed={ratings.includes(r)} onClick={() => setRatings((l) => toggle(l, r))}>
                    <span className="tabular-nums">{r}</span>
                    <span className="max-sm:hidden">{ratingWord(r).toLowerCase()}</span>
                  </ToggleChip>
                ))}
                <ToggleChip pressed={withComment} onClick={() => setWithComment((v) => !v)} icon={<MessageSquareText />}>
                  With a comment
                </ToggleChip>
                {games.map((g) => (
                  <ToggleChip key={g} pressed onClick={() => setGames((l) => toggle(l, g))} icon={<X />}>
                    {gameName(g)}
                  </ToggleChip>
                ))}
                {filtered ? (
                  <Button variant="ghost" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </div>

            {shown.length === 0 ? (
              <p className="type-body rounded-lg bg-surface p-6 text-fg-muted shadow-ring">Nothing matches. Try fewer filters.</p>
            ) : (
              <ul className="columns-1 gap-3 sm:columns-2 lg:columns-3">
                {shown.map((e) => (
                  <li key={e.id} className="mb-3 break-inside-avoid">
                    <AnswerCard entry={e} now={fetchedAt} onOpen={() => setOpenId(e.id)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <AnswerModal
        entry={open}
        index={openIndex}
        count={shown.length}
        onClose={() => setOpenId(null)}
        onStep={(d) => {
          const next = shown[openIndex + d];
          if (next) setOpenId(next.id);
        }}
      />
    </main>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────── */

function BigStat({ value, label, note, accent, game }: { value: string; label: string; note: string; accent?: string; game?: GameSlug }) {
  return (
    <div data-game={game} className="flex flex-col gap-3 rounded-lg bg-surface p-5 shadow-ring sm:p-6">
      <span className="type-label text-fg-subtle">{label}</span>
      <span className={cn("font-dots text-[clamp(2.75rem,2rem+2.4vw,4.25rem)] font-extrabold leading-[0.9] tabular-nums [font-variation-settings:'ROND'_70]", accent ?? "text-fg")}>
        {value}
      </span>
      <span className="type-small text-fg-muted">{note}</span>
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
      <p className="type-body text-fg-muted">{line}</p>
    </div>
  );
}

/** Five dots, filled up to the rating: the machine layer's way of drawing a score. */
function RatingDots({ value, size = "sm" }: { value: number; size?: "sm" | "lg" }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${value.toFixed(1)} of 5`} role="img">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className={cn("relative overflow-hidden rounded-full bg-fg/12", size === "sm" ? "size-2.5" : "size-4")}>
            <span className="absolute inset-y-0 left-0 bg-game" style={{ width: `${fill * 100}%` }} />
          </span>
        );
      })}
    </span>
  );
}

/** Answers per hour (or per day once the spread is long), as columns. */
function Timeline({ entries }: { entries: FeedbackEntry[] }) {
  const days = [...new Set(entries.map((e) => dayKey.format(new Date(e.at))))].sort();
  const perHour = days.length <= 3;

  const buckets = perHour
    ? days.flatMap((d) => {
        const first = entries.filter((e) => dayKey.format(new Date(e.at)) === d);
        const hours = first.map((e) => Number(hourOf.format(new Date(e.at))));
        const lo = Math.min(...hours);
        const hi = Math.max(...hours);
        return Array.from({ length: hi - lo + 1 }, (_, i) => {
          const h = lo + i;
          return {
            key: `${d}-${h}`,
            day: d,
            label: `${String(h).padStart(2, "0")}:00`,
            n: hours.filter((x) => x === h).length,
          };
        });
      })
    : days.map((d) => ({
        key: d,
        day: d,
        label: dayLabel.format(new Date(`${d}T12:00:00+03:00`)),
        n: entries.filter((e) => dayKey.format(new Date(e.at)) === d).length,
      }));

  const max = Math.max(1, ...buckets.map((b) => b.n));
  const busiest = buckets.reduce((a, b) => (b.n > a.n ? b : a), buckets[0]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex min-h-40 flex-1 items-end gap-1 overflow-x-auto pb-1" role="img" aria-label={`Busiest: ${busiest?.label}, ${busiest?.n} answers`}>
        {buckets.map((b, i) => {
          const newDay = perHour && i > 0 && buckets[i - 1].day !== b.day;
          return (
            <div key={b.key} className={cn("group flex h-40 min-w-5 flex-1 flex-col items-center justify-end gap-1.5", newDay && "ml-3")}>
              <span className="type-caption tabular-nums text-fg-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100">{b.n || ""}</span>
              <span
                className={cn("w-full rounded-t-[5px] transition-colors duration-150", b === busiest ? "bg-fg" : "bg-fg/30 group-hover:bg-fg/60")}
                style={{ height: `${Math.max(b.n ? 6 : 2, (b.n / max) * 100)}%` }}
                title={`${perHour ? `${dayLabel.format(new Date(`${b.day}T12:00:00+03:00`))}, ` : ""}${b.label}: ${b.n}`}
              />
            </div>
          );
        })}
      </div>
      <div className="type-caption flex flex-wrap justify-between gap-x-4 gap-y-1 text-fg-subtle">
        <span>
          {perHour
            ? days.map((d) => dayLabel.format(new Date(`${d}T12:00:00+03:00`))).join(" · ")
            : `${buckets[0]?.label} to ${buckets[buckets.length - 1]?.label}`}
        </span>
        {busiest ? (
          <span>
            Busiest: <span className="font-semibold text-fg">{busiest.label}</span>, {busiest.n} answers
          </span>
        ) : null}
      </div>
    </div>
  );
}

function AnswerCard({ entry: e, now, onOpen }: { entry: FeedbackEntry; now: string; onOpen: () => void }) {
  const lead = e.from || e.games[0] || "";
  return (
    <button
      type="button"
      onClick={onOpen}
      data-game={isKnownGame(lead) ? lead : undefined}
      className={cn(
        "flex w-full flex-col gap-4 rounded-lg bg-surface p-5 text-left shadow-ring transition-[background-color,scale] duration-150 ease-out",
        "hover:bg-raised active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
      )}
    >
      <span className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-game text-[1.25rem] font-bold tabular-nums text-game-ink">
          {e.rating}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate text-[1.0625rem] font-semibold", e.name ? "text-fg" : "text-fg-subtle")}>{e.name || "Anonymous"}</span>
          <span className="type-caption text-fg-subtle">
            <span className={cn("font-semibold", ratingTone(e.rating))}>{ratingWord(e.rating)}</span> · {ago(e.at, now)}
          </span>
        </span>
      </span>

      {e.comment ? (
        <span className="type-body line-clamp-5 text-fg-muted">&ldquo;{e.comment}&rdquo;</span>
      ) : e.issues.length === 0 ? (
        <span className="type-small text-fg-faint">No comment</span>
      ) : null}

      {e.issues.length ? (
        <span className="flex flex-wrap gap-1.5">
          {e.issues.map((i) => (
            <Chip key={i} tone="danger">
              {issueLabel(i)}
            </Chip>
          ))}
        </span>
      ) : null}

      <span className="flex flex-wrap gap-1.5">
        {e.games.map((g) => (
          <span key={g} data-game={isKnownGame(g) ? g : undefined} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-game-soft px-2.5 text-[0.8125rem] font-semibold text-game">
            {isKnownGame(g) ? <GameGlyph slug={g} className="size-3.5" /> : null}
            {gameName(g)}
          </span>
        ))}
      </span>
    </button>
  );
}

function AnswerModal({
  entry,
  index,
  count,
  onClose,
  onStep,
}: {
  entry: FeedbackEntry | null;
  index: number;
  count: number;
  onClose: () => void;
  onStep: (d: -1 | 1) => void;
}) {
  // Keep the last answer on screen while the modal animates out.
  const [last, setLast] = useState<FeedbackEntry | null>(entry);
  if (entry && entry !== last) setLast(entry);
  const e = entry ?? last;

  useEffect(() => {
    if (!entry) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "ArrowLeft") onStep(-1);
      if (ev.key === "ArrowRight") onStep(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry, onStep]);

  const lead = e ? e.from || e.games[0] || "" : "";

  return (
    <Modal
      open={entry !== null}
      onOpenChange={(o) => (o ? null : onClose())}
      size="lg"
      title={e?.name || "Anonymous visitor"}
      description={e ? fullDate.format(new Date(e.at)) : undefined}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="type-label tabular-nums text-fg-subtle">
            {index + 1} of {count} · ← →
          </span>
          <span className="flex gap-2">
            <Button variant="secondary" size="md" icon={<ChevronLeft />} onClick={() => onStep(-1)} disabled={index <= 0}>
              Previous
            </Button>
            <Button variant="secondary" size="md" onClick={() => onStep(1)} disabled={index >= count - 1}>
              Next
              <ChevronRight />
            </Button>
          </span>
        </div>
      }
    >
      {e ? (
        <div data-game={isKnownGame(lead) ? lead : undefined} className="flex flex-col gap-7">
          <div className="flex items-center gap-5 rounded-lg bg-sunken p-5 shadow-ring">
            <span className="font-dots text-[4.5rem] font-extrabold leading-[0.85] text-game [font-variation-settings:'ROND'_70]">{e.rating}</span>
            <span className="flex flex-col gap-2">
              <span className={cn("type-title-2", ratingTone(e.rating))}>{ratingWord(e.rating)}</span>
              <RatingDots value={e.rating} size="lg" />
            </span>
          </div>

          {e.comment ? (
            <div className="flex flex-col gap-2">
              <span className="type-label text-fg-subtle">Comment</span>
              <blockquote className="type-body-lg whitespace-pre-wrap border-l-2 border-game pl-4 text-fg">{e.comment}</blockquote>
            </div>
          ) : null}

          {e.issues.length ? (
            <div className="flex flex-col gap-2">
              <span className="type-label text-fg-subtle">What to fix</span>
              <div className="flex flex-wrap gap-2">
                {e.issues.map((i) => (
                  <Chip key={i} tone="danger">
                    {issueLabel(i)}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <span className="type-label text-fg-subtle">Games played</span>
            <ul className="grid gap-2 sm:grid-cols-2">
              {e.games.map((g) => (
                <li key={g} data-game={isKnownGame(g) ? g : undefined} className="flex items-center gap-3 rounded-md bg-sunken px-3.5 py-3 shadow-ring">
                  <span className="grid size-9 place-items-center rounded-sm bg-game-soft text-game">
                    {isKnownGame(g) ? <GameGlyph slug={g} className="size-[18px]" /> : <MessageSquareText className="size-[18px]" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-fg">{gameName(g)}</span>
                  {g === e.from ? <span className="type-caption text-fg-subtle">scanned QR</span> : null}
                </li>
              ))}
            </ul>
          </div>

          <dl className="type-small grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 border-t border-line pt-4 text-fg-subtle">
            <dt>Sent</dt>
            <dd className="tabular-nums text-fg-muted">{fullDate.format(new Date(e.at))}</dd>
            <dt>Opened from</dt>
            <dd className="text-fg-muted">{e.from ? `${gameName(e.from)} QR code` : "Not a game QR"}</dd>
            <dt>Record</dt>
            <dd className="truncate font-mono text-[0.75rem] text-fg-faint">{e.id}</dd>
          </dl>
        </div>
      ) : null}
    </Modal>
  );
}

/* ── Export ───────────────────────────────────────────────────────── */

function downloadCsv(entries: FeedbackEntry[]) {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [
    ["Sent (Jeddah)", "Name", "Rating", "Rating word", "Games", "Opened from", "Issues", "Comment", "Id"],
    ...entries.map((e) => [
      fullDate.format(new Date(e.at)),
      e.name,
      e.rating,
      ratingWord(e.rating),
      e.games.map(gameName).join("; "),
      e.from ? gameName(e.from) : "",
      e.issues.map(issueLabel).join("; "),
      e.comment,
      e.id,
    ]),
  ];
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `edex-feedback-${dayKey.format(new Date())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

