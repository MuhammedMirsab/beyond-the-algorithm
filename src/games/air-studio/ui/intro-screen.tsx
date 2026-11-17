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

const LEAD = "Play five instruments in the air. The camera finds the points of your hands, and the way they move becomes music.";

const STEPS = [
  { title: "Show both hands", text: "A quick check makes sure the camera can see them." },
  { title: "Pick an instrument and play", text: "Strike, strum or dip a fingertip in the air." },
  { title: "Record a take or try a lesson", text: "Lessons score your timing against the beat." },
];

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
        art={<GameArt slug="air-studio" />}
        lead={LEAD}
        steps={STEPS}
        headingRef={headingRef}
        primary={{ label: "Turn on camera", icon: <Camera />, onClick: () => onStart("camera") }}
        secondary={{ label: "Play with the mouse", icon: <MousePointer2 />, onClick: () => onStart("mouse") }}
        footnote={
          <span className="flex items-start gap-1.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            Hand tracking runs on this device. No video is recorded or uploaded, and a take you record vanishes at Next player.
          </span>
        }
      />
      {story ? <HowItWorksModal open={howOpen} onOpenChange={setHowOpen} story={story} /> : null}
    </GameShell>
  );
}
