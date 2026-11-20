"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Volume2, VolumeX } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { gameBySlug, type GameSlug } from "@/content/games";
import { IconButton } from "@/components/ui/button";
import { GameGlyph } from "@/components/art/game-glyph";
import { useSoundOn } from "@/lib/sound";
import { GameSlugContext } from "@/lib/game-context";
import { openPage } from "@/lib/play-tracker";
import { cn } from "@/lib/cn";

/**
 * The frame every game sits in. Sets data-game so --game tokens resolve,
 * gives a consistent way back to the arcade, and a slot for game actions.
 *
 * immersive: the header floats over full-bleed content (camera games).
 *
 * B goes back to the arcade, same as the Arcade link. Deliberately unlisted:
 * it's for booth staff. A game that uses B itself (Real or AI's answer key)
 * claims it with preventDefault, and typing in a field never triggers it.
 */
export function GameShell({
  slug,
  children,
  actions,
  immersive = false,
  sound = false,
  className,
}: {
  slug: GameSlug;
  children: ReactNode;
  /** Right side of the header: e.g. "How it works", restart. Keep it to 2. */
  actions?: ReactNode;
  immersive?: boolean;
  /** Show the arcade-wide sound switch (games that make sound). */
  sound?: boolean;
  className?: string;
}) {
  const game = gameBySlug(slug);
  useBackKey();
  // Analytics: one session per player of this game (see src/lib/play-tracker.ts).
  useEffect(() => openPage(slug), [slug]);
  return (
    <GameSlugContext.Provider value={slug}>
    <div data-game={slug} className={cn("relative flex min-h-dvh flex-col bg-canvas", className)}>
      <header
        className={cn(
          "z-30 flex h-16 shrink-0 items-center gap-3 px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:px-8",
          immersive
            ? // Strong enough at text height to keep the header readable over a bright camera picture.
              "absolute inset-x-0 top-0 bg-linear-to-b from-canvas/95 via-canvas/75 to-transparent"
            : "relative",
        )}
      >
        <Link
          href="/"
          className={cn(
            "group/back -ml-2 inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-2.5 text-[0.9375rem] font-semibold text-fg-muted sm:pr-4",
            "transition-[background-color,color,scale] duration-150 ease-out hover:bg-fg/[0.07] hover:text-fg active:scale-[0.97]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
          )}
        >
          <ArrowLeft className="size-[18px] transition-transform duration-200 ease-out group-hover/back:-translate-x-0.5" />
          <span className="sr-only sm:not-sr-only">Arcade</span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span aria-hidden className="h-5 w-px shrink-0 bg-line-strong" />
          <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-game text-game-ink">
            <GameGlyph slug={slug} className="size-[18px]" />
          </span>
          <span className="truncate text-[0.9375rem] font-semibold text-fg">{game.title}</span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {sound ? <SoundToggle /> : null}
        </div>
      </header>
      <main className="relative flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
    </GameSlugContext.Provider>
  );
}

/** Where typing happens: B is a letter there, not a shortcut. */
const TYPING = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/** Booth staff: B leaves the game for the arcade hub. Not shown on screen. */
function useBackKey() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key !== "b" && e.key !== "B") return;
      if (e.target instanceof Element && e.target.closest(TYPING)) return;
      // Decide once every other listener has seen the key: a game's own handler
      // may be registered after this one and claim B with preventDefault.
      window.setTimeout(() => {
        if (!e.defaultPrevented) router.push("/");
      }, 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}

export function SoundToggle() {
  const [on, setOn] = useSoundOn();
  return (
    <IconButton
      label={on ? "Turn sound off" : "Turn sound on"}
      icon={on ? <Volume2 /> : <VolumeX />}
      variant="ghost"
      onClick={() => setOn(!on)}
    />
  );
}
