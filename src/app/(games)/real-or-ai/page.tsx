import type { Metadata } from "next";
import { gameBySlug } from "@/content/games";
import { RealOrAiGame } from "@/games/real-or-ai/game";

const game = gameBySlug("real-or-ai");

export const metadata: Metadata = {
  title: game.title,
  description: game.hook,
};

export default function RealOrAiPage() {
  return <RealOrAiGame />;
}
