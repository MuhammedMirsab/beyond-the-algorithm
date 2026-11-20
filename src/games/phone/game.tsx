"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { SensorId } from "@/components/art/sensor-art";
import { GameShell } from "@/components/game/game-shell";
import { NextPlayerButton } from "@/components/game/next-player";
import { entrance } from "@/lib/entrance";
import { useIdle } from "@/lib/idle";
import { track } from "@/lib/play-tracker";
import { isSoundOn, subscribeSound } from "@/lib/sound";
import { EXPERIMENT_COUNT, EXPERIMENTS, experimentIndex } from "./data/experiments";
import { QUIZ_LENGTH } from "./data/quiz";
import { sound } from "./engine/sound";
import { LinkProvider, LinkScope, NAV_KEY, useLink, useRemoteValue } from "./link/link";
import { HostLinkStatus, PausedOverlay, PhoneLinkBanner, PhoneLinkButton } from "./link/link-ui";
import { newToken } from "./link/protocol";
import { parseNav, readHistoryEntry, type Insights, type Nav, type Screen } from "./nav";
import { requestMotionPermission } from "./sensors/use-device-tilt";
import type { ExperimentContext } from "./ui/experiment-layout";
import { BatteryExperiment } from "./ui/experiments/battery";
import { CameraExperiment } from "./ui/experiments/camera";
import { ConnectionExperiment } from "./ui/experiments/connection";
import { GpsExperiment } from "./ui/experiments/gps";
import { LightExperiment } from "./ui/experiments/light";
import { MicrophoneExperiment } from "./ui/experiments/microphone";
import { MotionExperiment } from "./ui/experiments/motion";
import { TouchExperiment } from "./ui/experiments/touch";
import { LaptopIntro, LinkedSplash, PhoneIntro, PhoneWelcome } from "./ui/intro";
import { SensorLab } from "./ui/lab";
import { Quiz } from "./ui/quiz";
import { Takeaway } from "./ui/takeaway";

const EMPTY: ReadonlySet<SensorId> = new Set();
const FIRST: Screen = { name: "experiment", id: EXPERIMENTS[0].id };

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/** Enter already does something on a focused button or link. */
function isPressable(target: EventTarget | null) {
  return target instanceof HTMLElement && (isTyping(target) || ["BUTTON", "A"].includes(target.tagName) || target.getAttribute("role") === "slider");
}

/**
 * "Your phone knows more than you think": intro, eight experiments (the
 * twin that turns with your phone first), an overview of all eight, a quiz
 * and the takeaway. Nothing about a visitor is stored; Next player (or 90 s
 * idle on the booth laptop) forgets everything, and leaving an experiment
 * unmounts it, which stops its sensors.
 */
export function PhoneGame() {
  const [round, setRound] = useState(0);
  // Next player, or a session the booth screen ended: start over, forgetting everything.
  const onReset = useCallback(() => {
    track.nextPlayer();
    setRound((r) => r + 1);
  }, []);
  return (
    <LinkProvider onReset={onReset}>
      <PhoneGameRound key={round} />
    </LinkProvider>
  );
}

