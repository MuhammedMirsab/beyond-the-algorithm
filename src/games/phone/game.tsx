"use client";

import { RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { SensorId } from "@/components/art/sensor-art";
import { GameShell } from "@/components/game/game-shell";
import { Button, IconButton } from "@/components/ui/button";
import { useIdle } from "@/lib/idle";
import { isSoundOn, subscribeSound } from "@/lib/sound";
import { EXPERIMENT_COUNT, EXPERIMENTS, experimentIndex } from "./data/experiments";
import { sound } from "./engine/sound";
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
  const [screen, setScreen] = useState<Screen>({ name: "intro" });
  const [tested, setTested] = useState<ReadonlySet<SensorId>>(EMPTY);
  const [round, setRound] = useState(0);
  const [moved, setMoved] = useState(false);
  const caps = useCapabilities();

  const go = useCallback((next: Screen) => {
    setMoved(true);
    setScreen(next);
  }, []);

  const reset = useCallback(() => {
    setScreen({ name: "intro" });
    setTested(EMPTY);
    setRound((r) => r + 1);
  }, []);

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

  const screenKey = `${round}:${screen.name}:${screen.name === "experiment" ? screen.id : ""}`;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screenKey]);

  // The booth laptop resets itself for the next visitor. Phones belong to their owners.
  useIdle(reset, { enabled: !caps.touch && screen.name !== "intro" });

  let content;
  switch (screen.name) {
    case "intro":
      content = <PhoneIntro onStart={() => go({ name: "lab" })} />;
      break;
    case "lab":
      content = <SensorLab tested={tested} onOpen={(id) => go({ name: "experiment", id })} onQuiz={() => go({ name: "quiz" })} />;
      break;
    case "experiment": {
      const index = experimentIndex(screen.id);
      const nextId = EXPERIMENTS[index + 1]?.id;
      content = (
        <ExperimentScreen
          key={screenKey}
          id={screen.id}
          tested={tested.has(screen.id)}
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
      content = <Takeaway score={screen.score} tested={tested.size} onNextPlayer={reset} onLab={() => go({ name: "lab" })} />;
      break;
  }

  return (
    <GameShell
      slug="phone"
      sound
      actions={
        screen.name === "intro" ? null : (
          <>
            <Button variant="ghost" icon={<RotateCcw />} onClick={reset} className="max-sm:hidden">
              Next player
            </Button>
            <IconButton label="Next player" icon={<RotateCcw />} variant="ghost" onClick={reset} className="sm:hidden" />
          </>
        )
      }
    >
      <motion.div
        key={screenKey}
        initial={moved ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-1 flex-col"
      >
        {content}
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
