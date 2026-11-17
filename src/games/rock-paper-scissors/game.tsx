"use client";

import { Keyboard, Pointer } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { CameraProblem, CameraPrompt, CameraWaiting } from "@/components/game/camera-notice";
import { GameShell } from "@/components/game/game-shell";
import { NextPlayerButton } from "@/components/game/next-player";
import { Button } from "@/components/ui/button";
import { useIdle } from "@/lib/idle";
import type { Difficulty, Gesture } from "./engine/types";
import { isRoundLive, MatchController, type MatchView } from "./match-controller";
import { CameraView } from "./ui/camera-view";
import { IntroView } from "./ui/intro-view";
import { MatchPanel } from "./ui/match-panel";
import { ResultsView } from "./ui/results-view";
import { RoundStrip } from "./ui/round-strip";
import { ThrowPad } from "./ui/throw-pad";
import { useTouchScreen, withoutCameraLabel } from "./ui/use-touch-screen";
import { HandTracker, INITIAL_TRACKER_STATUS, type TrackerStatus } from "./vision/handTracker";

type Screen = "intro" | "play" | "results";

const KEY_TO_GESTURE: Record<string, Gesture> = { r: "rock", p: "paper", s: "scissors" };

const getServerTrackerStatus = () => INITIAL_TRACKER_STATUS;

/** Space on a focused control is that control's own click; only take it when nothing else wants it. */
function ownsSpace(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest("button, a, input, textarea, select, [role='button'], [role='tab'], [role='switch'], [contenteditable='true']") !== null
  );
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select") !== null);
}

/** A centred camera state (waiting, problem) in place of the arena. */
function Centered({ children }: { children?: ReactNode }) {
  return <div className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6">{children}</div>;
}

