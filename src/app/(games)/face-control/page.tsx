import type { Metadata } from "next";
import { gameBySlug } from "@/content/games";
import FaceControlGame from "@/games/face-control/game";

const game = gameBySlug("face-control");

export const metadata: Metadata = {
  title: game.title,
  description: game.hook,
};

export default function FaceControlPage() {
  return <FaceControlGame />;
}
