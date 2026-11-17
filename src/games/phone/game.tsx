"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { SensorId } from "@/components/art/sensor-art";
import { GameShell } from "@/components/game/game-shell";
import { NextPlayerButton } from "@/components/game/next-player";
import { useIdle } from "@/lib/idle";
import { isSoundOn, subscribeSound } from "@/lib/sound";
import { EXPERIMENT_COUNT, EXPERIMENTS, experimentIndex } from "./data/experiments";
import { sound } from "./engine/sound";
import { LinkProvider, LinkScope, NAV_KEY, useLink, useRemoteValue } from "./link/link";
import { PhoneLinkBar } from "./link/link-panel";
import { useCapabilities } from "./sensors/use-device";
import type { ExperimentContext } from "./ui/experiment-layout";
import { BatteryExperiment } from "./ui/experiments/battery";
import { CameraExperiment } from "./ui/experiments/camera";
import { ConnectionExperiment } from "./ui/experiments/connection";
import { GpsExperiment } from "./ui/experiments/gps";
import { LightExperiment } from "./ui/experiments/light";
import { MicrophoneExperiment } from "./ui/experiments/microphone";
import { MotionExperiment } from "./ui/experiments/motion";
import { TouchExperiment } from "./ui/experiments/touch";
import { PhoneIntro } from "./ui/intro";
import { SensorLab } from "./ui/lab";
import { Quiz } from "./ui/quiz";
import { Takeaway } from "./ui/takeaway";

type Screen =
  | { name: "intro" }
  | { name: "lab" }
  | { name: "experiment"; id: SensorId }
  | { name: "quiz" }
  | { name: "takeaway"; score: number };

const EMPTY: ReadonlySet<SensorId> = new Set();

/**
 * "Your phone knows more than you think": intro, the sensor lab, eight
 * experiments, a quiz and the takeaway. Nothing about a visitor is stored;
 * Next player (or 90 s idle on the booth laptop) forgets everything, and
 * leaving an experiment unmounts it, which stops its sensors.
 */
export function PhoneGame() {
  const [round, setRound] = useState(0);
  // A session ended from the other device (or the phone went quiet): start over, forgetting everything.
  const onEnded = useCallback(() => setRound((r) => r + 1), []);
  return (
    <LinkProvider onEnded={onEnded}>
      <PhoneGameRound key={round} onReset={onEnded} />
    </LinkProvider>
  );
}

/** What the linked phone tells the laptop about where it is. */
interface Nav {
  screen: Screen;
  tested: SensorId[];
  visit: number;
}

