import Link from "next/link";
import { ArrowRight, Camera, Mic, Smartphone, Wifi } from "lucide-react";
import type { ReactNode } from "react";
import { gamePath, type Game, type Need } from "@/content/games";
import { GameArt } from "@/components/art/game-art";
import { cn } from "@/lib/cn";

const NEED_ICON: Record<Need, { icon: ReactNode; label: string }> = {
  camera: { icon: <Camera aria-hidden />, label: "Uses the camera" },
  microphone: { icon: <Mic aria-hidden />, label: "Uses the microphone" },
  motion: { icon: <Smartphone aria-hidden />, label: "Uses motion sensors" },
  internet: { icon: <Wifi aria-hidden />, label: "Needs internet" },
};

/**
 * A game cartridge: the whole card is one link. Hover moves the art (it shows
 * what the game does); the card itself stays put.
 */
export function GameTile({ game, extra, className }: { game: Game; extra?: ReactNode; className?: string }) {
  const needs = game.needs.filter((n) => n !== "microphone");
  return (
    <Link
      href={gamePath(game.slug)}
      data-game={game.slug}
      className={cn(
        "group/tile tile-surface grain relative flex min-h-[27rem] flex-col lg:min-h-[30rem] overflow-hidden rounded-xl",
        "transition-transform duration-150 ease-out active:scale-[0.985]",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fg",
        className,
      )}
    >
      <div className="relative z-[2] min-h-0 flex-1">
        <GameArt slug={game.slug} className="absolute inset-0" />
      </div>

      <div className="relative z-[2] flex flex-col gap-2 px-5 pb-5 pt-1 sm:px-6 sm:pb-6">
        <span className="type-label text-game-ink/70">{game.skill}</span>
        <h3 className="type-title-2 text-game-ink">{game.title}</h3>
        <p className="type-small max-w-[34ch] text-game-ink/80">{game.hook}</p>

        <div className="mt-3 flex items-end justify-between gap-3">
          <ul className="flex flex-wrap items-center gap-1.5" aria-label="What you need">
            <li className="inline-flex h-7 items-center rounded-full bg-game-ink/[0.12] px-2.5 text-[0.8125rem] font-semibold text-game-ink">
              {game.minutes} min
            </li>
            {needs.map((need) => (
              <li
                key={need}
                title={NEED_ICON[need].label}
                className="grid size-7 place-items-center rounded-full bg-game-ink/[0.12] text-game-ink [&_svg]:size-3.5"
              >
                {NEED_ICON[need].icon}
                <span className="sr-only">{NEED_ICON[need].label}</span>
              </li>
            ))}
            {game.bestOn === "phone" ? (
              <li className="inline-flex h-7 items-center gap-1.5 rounded-full bg-game-ink/[0.12] px-2.5 text-[0.8125rem] font-semibold text-game-ink [&_svg]:size-3.5">
                <Smartphone aria-hidden />
                Best on a phone
              </li>
            ) : null}
          </ul>
          <span
            aria-hidden
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-full bg-game-ink text-game",
              "transition-transform duration-200 ease-out [@media(hover:hover)_and_(pointer:fine)]:group-hover/tile:translate-x-0.5",
            )}
          >
            <ArrowRight className="size-5" strokeWidth={2.5} />
          </span>
        </div>
        {extra}
      </div>
    </Link>
  );
}
