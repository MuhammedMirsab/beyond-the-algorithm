"use client";

import { Camera, CircleHelp, MousePointer2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GameArt } from "@/components/art/game-art";
import { GameIntro } from "@/components/game/game-intro";
import { GameShell } from "@/components/game/game-shell";
import { useIdle } from "@/lib/idle";
import { AdaptiveButton } from "./adaptive-button";
import { HowItWorksModal } from "./how-it-works";
import type { InputMode } from "./write-screen";

const LEAD = "Write a word in the air with one finger. This computer tracks your hand, then reads your letters by matching their shapes.";

/** The original app's best-results advice (block capitals, a pinch between letters, a gap between words), as steps. */
const STEPS = [
  { title: "Raise one hand", text: "Hold it up in front of the camera." },
  { title: "Point your index finger to write in the air", text: "Big block capitals, one letter at a time, read best." },
  { title: "Pinch your finger and thumb to lift the pen", text: "Pinch between letters, and leave a bigger gap between words." },
];

export function IntroScreen({ onStart, returning = false }: { onStart: (mode: InputMode) => void; returning?: boolean }) {
  const [howOpen, setHowOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The intro is already the reset state; an abandoned modal still closes for the next visitor.
  useIdle(() => setHowOpen(false), { enabled: howOpen });

  // Back from Next player or an idle reset: put keyboard focus at the top, not on a removed button.
  useEffect(() => {
    if (returning) headingRef.current?.focus({ preventScroll: true });
  }, [returning]);

  return (
    <GameShell
      slug="airwrite"
      actions={<AdaptiveButton icon={<CircleHelp />} label="How it works" onClick={() => setHowOpen(true)} />}
    >
      <GameIntro
        slug="airwrite"
        art={<GameArt slug="airwrite" />}
        lead={LEAD}
        steps={STEPS}
        headingRef={headingRef}
        primary={{ label: "Turn on camera", icon: <Camera />, onClick: () => onStart("camera") }}
        secondary={{ label: "Write with mouse or touch", icon: <MousePointer2 />, onClick: () => onStart("pointer") }}
        footnote="Everything happens on this device. The video and your writing are never recorded or sent anywhere."
      />
      <HowItWorksModal open={howOpen} onOpenChange={setHowOpen} usedCamera />
    </GameShell>
  );
}
