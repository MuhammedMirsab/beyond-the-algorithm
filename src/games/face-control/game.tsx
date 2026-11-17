"use client";

import { Pause, Play, SlidersHorizontal } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { GameShell } from "@/components/game/game-shell";
import { IconButton } from "@/components/ui/button";
import { useIdle } from "@/lib/idle";
import { inWorld } from "./play/machine";
import { FaceControlSession } from "./play/session";
import { Announcer } from "./ui/announcer";
import { CalibrationScreen } from "./ui/calibration-screen";
import { ErrorScreen, LoadingScreen, PermissionScreen } from "./ui/camera-screens";
import { IntroScreen } from "./ui/intro-screen";
import { PlayView } from "./ui/play-view";
import { ResultsScreen } from "./ui/results-screen";
import { SettingsModal } from "./ui/settings-modal";
import { Stage } from "./ui/stage";

/**
 * Face Control: tilt your head to roll, open your mouth to jump.
 *
 * The session (play/session.ts) owns the camera, face tracker, Phaser world
 * and the state machine; this component renders its snapshot. Phaser and
 * MediaPipe load lazily inside the session, in the browser only.
 */
export default function FaceControlGame() {
  const [session] = useState(() => new FaceControlSession());

  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);

  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getServerSnapshot);
  const { machine } = view;
  const { phase } = machine;
  const world = inWorld(phase);
  const results = phase === "game-over" || phase === "victory";

  // Booth: screens that wait for a click reset themselves after 90 s without input. Never
  // while someone plays with their face (no input events); the session watches for an
  // empty camera instead.
  useIdle(() => session.dispatch({ type: "reset" }), {
    enabled: phase === "intro" || phase === "error" || results || (machine.mode === "keyboard" && world),
  });

  // Each new screen starts at the top (the intro can be scrolled on phones).
  const screen = world ? "world" : phase;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  const canPause = phase === "playing" || phase === "countdown" || phase === "paused";
  const actions = world ? (
    <>
      <IconButton label="Open settings" icon={<SlidersHorizontal />} variant="ghost" onClick={session.openSettings} />
      {canPause ? (
        <IconButton
          label={phase === "paused" ? "Resume" : "Pause"}
          icon={phase === "paused" ? <Play /> : <Pause />}
          variant="ghost"
          onClick={() => session.act({ type: phase === "paused" ? "resume" : "pause" })}
        />
      ) : null}
    </>
  ) : null;

  return (
    <GameShell slug="face-control" sound immersive={world} actions={actions}>
      <Stage session={session} visible={world} />
      {phase === "intro" ? <IntroScreen session={session} model={view.model} /> : null}
      {phase === "permission" ? <PermissionScreen session={session} /> : null}
      {phase === "loading" ? <LoadingScreen session={session} model={view.model} /> : null}
      {phase === "error" && machine.issue ? <ErrorScreen session={session} issue={machine.issue} /> : null}
      {phase === "calibrate" ? <CalibrationScreen session={session} /> : null}
      {world ? <PlayView session={session} view={view} /> : null}
      {results ? <ResultsScreen session={session} view={view} /> : null}
      <SettingsModal session={session} open={view.settingsOpen} />
      <Announcer machine={machine} />
    </GameShell>
  );
}
