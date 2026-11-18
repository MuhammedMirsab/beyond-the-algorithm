"use client";

import { Info, RotateCcw } from "lucide-react";
import { useState } from "react";
import { GAMES, type GameSlug } from "@/content/games";
import { GameArt } from "@/components/art/game-art";
import { GameIntro } from "@/components/game/game-intro";
import { GameShell } from "@/components/game/game-shell";
import { Button, IconButton } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";

/** Design QA: the shared intro screen for any game, with its real intro loop. */
export function IntroPreview() {
  const [slug, setSlug] = useState<GameSlug>("face-control");
  return (
    <GameShell
      slug={slug}
      sound
      actions={
        <>
          <Button variant="ghost" icon={<Info />} className="hidden sm:inline-flex">
            How it works
          </Button>
          <IconButton label="Restart" icon={<RotateCcw />} variant="ghost" />
        </>
      }
    >
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2 sm:px-6 lg:px-8">
        {GAMES.map((g) => (
          <ToggleChip key={g.slug} pressed={g.slug === slug} onClick={() => setSlug(g.slug)}>
            {g.short}
          </ToggleChip>
        ))}
      </div>
      <GameIntro
        slug={slug}
        art={<GameArt slug={slug} mode="intro" />}
        steps={[
          { title: "Turn on your camera", text: "Video stays on this laptop." },
          { title: "Show it your face", text: "Look straight, tilt, then open your mouth." },
          { title: "Tilt to roll, open your mouth to jump" },
        ]}
        primary={{ label: "Turn on camera" }}
        secondary={{ label: "Play with keyboard" }}
        footnote="Three levels, about three minutes. Nothing is recorded."
      />
    </GameShell>
  );
}
