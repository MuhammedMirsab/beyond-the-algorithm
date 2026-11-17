import type { Metadata } from "next";
import { gameBySlug } from "@/content/games";
import { ViewfinderGame } from "@/games/viewfinder/game";

const game = gameBySlug("viewfinder");

export const metadata: Metadata = {
  title: game.title,
  description: game.hook,
};

export default function ViewfinderPage() {
  return <ViewfinderGame />;
}
