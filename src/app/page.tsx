import Link from "next/link";
import { Rotate3d, ShieldCheck } from "lucide-react";
import { CURATORS, GAMES, GROUPS, gamePath, gamesInGroup, type Group } from "@/content/games";
import { GameGlyph } from "@/components/art/game-glyph";
import { GameTile } from "@/components/hub/game-tile";
import { Globe } from "@/components/hub/globe";
import { SpectrumMark } from "@/components/hub/spectrum-mark";
import { WatchingMark } from "@/components/hub/watching-mark";
import { cn } from "@/lib/cn";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <Hero />
        <div className="mx-auto flex w-full max-w-[75rem] flex-col gap-16 px-4 pb-20 sm:px-6 lg:gap-20 lg:px-8">
          {GROUPS.map((group, i) => (
            <GameGroup key={group.id} group={group} index={i} />
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="mx-auto flex h-16 w-full max-w-[75rem] items-center justify-between gap-4 px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:px-8">
      <a href="#top" className="flex items-center gap-3 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fg">
        <SpectrumMark />
        <span className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-fg">Beyond the Algorithm</span>
      </a>
      <span className="type-small hidden text-fg-subtle sm:inline">EDEX 2026 · IISJ Computer Science</span>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative mx-auto w-full max-w-[75rem] px-4 sm:px-6 lg:px-8">
      <div className="grid items-center gap-2 pb-8 pt-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:gap-8 lg:pb-12 lg:pt-8">
        <div className="relative z-10 flex flex-col gap-5">
          <h1 className="type-display-1 enter max-w-[15ch] text-fg">How much can a machine work out about you?</h1>
          <p className="type-body-lg enter max-w-[32rem] text-fg-muted [--enter-delay:90ms]">
            Ten quick games made by IISJ Computer Science students. Play one, then see exactly how the AI did it.
          </p>
        </div>
        <figure className="enter relative mx-auto w-[min(100%,22rem)] [--enter-delay:180ms] md:w-full md:max-w-[24rem]">
          <Globe className="w-full" />
          {/* An invitation to touch it, and the theme of the arcade in one gesture. */}
          <figcaption className="type-small mt-2 flex items-center justify-center gap-2 text-center text-fg-subtle">
            <Rotate3d aria-hidden className="size-4 shrink-0 text-fg-muted" />
            Spin it away. It always finds you again.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

function GameGroup({ group, index }: { group: Group; index: number }) {
  const games = gamesInGroup(group.id);
  const three = games.length === 3;
  return (
    <section id={index === 0 ? "games" : undefined} aria-labelledby={`group-${group.id}`} className="flex scroll-mt-6 flex-col gap-6">
      <div className="reveal grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-end md:gap-10">
        <h2 id={`group-${group.id}`} className="type-title-1 text-fg">
          {group.title}
        </h2>
        <p className="type-body max-w-[32rem] text-fg-muted">{group.line}</p>
      </div>
      <ul
        className={cn(
          // Phones: a swipeable row that peeks the next game. Tablet up: a grid.
          "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-1 no-scrollbar",
          "sm:mx-0 sm:grid sm:snap-none sm:overflow-visible sm:px-0 sm:pb-0",
          three ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2",
        )}
      >
        {games.map((game) => (
          <li key={game.slug} className={cn("reveal flex w-[84%] shrink-0 snap-start sm:w-auto", three && "sm:last:col-span-2 lg:last:col-span-1")}>
            <GameTile game={game} className="w-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The page ends by answering the question it opened with (while the brand
 * mark watches you read it), then lists every game with the idea behind it,
 * one tap away. Credits and the data promise are small print: true and
 * findable, never in the way.
 */
function SiteFooter() {
  const makers = (["mirsab", "dilshaan"] as const).map((id) => CURATORS[id].name).join(" and ");
  return (
    <footer className="overflow-x-clip border-t border-line">
      <div className="mx-auto flex w-full max-w-[75rem] flex-col gap-12 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-16 sm:px-6 lg:gap-16 lg:px-8 lg:pt-24">
        <div className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
          <div className="reveal flex flex-col gap-4">
            <h2 className="type-display-2 max-w-[16ch] text-fg">Every game here worked something out about you.</h2>
            <p className="type-body-lg max-w-[30rem] text-fg-muted">
              The apps on your phone do the same thing all day, with far more data. Now you know how.
            </p>
          </div>
          <WatchingMark className="w-[min(64vw,14rem)] justify-self-center md:w-[16rem] md:justify-self-end lg:w-[18rem]" />
        </div>

        <nav aria-labelledby="footer-games" className="flex flex-col gap-4">
          <h2 id="footer-games" className="type-label text-fg-subtle">
            Ten games, ten ideas from machine learning
          </h2>
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
            {GAMES.map((game, i) => (
              <li key={game.slug} className="reveal flex" style={{ ["--reveal-shift" as string]: `${(i % 5) * 12}%` }}>
                <Link
                  href={gamePath(game.slug)}
                  data-game={game.slug}
                  className={cn(
                    // Phones: two columns, icon above the name. From sm: icon beside it.
                    "group/chip flex w-full flex-col items-start gap-2.5 rounded-[1.25rem] bg-surface p-3 shadow-ring sm:flex-row sm:items-center sm:gap-3 sm:p-2 sm:pr-4",
                    "transition-[background-color,box-shadow,scale] duration-150 ease-out hover:bg-raised hover:shadow-ring-strong active:scale-[0.98]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                  )}
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-[0.875rem] bg-game text-game-ink transition-transform duration-200 ease-[var(--ease-out)] group-hover/chip:-rotate-12 group-hover/chip:scale-105 motion-reduce:transition-none">
                    <GameGlyph slug={game.slug} className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[0.9375rem] font-semibold leading-5 text-fg">{game.short}</span>
                    <span className="type-small text-fg-subtle">{game.skill}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-6 border-t border-line pt-8 md:flex-row md:items-start md:justify-between md:gap-12">
          <div className="flex max-w-[30rem] items-start gap-3">
            <span className="mt-0.5">
              <SpectrumMark size={28} />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[0.9375rem] font-semibold text-fg">Beyond the Algorithm</span>
              <span className="type-small text-pretty text-fg-subtle">
                Made by two students, {makers}, for EDEX 2026 at International Indian School Jeddah.
              </span>
            </div>
          </div>
          <p className="type-small flex max-w-[27rem] items-start gap-2 text-pretty text-fg-subtle">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            <span>
              Cameras and microphones are read on this device and never recorded. Scoreboards keep only the name you type and your score. A linked phone
              sends readings, never pictures or sound.
            </span>
          </p>
        </div>
      </div>
    </footer>
  );
}
