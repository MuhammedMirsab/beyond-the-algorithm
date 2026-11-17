import type { Metadata } from "next";
import { gameBySlug } from "@/content/games";
import { AirStudioGame } from "@/games/air-studio/game";

const game = gameBySlug("air-studio");

export const metadata: Metadata = {
  title: game.title,
  description: game.hook,
};

export default function AirStudioPage() {
  return <AirStudioGame />;
}
