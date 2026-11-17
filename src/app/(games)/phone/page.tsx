import type { Metadata } from "next";
import { gameBySlug } from "@/content/games";
import { PhoneGame } from "@/games/phone/game";

const game = gameBySlug("phone");

export const metadata: Metadata = {
  title: game.title,
  description: game.hook,
};

export default function PhonePage() {
  return <PhoneGame />;
}
