"use client";

import { Camera, Keyboard, Pointer } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { CameraProblem, CameraPrompt, CameraWaiting } from "@/components/game/camera-notice";
import { GameShell } from "@/components/game/game-shell";
import { NextPlayerButton } from "@/components/game/next-player";
import { Button } from "@/components/ui/button";
import { useIdle } from "@/lib/idle";
import { track } from "@/lib/play-tracker";
import { countHabits } from "./engine/insights";
import type { Difficulty, Gesture, RoundOutcome } from "./engine/types";
import { isRoundLive, MatchController, TARGET_WINS, type MatchView } from "./match-controller";
import { ActionBar } from "./ui/action-bar";
import { aiCardState, AiPanel, dealKey, GuessBlock, guessInfo, Notes } from "./ui/ai-panel";
import { CameraView } from "./ui/camera-view";
import { GESTURE_LABEL } from "./ui/gesture-icon";
import { IntroView } from "./ui/intro-view";
import { MatchHeader, OUTCOME_COPY } from "./ui/match-header";
import { AiCard, PlayerCard, type PlayerCardState } from "./ui/move-cards";
import { ResultsView } from "./ui/results-view";
import { RoundStrip } from "./ui/round-strip";
import { ThrowPad } from "./ui/throw-pad";
import { useTouchScreen, useWideLayout, withoutCameraLabel } from "./ui/use-touch-screen";
import { HandTracker, INITIAL_TRACKER_STATUS, type TrackerStatus } from "./vision/handTracker";

type Screen = "intro" | "play" | "results";

const KEY_TO_GESTURE: Record<string, Gesture> = { r: "rock", p: "paper", s: "scissors" };

