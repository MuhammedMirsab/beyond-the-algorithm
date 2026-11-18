"use client";

import { motion } from "motion/react";
import { useCallback, useReducer, useState, type ReactNode } from "react";
import { GameShell } from "@/components/game/game-shell";
import { NextPlayerButton } from "@/components/game/next-player";
import { useIdle } from "@/lib/idle";
import { randomSecret, type HumanAction } from "./engine/human";
import type { MachineAction } from "./engine/machine";
import { DEFAULT_RANGE, type RangeId } from "./engine/ranges";
import { describeSession, initialSession, sessionReducer, type Session } from "./engine/session";
import { useHeadingFocus } from "./ui/hooks";
import { HumanPlay } from "./ui/human-play";
import { HumanResult } from "./ui/human-result";
import { Intro } from "./ui/intro";
import { MachinePlay } from "./ui/machine-play";
import { MachineRight, MachineWrong } from "./ui/machine-result";
import { EASE_OUT } from "./ui/motion";

/** Idle time before an abandoned game resets for the next visitor. */
const IDLE_MS = { screen: 90_000, playing: 180_000 } as const;

/**
 * Which screen is up. A finished "Find its number" round stays on the play
 * screen for a beat (the line shows the number) until `resultRound` catches up.
 */
function stageOf(session: Session, resultRound: number): string {
  if (session.screen === "intro") return "intro";
  if (session.screen === "machine") {
    const { phase } = session.machine;
    return phase === "right" || phase === "wrong" ? `machine-${phase}` : "machine-play";
  }
  return session.human.status !== "playing" && resultRound === session.round ? "human-result" : "human-play";
}

/**
 * Can AI read your mind? Two ways to play binary search:
 * it finds your number (yes or no questions), or you find its number (higher or lower).
 */
export function MindReaderGame() {
  const [session, dispatch] = useReducer(sessionReducer, undefined, initialSession);
  const [resultRound, setResultRound] = useState(-1);
  const stage = stageOf(session, resultRound);

  const nextPlayer = useCallback(() => dispatch({ type: "next-player" }), []);
  const setRange = useCallback((range: RangeId) => dispatch({ type: "set-range", range }), []);
  const startMachine = useCallback(() => dispatch({ type: "start-machine" }), []);
  const playRange = useCallback((range: RangeId) => dispatch({ type: "start-machine", range }), []);
  const startHuman = useCallback(
    () => dispatch({ type: "start-human", secret: randomSecret(session.range), now: Date.now() }),
    [session.range],
  );
  const machineDispatch = useCallback((action: MachineAction) => dispatch({ type: "machine", action }), []);
  const humanDispatch = useCallback((action: HumanAction) => dispatch({ type: "human", action }), []);
  const showHumanResult = useCallback(() => setResultRound(session.round), [session.round]);

  // Booth: an abandoned screen resets itself. A fresh intro has nothing to reset.
  const playing = stage === "machine-play" || stage === "human-play";
  const pristine = session.screen === "intro" && session.range === DEFAULT_RANGE;
  useIdle(nextPlayer, { ms: playing ? IDLE_MS.playing : IDLE_MS.screen, enabled: !pristine });

  let screen: ReactNode;
  if (session.screen === "intro") {
    screen = (
      <IntroScreen
        focus={session.round > 0}
        range={session.range}
        onRangeChange={setRange}
        onReadMyMind={startMachine}
        onFindItsNumber={startHuman}
      />
    );
  } else if (session.screen === "machine") {
    const machine = session.machine;
    const results = {
      machine,
      dispatch: machineDispatch,
      onPlayAgain: startMachine,
      onPlayRange: playRange,
      onSwitchMode: startHuman,
      onNextPlayer: nextPlayer,
    };
    screen =
      machine.phase === "right" ? (
        <MachineRight {...results} />
      ) : machine.phase === "wrong" ? (
        <MachineWrong {...results} />
      ) : (
        <MachinePlay machine={machine} dispatch={machineDispatch} onRangeChange={setRange} />
      );
  } else {
    screen =
      stage === "human-play" ? (
        <HumanPlay human={session.human} dispatch={humanDispatch} onFinished={showHumanResult} />
      ) : (
        <HumanResult human={session.human} onPlayAgain={startHuman} onSwitchMode={startMachine} onNextPlayer={nextPlayer} />
      );
  }

  return (
    <GameShell slug="mind-reader" actions={session.screen === "intro" ? null : <NextPlayerButton onClick={nextPlayer} />}>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {describeSession(session)}
      </p>
      <ScreenFade key={`${session.round}-${stage}`} animate={session.round > 0}>
        {screen}
      </ScreenFade>
    </GameShell>
  );
}

function IntroScreen({ focus, ...props }: { focus: boolean } & Parameters<typeof Intro>[0]) {
  const wrapper = useHeadingFocus<HTMLDivElement>(focus);
  return (
    <div ref={wrapper} className="flex flex-1 flex-col [&_h1]:outline-none">
      <Intro {...props} />
    </div>
  );
}

/** Screens fade in when they change. The first screen of a page load is never hidden behind an animation. */
function ScreenFade({ animate, children }: { animate: boolean; children: ReactNode }) {
  if (!animate) return <div className="flex flex-1 flex-col">{children}</div>;
  return (
    <motion.div
      className="flex flex-1 flex-col"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
