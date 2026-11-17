"use client";

import { GameArt } from "@/components/art/game-art";
import { GameIntro } from "@/components/game/game-intro";
import { LinkHandoff } from "../link/link-panel";

export function PhoneIntro({ onStart }: { onStart: () => void }) {
  return (
    <GameIntro
      slug="phone"
      art={<GameArt slug="phone" />}
      steps={[
        { title: "Pick a sensor", text: "Motion, GPS, camera, microphone and four more." },
        { title: "Try it", text: "Live on your phone. Simulated where a laptop has no sensor." },
        { title: "See what an app can work out about you from it" },
      ]}
      primary={{ label: "Open the sensor lab", onClick: onStart }}
      footnote="Nothing is recorded, saved or uploaded. Each sensor turns off when you leave its test."
      below={
        // Only on the booth laptop: phones are already where the real sensors are.
        <div className="hidden md:pointer-fine:block">
          <LinkHandoff size={96} />
        </div>
      }
    />
  );
}
