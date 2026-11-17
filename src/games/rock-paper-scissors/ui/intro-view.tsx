"use client";

import { Camera, Keyboard, Pointer } from "lucide-react";
import { GameArt } from "@/components/art/game-art";
import { PRIVACY_LINE } from "@/components/game/camera-notice";
import { GameIntro } from "@/components/game/game-intro";
import { Segmented } from "@/components/ui/controls";
import type { Difficulty } from "../engine/types";
import { TARGET_WINS } from "../match-controller";
import { useTouchScreen, withoutCameraLabel } from "./use-touch-screen";

/** What each level really changes in the predictor (see engine/aiPredictor.ts). */
const DIFFICULTY_TEXT: Record<Difficulty, string> = {
  easy: "It mostly counts your favourite move, and often mixes up its guess.",
  normal: "It also watches what you play after each move, and after you lose.",
  hard: "It also spots longer patterns, and changes fast when you do.",
};

export function IntroView({
  difficulty,
  onDifficultyChange,
  onCamera,
  onKeys,
}: {
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onCamera: () => void;
  onKeys: () => void;
}) {
  const touch = useTouchScreen();

  return (
    <GameIntro
      slug="rock-paper-scissors"
      art={<GameArt slug="rock-paper-scissors" />}
      steps={[
        { title: "Show one hand to the camera" },
        { title: "On Shoot, make rock, paper or scissors" },
        { title: "It picks its move before you throw, from your habits" },
      ]}
      primary={{ label: "Turn on camera", icon: <Camera />, onClick: onCamera }}
      secondary={{ label: withoutCameraLabel(touch), icon: touch ? <Pointer /> : <Keyboard />, onClick: onKeys }}
      footnote={`${PRIVACY_LINE} It forgets your moves when the next player starts.`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Segmented<Difficulty>
            label="Difficulty"
            value={difficulty}
            onValueChange={onDifficultyChange}
            options={[
              { value: "easy", label: "Easy" },
              { value: "normal", label: "Normal" },
              { value: "hard", label: "Hard" },
            ]}
          />
          <span className="type-small text-fg-subtle">First to {TARGET_WINS} wins</span>
        </div>
        <p className="type-small max-w-[34rem] text-fg-muted">{DIFFICULTY_TEXT[difficulty]}</p>
      </div>
    </GameIntro>
  );
}
