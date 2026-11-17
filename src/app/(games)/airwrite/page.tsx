import type { Metadata } from "next";
import { gameBySlug } from "@/content/games";
import { AirWriteGame } from "@/games/airwrite/game";

const game = gameBySlug("airwrite");

export const metadata: Metadata = {
  title: game.title,
  description: game.hook,
};

export default function AirWritePage() {
  return <AirWriteGame />;
}