const OUTCOME_STEP: Record<RoundOutcome, string> = { player_win: "win", ai_win: "ai", draw: "draw" };

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

  // Analytics: each scored round, each missed throw, and the match result, once each.
  useEffect(() => {
    let lastRound = controller.getSnapshot().match.lastResolvedRound?.id ?? null;
    let missed = controller.getSnapshot().missed;
    let endedMatch: string | null = null;
    return controller.subscribe(() => {
      const { match, missed: nowMissed } = controller.getSnapshot();
      if (nowMissed && !missed) track.step("missed");
      missed = nowMissed;
      const round = match.lastResolvedRound;
      if (round && round.id !== lastRound) track.step(`round-${round.roundNumber}`, OUTCOME_STEP[round.outcome]);
      lastRound = round?.id ?? null;
      if (match.phase === "match_complete" && endedMatch !== match.matchId) {
        endedMatch = match.matchId;
        track.end({
          score: match.playerScore,
          outOf: TARGET_WINS,
          won: match.winner === "player",
          label: `${match.playerScore}-${match.aiScore} in ${match.matchRounds.length} rounds`,
        });
      }
    });
  }, [controller]);

  // Camera frames drive the throw at Shoot.
  useEffect(() => tracker.onFrame((frame) => controller.onFrame(frame)), [tracker, controller]);

  const cameraReady = status.camera === "live" && status.model === "ready";
  const ready = view.inputMode === "keys" || cameraReady;
  const live = isRoundLive(view);

  // The next round starts by itself after a reveal, only while the arena can play.
  useEffect(() => {
    controller.setAutoNext(screen === "play" && ready);
  }, [controller, screen, ready]);

  const toTop = () => window.scrollTo({ top: 0 });

  const playWithCamera = () => {
    track.start("camera", difficulty);
    controller.unlockAudio();
    controller.setInputMode("camera");
    controller.newMatch(difficulty);
    tracker.start();
    setScreen("play");
    toTop();
  };

  const playWithKeys = () => {
    track.start(touch ? "touch" : "keys", difficulty);
    controller.unlockAudio();
    controller.setInputMode("keys");
    controller.newMatch(difficulty);
    tracker.stop();
    setScreen("play");
    toTop();
  };

  /** Next player: the AI forgets this visitor, scores reset, the camera goes off. */
  const nextPlayer = () => {
    track.nextPlayer();
    controller.forget("normal");
    tracker.stop();
    setDifficulty("normal");
    setScreen("intro");
    toTop();
  };

  /** Rematch: same visitor, so the AI keeps what it learned. */
  const rematch = () => {
    track.start(view.inputMode === "camera" ? "camera" : touch ? "touch" : "keys", difficulty);
    track.step("rematch");
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

  const chooseDifficulty = (next: Difficulty) => {
    track.step("difficulty", next);
    setDifficulty(next);
  };

  const seeResults = () => {
    setScreen("results");
    toTop();
  };

  const switchToCamera = () => {
    track.step("input", "camera");
    controller.unlockAudio();
    controller.setInputMode("camera");
    tracker.start();
  };

  const switchToKeys = () => {
    track.step("input", touch ? "touch" : "keys");
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
    <GameShell slug="rock-paper-scissors" sound actions={screen === "play" ? <NextPlayerButton onClick={nextPlayer} /> : null}>
      {screen === "intro" ? (
        <IntroView difficulty={difficulty} onDifficultyChange={chooseDifficulty} onCamera={playWithCamera} onKeys={playWithKeys} />
      ) : null}

      {screen === "play" ? (
        <PlayScreen
          view={view}
          status={status}
          tracker={tracker}
          ready={ready}
          live={live}
          touch={touch}
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

/** One polite announcement per change: the chant, then the result. */
function announcement(view: MatchView): string {
  const { match, missed, beat } = view;
  const last = match.lastResolvedRound;
  if (isRoundLive(view) && beat) {
    if (beat === "lock") return "The AI has locked its move.";
    return beat === "shoot" ? "Shoot" : GESTURE_LABEL[beat];
  }
  if (missed) return "Didn't catch your hand. Play the round again.";
  if (last) {
    let text = `${OUTCOME_COPY[last.outcome].word}. You threw ${last.playerMove}, the AI threw ${last.aiCounterMove}. It expected ${last.predictedPlayerMove}.`;
    if (match.phase === "match_complete") text += match.winner === "player" ? " You won the match." : " The AI won the match.";
    return text;
  }
  return "";
}

function PlayScreen({
  view,
  status,
  tracker,
  ready,
  live,
  touch,
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
  touch: boolean;
  onStart: () => void;
  onSeeResults: () => void;
  onThrow: (gesture: Gesture) => void;
  onUseCamera: () => void;
  onUseKeys: () => void;
}) {
  const wide = useWideLayout();
  const camera = view.inputMode === "camera";
  const playWithoutCamera = (
    <Button variant="ghost" size="lg" icon={touch ? <Pointer /> : <Keyboard />} onClick={onUseKeys}>
      {withoutCameraLabel(touch)}
    </Button>
  );

  if (camera) {
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

  const { match } = view;
  const last = match.lastResolvedRound;
  const revealed = !live && !view.missed && last !== null;
  const shoot = live && view.beat === "shoot";
  const notReadyText = camera && status.model !== "ready" ? "Loading the hand model" : undefined;
  const thrown = revealed && last ? last.playerMove : null;

  const playerState: PlayerCardState = revealed ? "thrown" : live && view.pendingThrow ? "picked" : "empty";
  const playerMove = revealed && last ? last.playerMove : view.pendingThrow;
  const playerPrompt = live ? (touch ? "Tap your move" : "Pick your move") : "Start the round, then pick";

  const switchLink = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <p className="type-small text-fg-subtle">{touch ? "Playing with buttons." : "Playing with keys."} The AI works the same way.</p>
      <Button variant="ghost" size="sm" icon={<Camera />} onClick={onUseCamera} disabled={live || match.phase === "match_complete"}>
        Use the camera
      </Button>
    </div>
  );

  const header = <MatchHeader view={view} cameraMode={camera} touch={touch} />;
  const action = (
    <ActionBar view={view} ready={ready} notReadyText={notReadyText} touch={touch} onStart={onStart} onSeeResults={onSeeResults} />
  );
  const strip = <RoundStrip rounds={match.matchRounds} />;
  const padProps = { enabled: live, shoot, selected: view.pendingThrow, thrown, onThrow, touch };
  const liveRegion = (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {announcement(view)}
    </p>
  );

  if (wide) {
    // The booth laptop: you on the left, the AI on the right, the chant between the scores above.
    return (
      <div className="mx-auto flex w-full max-w-[88rem] flex-1 flex-col gap-4 px-8 pb-4 pt-1 [--stage-h:clamp(16rem,calc(100dvh-21rem),46rem)] [@media(max-height:45rem)]:[--stage-h:clamp(16rem,calc(100dvh-19rem),46rem)]">
        {header}
        {camera ? (
          <div className="grid grid-cols-[auto_minmax(21rem,38rem)] items-stretch justify-center gap-5">
            <CameraView
              tracker={tracker}
              model={status.model}
              throwing={live || view.missed}
              beat={live ? view.beat : null}
              thrown={thrown}
              className="w-[calc(var(--stage-h)*4/3)] max-w-[60vw] [@media(max-height:45rem)]:[&_figcaption]:hidden"
              boxClassName="h-[var(--stage-h)]"
            />
            <AiPanel view={view} />
          </div>
        ) : (
          <div className="mx-auto grid w-full max-w-[76rem] grid-cols-2 items-stretch gap-5">
            <section aria-label="You" className="@container flex min-w-0 flex-col gap-4 rounded-xl bg-surface p-4 shadow-ring sm:p-5">
              <span className="type-label text-fg-muted">You</span>
              <div className="grid flex-1 content-start gap-5 @[30rem]:grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)]">
                <PlayerCard
                  state={playerState}
                  move={playerMove}
                  throwKey={last?.id ?? null}
                  prompt={playerPrompt}
                  className="w-full max-w-[10.5rem] justify-self-center [@media(max-height:46rem)]:max-w-[9rem]"
                />
                <ThrowPad {...padProps} layout="column" />
              </div>
              {switchLink}
            </section>
            <AiPanel view={view} />
          </div>
        )}
        <div className="flex items-end justify-between gap-8">
          {strip}
          <div className="flex shrink-0 justify-end">{action}</div>
        </div>
        {liveRegion}
      </div>
    );
  }

  // Phones and tablets: the chant, both moves side by side, then your controls.
  const info = guessInfo(view);
  return (
    <div className="mx-auto flex w-full max-w-[44rem] flex-1 flex-col gap-5 px-4 pb-10 pt-1 sm:px-6">
      {header}
      {camera ? (
        <>
          <CameraView
            tracker={tracker}
            model={status.model}
            throwing={live || view.missed}
            beat={live ? view.beat : null}
            thrown={thrown}
            boxClassName="aspect-[4/3]"
          />
          <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <AiCard state={aiCardState(view)} move={info.state === "revealed" && last ? last.aiCounterMove : null} beat={view.beat} dealKey={dealKey(view)} />
            <GuessBlock info={info} />
          </div>
          {action}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            <div className="flex flex-col items-center gap-2">
              <PlayerCard
                state={playerState}
                move={playerMove}
                throwKey={last?.id ?? null}
                prompt={playerPrompt}
                className="w-full max-w-[9.5rem]"
              />
              <span className="type-label text-fg-muted">You</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <AiCard
                state={aiCardState(view)}
                move={info.state === "revealed" && last ? last.aiCounterMove : null}
                beat={view.beat}
                dealKey={dealKey(view)}
                className="w-full max-w-[9.5rem]"
              />
              <span className="type-label text-game">AI</span>
            </div>
          </div>
          <ThrowPad {...padProps} />
          {action}
          <div className="rounded-xl bg-sunken p-4 shadow-ring">
            <GuessBlock info={info} />
          </div>
          {switchLink}
        </>
      )}
      <Notes habits={countHabits(view.history)} />
      {strip}
      {liveRegion}
    </div>
  );
}
