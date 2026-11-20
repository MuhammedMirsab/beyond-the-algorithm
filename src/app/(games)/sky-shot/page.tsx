import type { Metadata } from "next";
import { SkyShotGame } from "@/games/sky-shot/game";

export const metadata: Metadata = {
  title: "Sky Shot",
  description: "A pixel-art bird shooter played with a finger gun. Hand tracking runs on this laptop.",
};

export default function SkyShotPage() {
  return <SkyShotGame />;
}
