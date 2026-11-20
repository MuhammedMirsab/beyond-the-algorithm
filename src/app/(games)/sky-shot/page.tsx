import type { Metadata } from "next";
import { gameBySlug } from "@/content/games";
import { SkyShotGame } from "@/games/sky-shot/game";

const game = gameBySlug("sky-shot");

export const metadata: Metadata = {
  title: game.title,
  description: game.hook,
};

export default function SkyShotPage() {
  return <SkyShotGame />;
}
