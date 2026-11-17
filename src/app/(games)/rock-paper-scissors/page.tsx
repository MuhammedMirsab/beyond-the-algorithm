import type { Metadata } from "next";
import { gameBySlug } from "@/content/games";
import { RockPaperScissorsGame } from "@/games/rock-paper-scissors/game";

const game = gameBySlug("rock-paper-scissors");

export const metadata: Metadata = {
  title: game.title,
  description: game.hook,
};

export default function RockPaperScissorsPage() {
  return <RockPaperScissorsGame />;
}
