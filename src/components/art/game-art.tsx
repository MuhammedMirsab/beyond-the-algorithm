import type { ComponentType } from "react";
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
import { PhoneSensorsLoop } from "./sensor-art";
import { cn } from "@/lib/cn";

/**
 * Where an illustration is shown.
 * - "tile": the hub tile. A still picture with one hover motion (inside a `group/tile`).
 * - "intro": the game's own first screen. Plays a short looping breakdown of
 *   how the game works on its own, no hover needed: pauses when off screen and
 *   holds a still frame under reduced motion.
 */
export type ArtMode = "tile" | "intro";

export interface ArtProps {
  mode?: ArtMode;
}

/** The tile: the phone exploded into its layers (hover spreads them). The intro: its sensors light up in turn and give something away. */
function PhoneArt({ mode = "tile" }: ArtProps) {
  if (mode === "intro") return <PhoneSensorsLoop />;
  return <IsoPhone colors={ON_TILE} explode={0.85} hoverExplode className="size-full" />;
}

/** Each game's illustration. An art component that ignores `mode` simply looks the same in both places. */
const ART: Record<GameSlug, ComponentType<ArtProps>> = {
  "mind-reader": MindReaderArt,
  "rock-paper-scissors": RpsArt,
  "face-control": FaceControlArt,
  airwrite: AirWriteArt,
  viewfinder: ViewfinderArt,
  "air-studio": AirStudioArt,
  "train-the-machine": TrainArt,
  "how-ai-learns": LearnsArt,
  "real-or-ai": RealOrAiArt,
  phone: PhoneArt,
};

/**
 * The illustration for each game, shared by the hub tile and the game's intro
 * panel so both always match. Drawn in game-ink on the game colour.
 */
export function GameArt({ slug, mode = "tile", className }: { slug: GameSlug; mode?: ArtMode; className?: string }) {
  const Art = ART[slug];
  return (
    <div className={cn("grid size-full place-items-center p-3 text-game-ink sm:p-5", className)}>
      <Art mode={mode} />
    </div>
  );
}
