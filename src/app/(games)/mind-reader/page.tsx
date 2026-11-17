import type { Metadata } from "next";
import { gameBySlug } from "@/content/games";
import { MindReaderGame } from "@/games/mind-reader/game";

const game = gameBySlug("mind-reader");

export const metadata: Metadata = {
  title: game.title,
  description: game.hook,
};

export default function MindReaderPage() {
  return <MindReaderGame />;
}