function PhoneGameRound({ onReset }: { onReset: () => void }) {
  const [screen, setScreen] = useState<Screen>({ name: "intro" });
  const [localTested, setTested] = useState<ReadonlySet<SensorId>>(EMPTY);
  const [visit, setVisit] = useState(0);
  const [moved, setMoved] = useState(false);
  const caps = useCapabilities();
  const link = useLink();
  const { role, publish } = link;

  const go = useCallback((next: Screen) => {
    setMoved(true);
    setScreen(next);
    setVisit((v) => v + 1);
  }, []);

  // Next player: ends any phone link (both sides forget it) and remounts the whole game.
  const reset = useCallback(() => {
    link.end({ notify: false });
    onReset();
  }, [link, onReset]);

  // The phone tells the laptop which screen it is on; the laptop follows it.
  useEffect(() => {
    if (role === "phone") publish(NAV_KEY, { screen, tested: [...localTested], visit } satisfies Nav);
  });
  const remote = useRemoteValue<Nav>(NAV_KEY);
  const following = remote != null;
  const shown: Screen = following ? remote.screen : screen;
  const tested = useMemo<ReadonlySet<SensorId>>(
    () => (following ? new Set(remote.tested) : localTested),
    [following, remote, localTested],
  );
  const scope = String(following ? remote.visit : visit);

  const markTested = useCallback((id: SensorId) => {
    setTested((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // A short chime the first time each sensor is tried.
  const testedCount = useRef(0);
  useEffect(() => {
    if (tested.size > testedCount.current) sound.success();
    testedCount.current = tested.size;
  }, [tested]);

  // Sound follows the arcade-wide switch, and stops with the game.
  useEffect(() => {
    const unsubscribe = subscribeSound(() => {
      if (!isSoundOn()) sound.suspend();
    });
    return () => {
      unsubscribe();
      sound.suspend();
    };
  }, []);

  const screenKey = `${scope}:${shown.name}:${shown.name === "experiment" ? shown.id : ""}`;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screenKey]);

  // The booth laptop resets itself for the next visitor. Phones belong to their owners.
  // While a phone is linked, the visitor is busy on the phone, not the laptop.
  useIdle(reset, { enabled: !caps.touch && !link.linked && shown.name !== "intro" });

  let content;
  switch (shown.name) {
    case "intro":
      content = <PhoneIntro onStart={() => go({ name: "lab" })} />;
      break;
    case "lab":
      content = <SensorLab tested={tested} onOpen={(id) => go({ name: "experiment", id })} onQuiz={() => go({ name: "quiz" })} />;
      break;
    case "experiment": {
      const index = experimentIndex(shown.id);
      const nextId = EXPERIMENTS[index + 1]?.id;
      content = (
        <ExperimentScreen
          key={screenKey}
          id={shown.id}
          tested={tested.has(shown.id)}
          markTested={markTested}
          onNext={() => go(nextId ? { name: "experiment", id: nextId } : { name: "quiz" })}
          nextLabel={nextId ? "Next sensor" : "Take the quiz"}
          onBack={() => go({ name: "lab" })}
        />
      );
      break;
    }
    case "quiz":
      content = <Quiz key={screenKey} onDone={(score) => go({ name: "takeaway", score })} />;
      break;
    case "takeaway":
      content = <Takeaway score={shown.score} tested={tested.size} onNextPlayer={reset} onLab={() => go({ name: "lab" })} />;
      break;
  }

  return (
    <GameShell
      slug="phone"
      sound
      actions={
        shown.name === "intro" && !link.linked ? null : <NextPlayerButton onClick={reset} />
      }
    >
      {role === "phone" || link.phase === "ended" || link.phase === "failed" ? <PhoneLinkBar /> : null}
      <motion.div
        key={screenKey}
        initial={moved ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-1 flex-col"
      >
        <LinkScope value={scope}>{content}</LinkScope>
      </motion.div>
    </GameShell>
  );
}

function ExperimentScreen({
  id,
  tested,
  markTested,
  onNext,
  nextLabel,
  onBack,
}: {
  id: SensorId;
  tested: boolean;
  markTested: (id: SensorId) => void;
  onNext: () => void;
  nextLabel: string;
  onBack: () => void;
}) {
  const index = experimentIndex(id);
  const markThis = useCallback(() => markTested(id), [id, markTested]);

  // Escape goes back to the lab, like closing a card.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape" && !event.defaultPrevented) onBack();
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const ctx: ExperimentContext = {
    experiment: EXPERIMENTS[index],
    index,
    total: EXPERIMENT_COUNT,
    tested,
    markTested: markThis,
    onNext,
    nextLabel,
    onBack,
  };

  switch (id) {
    case "motion":
      return <MotionExperiment ctx={ctx} />;
    case "gps":
      return <GpsExperiment ctx={ctx} />;
    case "camera":
      return <CameraExperiment ctx={ctx} />;
    case "microphone":
      return <MicrophoneExperiment ctx={ctx} />;
    case "light":
      return <LightExperiment ctx={ctx} />;
    case "touch":
      return <TouchExperiment ctx={ctx} />;
    case "battery":
      return <BatteryExperiment ctx={ctx} />;
    case "connection":
      return <ConnectionExperiment ctx={ctx} />;
  }
}
