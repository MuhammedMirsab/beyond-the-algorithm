import type { GameSlug } from "@/content/games";
import { GameGlyph } from "./game-glyph";
import { cn } from "@/lib/cn";

/**
 * The illustration for each game, shared by the hub tile and the game's intro
 * panel so both always match. Drawn in game-ink on the game colour.
 *
 * Placeholder: the full illustrations replace this component body; the API
 * (slug, className) stays the same.
 */
export function GameArt({ slug, className }: { slug: GameSlug; className?: string }) {
  return (
    <div className={cn("grid size-full place-items-center text-game-ink", className)}>
      <GameGlyph slug={slug} className="size-1/3 opacity-90" />
    </div>
  );
}
