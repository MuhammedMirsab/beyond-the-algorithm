import { ShieldCheck } from "lucide-react";
import { CURATORS, GAMES, GROUPS, gamesInGroup, type Group } from "@/content/games";
import { GameTile } from "@/components/hub/game-tile";
import { Globe } from "@/components/hub/globe";
import { GLOBE_SAMPLES } from "@/components/hub/globe-config";
import { SpectrumMark } from "@/components/hub/spectrum-mark";
import { cn } from "@/lib/cn";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <Hero />
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-16 px-4 pb-20 sm:px-6 lg:gap-20 lg:px-8">
          {GROUPS.map((group, i) => (
            <GameGroup key={group.id} group={group} index={i} />
          ))}
        </div>
        <About />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-4 px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:px-8">
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
    <section id="top" className="relative mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
      <div className="grid items-center gap-2 pb-8 pt-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:gap-8 lg:pb-12 lg:pt-8">
        <div className="relative z-10 flex flex-col gap-5">
          <h1 className="type-display-1 max-w-[15ch] text-fg">How much can a machine work out about you?</h1>
          <p className="type-body-lg max-w-[32rem] text-fg-muted">
            Nine quick games made by IISJ Computer Science students. Play one, then see exactly how the AI did it.
          </p>
        </div>
        <figure className="relative mx-auto -mb-6 w-[min(100%,22rem)] md:mb-0 md:w-full md:max-w-[24rem]">
          <Globe className="w-full" />
          <figcaption className="type-label mt-1 flex items-center justify-center gap-2 text-fg-subtle">
            <span aria-hidden className="size-1.5 rounded-full bg-fg" />
            Jeddah, in a world of {GLOBE_SAMPLES.toLocaleString("en")} points
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
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-end md:gap-10">
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
          <li key={game.slug} className={cn("flex w-[84%] shrink-0 snap-start sm:w-auto", three && "sm:last:col-span-2 lg:last:col-span-1")}>
            <GameTile game={game} className="w-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function About() {
  const byCurator = (id: "mirsab" | "dilshaan") => GAMES.filter((g) => g.curator === id).map((g) => g.short);
  return (
    <section aria-labelledby="about-title" className="border-t border-line">
      <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:px-8 lg:py-20">
        <div className="flex flex-col gap-4">
          <h2 id="about-title" className="type-title-1 text-fg">
            Made by two students
          </h2>
          <p className="type-body-lg max-w-[34rem] text-fg-muted">
            Beyond the Algorithm is the Computer Science department&apos;s project for EDEX 2026 at International Indian School Jeddah.
          </p>
          <ul className="mt-2 flex flex-col gap-3">
            {(["mirsab", "dilshaan"] as const).map((id) => (
              <li key={id} className="flex flex-col gap-1 rounded-lg bg-surface p-5 shadow-ring">
                <span className="flex items-baseline gap-2">
                  <span className="type-title-3 text-fg">{CURATORS[id].name}</span>
                  <span className="type-small text-fg-subtle">{CURATORS[id].grade}</span>
                </span>
                <span className="type-small text-fg-muted">{byCurator(id).join(", ")}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="type-title-1 flex items-center gap-3 text-fg">
            <ShieldCheck className="size-7 shrink-0 text-success" aria-hidden />
            What happens to your data
          </h2>
          <ul className="flex flex-col gap-4">
            <li className="type-body max-w-[34rem] text-fg-muted">
              <strong className="font-semibold text-fg">Camera games run on this device.</strong> The video is analysed in the browser
              and never recorded or sent anywhere.
            </li>
            <li className="type-body max-w-[34rem] text-fg-muted">
              <strong className="font-semibold text-fg">AirWrite sends only your drawing,</strong> black lines on white, to Google&apos;s
              Gemini so it can read it. Never a photo of you.
            </li>
            <li className="type-body max-w-[34rem] text-fg-muted">
              <strong className="font-semibold text-fg">Scoreboards stay on this screen.</strong> A name only appears if you type one
              in, and every game lets you skip that.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <span className="type-small text-fg-subtle">Beyond the Algorithm · EDEX 2026</span>
        <span className="type-small text-fg-subtle">International Indian School Jeddah · Computer Science</span>
      </div>
    </footer>
  );
}
