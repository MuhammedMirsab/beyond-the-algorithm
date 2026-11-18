"use client";

import { useCallback, useEffect, useState } from "react";
import { StudioSession, type InputMode } from "./play/session";
import { IntroScreen } from "./ui/intro-screen";
import { StudioScreen } from "./ui/studio-screen";

type Screen = { name: "intro"; returning: boolean } | { name: "studio" };

/**
 * Air Studio: play two instruments in the air with hand tracking.
 * Intro → one tap → playing the piano (camera or mouse). Which hands the
 * camera sees is shown on the stage, and the instrument switcher, Play along,
 * Record and Practice arrive as the visitor plays. The session owns the
 * camera, the hand model, the audio and the visitor's take; Next player and
 * the 90 s idle reset hand it back clean.
 */
export function AirStudioGame() {
  const [session] = useState(() => new StudioSession());
  const [screen, setScreen] = useState<Screen>({ name: "intro", returning: false });

  useEffect(() => {
    session.mount();
    return () => session.unmount();
  }, [session]);

  const start = useCallback(
    (mode: InputMode) => {
      window.scrollTo({ top: 0 });
      if (mode === "camera") session.chooseCamera();
      else session.chooseMouse();
      setScreen({ name: "studio" });
    },
    [session],
  );

  const nextPlayer = useCallback(() => {
    session.reset();
    window.scrollTo({ top: 0 });
    setScreen({ name: "intro", returning: true });
  }, [session]);

  if (screen.name === "intro") return <IntroScreen session={session} onStart={start} returning={screen.returning} />;
  return <StudioScreen session={session} onNextPlayer={nextPlayer} />;
}
