"use client";

import { useCallback, useEffect, useState } from "react";
import { StudioSession, type InputMode } from "./play/session";
import { IntroScreen } from "./ui/intro-screen";
import { StudioScreen } from "./ui/studio-screen";

type Screen = { name: "intro"; returning: boolean } | { name: "studio" };

/**
 * Air Studio: play five instruments in the air with hand tracking.
 * Intro → camera (or mouse) → hand check → instrument → play, record,
 * practise. The session owns the camera, the hand model, the audio and the
 * visitor's take; Next player and the 90 s idle reset hand it back clean.
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
