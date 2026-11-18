"use client";

import { Camera, CircleHelp, MousePointer2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GameArt } from "@/components/art/game-art";
import { GameIntro } from "@/components/game/game-intro";
import { GameShell } from "@/components/game/game-shell";
import { useIdle } from "@/lib/idle";
import type { InputMode, Story, StudioSession } from "../play/session";
import { AdaptiveButton } from "./adaptive-button";
import { HowItWorksModal } from "./how-it-works";

const LEAD = "Play percussion, piano and more in the air. The camera finds 21 points on each of your hands, and the way they move becomes music.";

const STEPS = [
  { title: "Raise your hands", text: "The camera finds them by itself." },
  { title: "Hit the air over a pad", text: "A quick move down plays it. Faster is louder." },
  { title: "Then try piano, synth or a band", text: "Record a take, or try a lesson with a score." },
];

/**
 * The first screen: one tap to playing. "Play with your hands" turns on the
 * camera and the percussion together and goes straight to the stage; there is no
 * setup in between. The art plays a wordless loop of how it works.
 */
export function IntroScreen({ session, onStart, returning = false }: { session: StudioSession; onStart: (mode: InputMode) => void; returning?: boolean }) {
  const [howOpen, setHowOpen] = useState(false);
  const [story, setStory] = useState<Story | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The intro is already the reset state; an abandoned modal still closes for the next visitor.
  useIdle(() => setHowOpen(false), { enabled: howOpen });

  // Back from Next player or an idle reset: keyboard focus starts at the top.
  useEffect(() => {
    if (returning) headingRef.current?.focus({ preventScroll: true });
  }, [returning]);

  return (
    <GameShell
      slug="air-studio"
      sound
      actions={
        <AdaptiveButton
          icon={<CircleHelp />}
          label="How it works"
          popup
          onClick={() => {
            setStory(session.story());
            setHowOpen(true);
          }}
        />
      }
    >
      <GameIntro
        slug="air-studio"
        art={<GameArt slug="air-studio" mode="intro" />}
        lead={LEAD}
        steps={STEPS}
        headingRef={headingRef}
        primary={{ label: "Play with your hands", icon: <Camera />, onClick: () => onStart("camera") }}
        secondary={{ label: "Play with the mouse", icon: <MousePointer2 />, onClick: () => onStart("mouse") }}
        footnote={
          <span className="flex items-start gap-1.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            Hand tracking runs on this computer. No video is recorded or uploaded, and a take you record is gone at Next player.
          </span>
        }
      />
      {story ? <HowItWorksModal open={howOpen} onOpenChange={setHowOpen} story={story} /> : null}
    </GameShell>
  );
}
