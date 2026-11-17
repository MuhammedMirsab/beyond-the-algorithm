import type { Metadata } from "next";
import { gameBySlug } from "@/content/games";
import { HowAiLearnsGame } from "@/games/how-ai-learns/game";

const game = gameBySlug("how-ai-learns");

export const metadata: Metadata = {
  title: game.title,
  description: game.hook,
};

export default function HowAiLearnsPage() {
  return <HowAiLearnsGame />;
}
