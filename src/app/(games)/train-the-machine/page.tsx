import type { Metadata } from "next";
import { gameBySlug } from "@/content/games";
import { TrainTheMachineGame } from "@/games/train-the-machine/game";

const game = gameBySlug("train-the-machine");

export const metadata: Metadata = {
  title: game.title,
  description: game.hook,
};

export default function TrainTheMachinePage() {
  return <TrainTheMachineGame />;
}