function PhoneGameRound() {
  const link = useLink();
  const { role, publish } = link;
  const [screen, setScreen] = useState<Screen>({ name: "intro" });
  const [localTested, setTested] = useState<ReadonlySet<SensorId>>(EMPTY);
  const [localInsights, setInsights] = useState<Insights>({});
  const [visit, setVisit] = useState(0);
  const [moved, setMoved] = useState(false);
  /** This round's history entries on a phone, so stale ones from an earlier round are ignored. */
  const entryId = useRef<string | null>(null);
  const phoneHistory = role === "phone";

  // A phone that reloaded or came back to the game picks up where the booth screen last saw it.
  const [restoredSeq, setRestoredSeq] = useState(0);
  if (link.restore && link.restore.seq !== restoredSeq) {
    setRestoredSeq(link.restore.seq);
    const nav = parseNav(link.restore.nav);
    if (nav && nav.screen.name !== "intro") {
      setScreen(nav.screen);
      setTested(new Set(nav.tested));
      setInsights(nav.insights);
      setVisit(nav.visit + 1);
      setMoved(true);
    }
  }

  const go = useCallback(
    (next: Screen, how: "push" | "replace" = "push") => {
      setMoved(true);
      setScreen(next);
      setVisit((v) => v + 1);
      if (next.name === "experiment") track.step("experiment", next.id);
      else if (next.name === "lab" || next.name === "quiz") track.step(next.name);
      // On a phone each screen is a history entry, so the back gesture steps back through the game.
      if (phoneHistory) {
        entryId.current ??= newToken();
        const state = { phoneGame: { id: entryId.current, screen: next } };
        if (how === "push") window.history.pushState(state, "");
        else window.history.replaceState(state, "");
      }
    },
    [phoneHistory],
  );

  useEffect(() => {
    if (!phoneHistory) return;
    const onPop = (event: PopStateEvent) => {
      const entry = readHistoryEntry(event.state);
      setScreen(entry && entry.id === entryId.current ? entry.screen : { name: "intro" });
      setVisit((v) => v + 1);
      setMoved(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [phoneHistory]);

  // The phone tells the booth screen where it is; the booth screen follows it.
  useEffect(() => {
    if (role === "phone") publish(NAV_KEY, { screen, tested: [...localTested], visit, insights: localInsights } satisfies Nav);
  });
  const remoteRaw = useRemoteValue<unknown>(NAV_KEY);
  const remote = useMemo(() => (remoteRaw === undefined ? null : parseNav(remoteRaw)), [remoteRaw]);
  const following = link.following;
  const shown: Screen = following ? (remote?.screen ?? { name: "intro" }) : screen;
  const tested = useMemo<ReadonlySet<SensorId>>(() => (following ? new Set(remote?.tested ?? []) : localTested), [following, remote, localTested]);
  const insights = following ? (remote?.insights ?? {}) : localInsights;
  const scope = String(following ? (remote?.visit ?? 0) : visit);

  const markTested = useCallback((id: SensorId) => {
    setTested((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const report = useCallback((id: SensorId, label: string | null, live: boolean, reading: string | null) => {
    if (!label) return;
    setInsights((prev) => {
      const old = prev[id];
      return old && old.label === label && old.live === live && old.reading === reading ? prev : { ...prev, [id]: { label, live, reading } };
    });
  }, []);

  // A short chime the first time each sensor is tried.
  const testedCount = useRef(0);
  useEffect(() => {
    if (tested.size > testedCount.current) {
      sound.success();
      // A booth screen mirroring a phone leaves the counting to the phone.
      if (!following) track.step("sensors-tried", tested.size);
    }
    testedCount.current = tested.size;
  }, [tested, following]);

  // The phone link coming and going, once per change.
  const linkedRef = useRef(link.linked);
  useEffect(() => {
    if (link.linked === linkedRef.current) return;
    linkedRef.current = link.linked;
    track.step("link", link.linked ? "connected" : "dropped");
  }, [link.linked]);

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

  // The booth laptop resets itself for the next visitor. Phones belong to their owners, and a
  // linked phone is busy on the phone, not the laptop (the link has its own idle rule).
  useIdle(link.nextPlayer, { enabled: role === "host" && !following && shown.name !== "intro" });

  // Start: on a phone, the motion prompt opens inside this tap (iPhone only allows it there).
  const start = useCallback(() => {
    if (role === "phone") void requestMotionPermission().then((answer) => track.step("motion-permission", answer));
    track.start(role === "host" ? "laptop" : link.controller ? "phone-linked" : role === "phone" ? "phone" : "browser");
    go(FIRST);
  }, [role, link.controller, go]);

  // Enter starts on the booth laptop.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Enter" || role !== "host" || following || shown.name !== "intro") return;
    if (event.altKey || event.ctrlKey || event.metaKey || isPressable(event.target)) return;
    event.preventDefault();
    start();
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const showWelcome = role === "phone" && (link.controller || link.phone.kind === "failed");

  let content;
  switch (shown.name) {
    case "intro":
      if (role === "host") content = following ? <LinkedSplash /> : <LaptopIntro onStart={start} />;
      else if (showWelcome) content = <PhoneWelcome onStart={start} />;
      else content = <PhoneIntro onStart={start} />;
      break;
    case "lab":
      content = (
        <SensorLab
          tested={tested}
          keys={!following}
          onOpen={(id) => go({ name: "experiment", id })}
          onQuiz={() => go({ name: "quiz" })}
        />
      );
      break;
    case "experiment": {
      const index = experimentIndex(shown.id);
      const nextId = EXPERIMENTS[index + 1]?.id;
      content = (
        <ExperimentScreen
          key={screenKey}
          id={shown.id}
          tested={tested.has(shown.id)}
          mirrored={following}
          markTested={markTested}
          report={report}
          onNext={() => go(nextId ? { name: "experiment", id: nextId } : { name: "quiz" })}
          nextLabel={nextId ? "Next sensor" : "Take the quiz"}
          onBack={() => go({ name: "lab" })}
        />
      );
      break;
    }
    case "quiz":
      content = (
        <Quiz
          key={screenKey}
          keys={!following}
          onDone={(score) => {
            track.end({ score, outOf: QUIZ_LENGTH, won: score === QUIZ_LENGTH, label: `quiz ${score} of ${QUIZ_LENGTH}, ${tested.size} sensors` });
            go({ name: "takeaway", score }, "replace");
          }}
        />
      );
      break;
    case "takeaway":
      content = (
        <Takeaway
          score={shown.score}
          tested={tested.size}
          insights={insights}
          onNextPlayer={link.nextPlayer}
          onLab={() => go({ name: "lab" })}
        />
      );
      break;
  }

  return (
    <GameShell
      slug="phone"
      sound
      actions={
        <>
          {role === "host" ? <HostLinkStatus /> : <PhoneLinkButton />}
          {shown.name === "intro" && !following ? null : <NextPlayerButton onClick={link.nextPlayer} />}
        </>
      }
    >
      {role === "phone" && !(shown.name === "intro" && showWelcome) ? <PhoneLinkBanner /> : null}
      <motion.div
        key={screenKey}
        initial={moved || following ? entrance({ opacity: 0, y: 8 }) : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        // While a phone drives the booth screen, the laptop shows and never takes input.
        inert={following}
        className="flex flex-1 flex-col"
      >
        <LinkScope value={scope}>{content}</LinkScope>
      </motion.div>
      {role === "host" ? <PausedOverlay /> : null}
    </GameShell>
  );
}

function ExperimentScreen({
  id,
  tested,
  mirrored,
  markTested,
  report,
  onNext,
  nextLabel,
  onBack,
}: {
  id: SensorId;
  tested: boolean;
  mirrored: boolean;
  markTested: (id: SensorId) => void;
  report: (id: SensorId, label: string | null, live: boolean, reading: string | null) => void;
  onNext: () => void;
  nextLabel: string;
  onBack: () => void;
}) {
  const index = experimentIndex(id);
  const markThis = useCallback(() => markTested(id), [id, markTested]);
  const reportThis = useCallback(
    (label: string | null, live: boolean, reading: string | null) => report(id, label, live, reading),
    [id, report],
  );

  // Booth keys: Escape for all sensors, N for the next one.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (mirrored || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Escape") onBack();
    else if ((event.key === "n" || event.key === "N") && !isTyping(event.target)) {
      event.preventDefault();
      onNext();
    }
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
    report: reportThis,
    onNext,
    nextLabel,
    onBack,
    mirrored,
  };

  switch (id) {
    case "motion":
      return <MotionExperiment ctx={ctx} />;
    case "camera":
      return <CameraExperiment ctx={ctx} />;
    case "microphone":
      return <MicrophoneExperiment ctx={ctx} />;
    case "touch":
      return <TouchExperiment ctx={ctx} />;
    case "gps":
      return <GpsExperiment ctx={ctx} />;
    case "light":
      return <LightExperiment ctx={ctx} />;
    case "battery":
      return <BatteryExperiment ctx={ctx} />;
    case "connection":
      return <ConnectionExperiment ctx={ctx} />;
  }
}