export function RockPaperScissorsGame() {
  const [tracker] = useState(() => new HandTracker());
  const [controller] = useState(() => new MatchController());
  const status = useSyncExternalStore(tracker.subscribe, tracker.getStatus, getServerTrackerStatus);
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [screen, setScreen] = useState<Screen>("intro");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const touch = useTouchScreen();

  // Stop the camera, cancel the loop and timers, close the model and the audio.
  useEffect(() => {
    return () => {
      tracker.dispose();
      controller.dispose();
    };
  }, [tracker, controller]);

  // Camera frames drive the throw at Shoot.
  useEffect(() => tracker.onFrame((frame) => controller.onFrame(frame)), [tracker, controller]);

  const cameraReady = status.camera === "live" && status.model === "ready";
  const ready = view.inputMode === "keys" || cameraReady;
  const live = isRoundLive(view);

  const toTop = () => window.scrollTo({ top: 0 });

  const playWithCamera = () => {
    controller.unlockAudio();
    controller.setInputMode("camera");
    controller.newMatch(difficulty);
    tracker.start();
    setScreen("play");
    toTop();
  };

  const playWithKeys = () => {
    controller.unlockAudio();
    controller.setInputMode("keys");
    controller.newMatch(difficulty);
    tracker.stop();
    setScreen("play");
    toTop();
  };

  /** Next player: the AI forgets this visitor, scores reset, the camera goes off. */
  const nextPlayer = () => {
    controller.forget("normal");
    tracker.stop();
    setDifficulty("normal");
    setScreen("intro");
    toTop();
  };

  /** Rematch: same visitor, so the AI keeps what it learned. */
  const rematch = () => {
    controller.unlockAudio();
    controller.newMatch(difficulty);
    if (view.inputMode === "camera" && status.camera !== "live") tracker.start();
    setScreen("play");
    toTop();
  };

  const startRound = () => {
    controller.unlockAudio();
    controller.startRound();
  };

  const seeResults = () => {
    setScreen("results");
    toTop();
  };

  const switchToCamera = () => {
    controller.unlockAudio();
    controller.setInputMode("camera");
    tracker.start();
  };

  const switchToKeys = () => {
    controller.setInputMode("keys");
    tracker.stop();
  };

  // Keyboard: Space starts a round (or opens the results), R / P / S throw.
  useEffect(() => {
    if (screen !== "play") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
      if (event.key === " " || event.code === "Space") {
        if (ownsSpace(event.target)) return;
        event.preventDefault();
        if (event.repeat) return;
        if (controller.getSnapshot().match.phase === "match_complete") {
          setScreen("results");
          window.scrollTo({ top: 0 });
          return;
        }
        if (!ready) return;
        controller.unlockAudio();
        controller.startRound();
        return;
      }
      const gesture = KEY_TO_GESTURE[event.key.toLowerCase()];
      if (gesture && !event.repeat) {
        controller.unlockAudio();
        controller.throwMove(gesture);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen, ready, controller]);

  // Booth: an abandoned intro, result or between-rounds screen resets for the next visitor.
  // Never during a round (a camera-only throw sends no input events).
  useIdle(nextPlayer, { enabled: screen !== "play" || !live });

  return (
    <GameShell
      slug="rock-paper-scissors"
      sound
      actions={
        screen === "play" ? <NextPlayerButton onClick={nextPlayer} /> : null
      }
    >
      {screen === "intro" ? (
        <IntroView difficulty={difficulty} onDifficultyChange={setDifficulty} onCamera={playWithCamera} onKeys={playWithKeys} />
      ) : null}

      {screen === "play" ? (
        <PlayScreen
          view={view}
          status={status}
          tracker={tracker}
          ready={ready}
          live={live}
          keysLabel={withoutCameraLabel(touch)}
          keysIcon={touch ? <Pointer /> : <Keyboard />}
          onStart={startRound}
          onSeeResults={seeResults}
          onThrow={(gesture) => {
            controller.unlockAudio();
            controller.throwMove(gesture);
          }}
          onUseCamera={switchToCamera}
          onUseKeys={switchToKeys}
        />
      ) : null}

      {screen === "results" ? (
        <ResultsView view={view} difficulty={difficulty} onRematch={rematch} onNextPlayer={nextPlayer} />
      ) : null}
    </GameShell>
  );
}

function PlayScreen({
  view,
  status,
  tracker,
  ready,
  live,
  keysLabel,
  keysIcon,
  onStart,
  onSeeResults,
  onThrow,
  onUseCamera,
  onUseKeys,
}: {
  view: MatchView;
  status: TrackerStatus;
  tracker: HandTracker;
  ready: boolean;
  live: boolean;
  keysLabel: string;
  keysIcon: ReactNode;
  onStart: () => void;
  onSeeResults: () => void;
  onThrow: (gesture: Gesture) => void;
  onUseCamera: () => void;
  onUseKeys: () => void;
}) {
  const playWithoutCamera = (
    <Button variant="ghost" size="lg" icon={keysIcon} onClick={onUseKeys}>
      {keysLabel}
    </Button>
  );

  if (view.inputMode === "camera") {
    if (status.camera === "error" || status.model === "error") {
      return (
        <Centered>
          <CameraProblem issue={status.issue ?? "unknown"} onRetry={() => tracker.start()} alternative={playWithoutCamera} />
        </Centered>
      );
    }
    if (status.camera === "waiting") {
      return (
        <Centered>
          <CameraWaiting />
        </Centered>
      );
    }
    // The first moments of a start (no box shown yet, often already allowed): keep the screen calm.
    if (status.camera === "starting") return <Centered />;
    if (status.camera === "off") {
      return (
        <Centered>
          <CameraPrompt
            text="The AI reads rock, paper or scissors from your hand. Turn the camera back on to keep playing."
            onAllow={onUseCamera}
            alternative={playWithoutCamera}
          />
        </Centered>
      );
    }
  }

  const detecting = live && view.match.phase === "detecting";
  const notReadyText = status.model === "ready" ? undefined : "Loading the hand model";

  // Phones: your hand, then the match, then the last rounds.
  // Tablet and up: your hand with the last rounds under it on the left, the match on the right.
  return (
    <div className="mx-auto grid w-full max-w-[69rem] items-start gap-8 px-4 pb-12 pt-2 sm:px-6 md:grid-cols-2 md:grid-rows-[auto_1fr] md:gap-x-8 md:gap-y-6 lg:gap-x-10 lg:px-8 lg:pt-4">
      <div className="min-w-0 md:col-start-1 md:row-start-1">
        {view.inputMode === "camera" ? (
          <CameraView tracker={tracker} model={status.model} throwing={live || view.missed} />
        ) : (
          <ThrowPad
            enabled={live}
            shoot={detecting}
            selected={view.pendingThrow}
            onThrow={onThrow}
            onUseCamera={onUseCamera}
            canSwitch={!live && view.match.phase !== "match_complete"}
          />
        )}
      </div>
      <div className="min-w-0 md:col-start-2 md:row-span-2 md:row-start-1">
        <MatchPanel
          view={view}
          ready={ready}
          notReadyText={view.inputMode === "camera" ? notReadyText : undefined}
          onStart={onStart}
          onSeeResults={onSeeResults}
        />
      </div>
      {view.match.matchRounds.length > 0 ? (
        <section aria-labelledby="rps-last-rounds" className="flex min-w-0 flex-col gap-3 md:col-start-1 md:row-start-2">
          <h2 id="rps-last-rounds" className="type-label text-fg-subtle">
            Last rounds
          </h2>
          <RoundStrip rounds={view.match.matchRounds} />
        </section>
      ) : null}
    </div>
  );
}
