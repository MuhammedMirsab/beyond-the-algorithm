import type { GameSlug } from "@/content/games";
import { AirStudioArt } from "./games/air-studio-art";
import { AirWriteArt } from "./games/airwrite-art";
import { FaceControlArt } from "./games/face-control-art";
import { LearnsArt } from "./games/learns-art";
import { MindReaderArt } from "./games/mind-reader-art";
import { RealOrAiArt } from "./games/real-or-ai-art";
import { RpsArt } from "./games/rps-art";
import { TrainArt } from "./games/train-art";
import { ViewfinderArt } from "./games/viewfinder-art";
import { IsoPhone, ON_TILE } from "./iso-phone";
import { cn } from "@/lib/cn";

/**
 * The illustration for each game, shared by the hub tile and the game's intro
 * panel so both always match. Drawn in game-ink on the game colour; each one
 * has a single hover motion (inside a `group/tile`) that shows what the game does.
 */
export function GameArt({ slug, className }: { slug: GameSlug; className?: string }) {
  return (
    <div className={cn("grid size-full place-items-center p-3 text-game-ink sm:p-5", className)}>
      <Illustration slug={slug} />
    </div>
  );
}

function Illustration({ slug }: { slug: GameSlug }) {
  switch (slug) {
    case "mind-reader":
      return <MindReaderArt />;
    case "rock-paper-scissors":
      return <RpsArt />;
    case "face-control":
      return <FaceControlArt />;
    case "airwrite":
      return <AirWriteArt />;
    case "viewfinder":
      return <ViewfinderArt />;
    case "air-studio":
      return <AirStudioArt />;
    case "train-the-machine":
      return <TrainArt />;
    case "how-ai-learns":
      return <LearnsArt />;
    case "real-or-ai":
      return <RealOrAiArt />;
    case "phone":
      return <IsoPhone colors={ON_TILE} explode={0.85} hoverExplode className="size-full" />;
  }
}
