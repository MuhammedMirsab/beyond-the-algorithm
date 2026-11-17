"use client";

import { useCallback, useState } from "react";
import { IntroScreen } from "./ui/intro-screen";
import { WriteScreen, type InputMode } from "./ui/write-screen";

type Screen = { name: "intro"; returning: boolean } | { name: "write"; mode: InputMode };

/**
 * AirWrite: write in the air with a fingertip; this device reads the ink.
 * Intro → writing screen (camera or mouse/touch) → result. Next player and the
 * 90 s idle reset both return here to the intro, which drops everything about
 * the visitor: ink, settings, results and the camera.
 */
export function AirWriteGame() {
  const [screen, setScreen] = useState<Screen>({ name: "intro", returning: false });

  const start = useCallback((mode: InputMode) => {
    window.scrollTo({ top: 0 });
    setScreen({ name: "write", mode });
  }, []);

  const nextPlayer = useCallback(() => {
    window.scrollTo({ top: 0 });
    setScreen({ name: "intro", returning: true });
  }, []);

  if (screen.name === "intro") return <IntroScreen onStart={start} returning={screen.returning} />;
  return <WriteScreen initialMode={screen.mode} onNextPlayer={nextPlayer} />;
}
