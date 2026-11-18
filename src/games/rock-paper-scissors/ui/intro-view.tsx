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
  normal: "It also watches what you throw after each move, and after you win or lose.",
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
      art={<GameArt slug="rock-paper-scissors" mode="intro" />}
      steps={[
        { title: "Throw rock, paper or scissors on Shoot" },
        { title: "It locks its move before you throw" },
        { title: `It learns your habits. First to ${TARGET_WINS} wins` },
      ]}
      primary={{ label: "Turn on camera", icon: <Camera />, onClick: onCamera }}
      secondary={{ label: withoutCameraLabel(touch), icon: touch ? <Pointer /> : <Keyboard />, onClick: onKeys }}
      keys={[
        { keys: ["Space"], label: "Start a round" },
        { keys: ["R", "P", "S"], label: "Throw without the camera" },
      ]}
      footnote={`${PRIVACY_LINE} It forgets your moves when the next player starts.`}
      below={
        // Progressive disclosure: the level is there for anyone who wants it, after the one big button.
        <div className="flex flex-col gap-2.5 border-t border-line pt-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span aria-hidden className="type-small font-semibold text-fg-muted">
              Difficulty
            </span>
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
          </div>
          <p className="type-small max-w-[34rem] text-fg-subtle">{DIFFICULTY_TEXT[difficulty]}</p>
        </div>
      }
    />
  );
}
