import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameGlyph } from "@/components/art/game-glyph";
import { ISSUES, RATINGS, type FeedbackEntry } from "@/content/feedback";
import { GAMES, gameBySlug } from "@/content/games";
import { readFeedback, storeConfigured } from "@/lib/feedback-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Feedback responses",
  robots: { index: false, follow: false },
};

const issueLabel = (id: string) => ISSUES.find((i) => i.id === id)?.label ?? id;
const ratingWord = (value: number) => RATINGS.find((r) => r.value === value)?.word ?? "";
const average = (list: FeedbackEntry[]) => (list.length ? list.reduce((sum, e) => sum + e.rating, 0) / list.length : 0);

const time = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Riyadh",
});

/** For the two of us only: /feedback/responses?key=<FEEDBACK_KEY>. Without the key it doesn't exist. */
export default async function ResponsesPage({ searchParams }: PageProps<"/feedback/responses">) {
  const { key } = await searchParams;
  const secret = process.env.FEEDBACK_KEY;
  if (!secret || key !== secret) notFound();

  if (!storeConfigured()) {
    return (
      <Shell>
        <h1 className="type-title-1 text-fg">No storage connected</h1>
        <p className="type-body text-fg-muted">Connect an Upstash Redis database to the Vercel project, then redeploy.</p>
      </Shell>
    );
  }

  const entries = await readFeedback();
  const games = GAMES.map((g) => {
    const list = entries.filter((e) => e.game === g.slug);
    return { game: g, count: list.length, avg: average(list) };
  }).sort((a, b) => b.count - a.count);

  return (
    <Shell>
      <div className="flex flex-col gap-2">
        <span className="type-label text-fg-subtle">Feedback · newest first</span>
        <h1 className="type-display-2 text-fg">{entries.length === 1 ? "1 response" : `${entries.length} responses`}</h1>
        {entries.length ? (
          <p className="type-body-lg text-fg-muted">Average rating {average(entries).toFixed(1)} of 5.</p>
        ) : null}
      </div>

      <section aria-labelledby="by-game" className="flex flex-col gap-3">
        <h2 id="by-game" className="type-title-3 text-fg">
          By game
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {games.map(({ game, count, avg }) => (
            <li key={game.slug} data-game={game.slug} className="flex items-center gap-3 rounded-md bg-surface px-4 py-3 shadow-ring">
              <GameGlyph slug={game.slug} className="size-5 shrink-0 text-game" />
              <span className="type-body min-w-0 flex-1 font-semibold text-fg">{game.short}</span>
              <span className="type-small tabular-nums text-fg-subtle">
                {count ? `${count} · ${avg.toFixed(1)} of 5` : "None yet"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="all" className="flex flex-col gap-3">
        <h2 id="all" className="type-title-3 text-fg">
          Every answer
        </h2>
        {entries.length ? (
          <ul className="flex flex-col gap-2">
            {entries.map((e, i) => (
              <li key={`${e.at}-${i}`} data-game={e.game} className="flex flex-col gap-2 rounded-lg bg-surface p-4 shadow-ring sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="type-body font-semibold text-fg">{e.name || "No name"}</span>
                  <span className="type-caption tabular-nums text-fg-subtle">{time.format(new Date(e.at))}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="type-small inline-flex items-center gap-1.5 text-fg-muted">
                    <GameGlyph slug={e.game} className="size-4 text-game" />
                    {gameBySlug(e.game).short}
                  </span>
                  <span className={e.rating <= 2 ? "type-small font-semibold text-danger" : "type-small font-semibold text-game"}>
                    {e.rating} of 5 · {ratingWord(e.rating)}
                  </span>
                </div>
                {e.issues.length ? <p className="type-small text-fg-muted">{e.issues.map(issueLabel).join(", ")}</p> : null}
                {e.comment ? <p className="type-body text-fg">{e.comment}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-body text-fg-muted">Nothing yet.</p>
        )}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[48rem] flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14">{children}</main>
  );
}
