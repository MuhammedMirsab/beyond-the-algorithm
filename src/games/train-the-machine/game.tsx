"use client";

import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { GameArt } from "@/components/art/game-art";
import { CameraProblem, CameraPrompt, CameraWaiting } from "@/components/game/camera-notice";
import { GameIntro } from "@/components/game/game-intro";
import { GameShell } from "@/components/game/game-shell";
import { NextPlayerButton } from "@/components/game/next-player";
import { entrance } from "@/lib/entrance";
import { useIdle } from "@/lib/idle";
import { ActionClassifier, DEFAULT_REJECTION_THRESHOLD, trainFromExamples, type Prediction } from "./engine/classifier";
import { analyzeTemporalMotion, extractFeatureVector } from "./engine/features";
import { Sounds } from "./engine/sound";
import { classTraits } from "./engine/traits";
import type { PerceptionResult } from "./engine/types";
import { disposeVision, holdVision, loadVision, preferCpu, type VisionModels } from "./engine/vision";
import { CollectStep } from "./ui/collect-step";
import { EXAMPLES_NEEDED, MAX_EXAMPLES, NO_EXAMPLES, type Example, type Examples, type Move, type MoveId } from "./ui/model";
import { PickMoves, type MovePair } from "./ui/pick-moves";
import { ResultsStep } from "./ui/results-step";
import { EMPTY_TALLY, tallyFrame, type TestTally } from "./ui/test-tally";
import { TestStep } from "./ui/test-step";
import { TrainStep } from "./ui/train-step";
import { useCamera } from "./ui/use-camera";
import { usePerception } from "./ui/use-perception";

type Step = "intro" | "pick" | "collect" | "train" | "test" | "results";

const PRIVACY = "Video stays on this device. Your examples are wiped when the next player starts.";
/** Camera steps reset after this long with nobody in view and no input. */
const ABANDONED_MS = 90_000;
/** New answers show at once; numbers on screen refresh this often. */
const READOUT_MS = 150;

/** Whether the browser will ask before opening the camera. "granted" means it won't. */
async function cameraPermission(): Promise<PermissionState | "unknown"> {
  try {
    const status = await navigator.permissions?.query({ name: "camera" });
    return status?.state ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Train the machine: pick two moves, show each one 5 times, train, test it,
 * then see how it worked. Everything about the visitor lives in this
 * component's memory and is cleared by Next player.
 */
export function TrainTheMachineGame() {
  const [step, setStep] = useState<Step>("intro");
  const [moves, setMoves] = useState<[Move, Move] | null>(null);
  const [examples, setExamples] = useState<Examples>(NO_EXAMPLES);
  const [active, setActive] = useState<MoveId>("a");
  const [trainMs, setTrainMs] = useState(0);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [tally, setTally] = useState<TestTally>(EMPTY_TALLY);
  const [results, setResults] = useState<{ tally: TestTally; rate: number }>({ tally: EMPTY_TALLY, rate: 0 });
  const [models, setModels] = useState<VisionModels | null>(null);
  const [modelFailed, setModelFailed] = useState(false);
  /** This visitor already said yes to the camera: later screens turn it on without asking again. */
  const [cameraAllowed, setCameraAllowed] = useState(false);
  /** Bumped by Next player, so every screen starts fresh. */
  const [visitor, setVisitor] = useState(0);

  const camera = useCamera();
  const { start: startCamera, stop: stopCamera } = camera;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const classifierRef = useRef<ActionClassifier | null>(null);
  const soundsRef = useRef<Sounds | null>(null);
  const loadRef = useRef(0);
  const shownRef = useRef({ key: "", at: 0 });
  const tallyRef = useRef<TestTally>(EMPTY_TALLY);
  /** The browser already allows the camera here (the booth laptop, after the first visitor). */
  const grantedRef = useRef(false);

  // The models stay loaded while the game is open and close after it unmounts.
  useEffect(() => holdVision(), []);
  useEffect(
    () => () => {
      soundsRef.current?.dispose();
      soundsRef.current = null;
    },
    [],
  );

  // Ask the browser once per visitor whether the camera is already allowed, so
  // a booth that said yes once never shows the "Turn on your camera" screen again.
  useEffect(() => {
    let live = true;
    void cameraPermission().then((state) => {
      if (live) grantedRef.current = state === "granted";
    });
    return () => {
      live = false;
    };
  }, [visitor]);

  const sounds = useCallback(() => (soundsRef.current ??= new Sounds()), []);

  const requestModels = useCallback(() => {
    const token = ++loadRef.current;
    setModelFailed(false);
    loadVision().then(
      (loaded) => {
        if (token === loadRef.current && !loaded.closed) setModels(loaded);
      },
      () => {
        if (token === loadRef.current) setModelFailed(true);
      },
    );
  }, []);

  /* ── Live frames while testing ─────────────────────────────────── */

  const handleTestFrame = (result: PerceptionResult, recent: readonly PerceptionResult[], now: number) => {
    const classifier = classifierRef.current;
    if (!classifier) return;
    const next = classifier.predict({
      features: extractFeatureVector(result, recent),
      hasPerson: result.hasPerson,
      isFaceOnly: result.isFaceOnly,
      hasHands: result.hasHands,
      motion: analyzeTemporalMotion(recent),
    });
    tallyRef.current = tallyFrame(tallyRef.current, next, now);
    const key = `${next.status}:${next.classId}:${next.reason}`;
    if (key !== shownRef.current.key || now - shownRef.current.at >= READOUT_MS) {
      shownRef.current = { key, at: now };
      setPrediction(next);
      setTally(tallyRef.current);
    }
  };

  const onCameraStep = step === "collect" || step === "test";
  const perception = usePerception({
    models,
    videoRef,
    canvasRef,
    enabled: onCameraStep && camera.status === "live",
    onFrame: step === "test" ? handleTestFrame : undefined,
  });
  const { reset: resetPerception } = perception;

  /* ── Moving between screens ────────────────────────────────────── */

  const go = (next: Step) => {
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  const allowCamera = () => {
    setCameraAllowed(true);
    requestModels();
    void startCamera();
  };

  /** Open the camera without asking when this visitor, or the browser, already said yes. */
  const openCamera = () => {
    if (cameraAllowed || grantedRef.current) {
      setCameraAllowed(true);
      void startCamera();
    }
  };

  const chooseMoves = () => {
    // Start loading the models while the visitor reads the cards.
    requestModels();
    go("pick");
  };

  const pickMoves = (pair: MovePair) => {
    const toMove = (id: MoveId, preset: MovePair[number]): Move => ({ id, ...preset, traits: classTraits(preset.name) });
    setMoves([toMove("a", pair[0]), toMove("b", pair[1])]);
    setExamples(NO_EXAMPLES);
    setActive("a");
    classifierRef.current?.reset();
    requestModels();
    openCamera();
    go("collect");
  };

  const addExample = (id: MoveId, example: Example) => {
    setExamples((prev) => ({ ...prev, [id]: [...prev[id], example].slice(0, MAX_EXAMPLES) }));
  };

  const removeExample = (id: MoveId, exampleId: string) => {
    setExamples((prev) => ({ ...prev, [id]: prev[id].filter((e) => e.id !== exampleId) }));
  };

  const train = () => {
    if (!moves) return;
    const classifier = (classifierRef.current ??= new ActionClassifier());
    const started = performance.now();
    const result = trainFromExamples(classifier, moves, examples);
    if (!result.success) return;
    setTrainMs(performance.now() - started);
    go("train");
  };

  const startTest = () => {
    tallyRef.current = EMPTY_TALLY;
    shownRef.current = { key: "", at: 0 };
    setTally(EMPTY_TALLY);
    setPrediction(null);
    if (camera.status !== "live") openCamera();
    go("test");
  };

  const addMore = () => {
    setPrediction(null);
    // Straight to the move that needs examples most.
    if (moves) setActive(examples.a.length <= examples.b.length ? "a" : "b");
    if (camera.status !== "live") openCamera();
    go("collect");
  };

  const showResults = () => {
    setResults({ tally: tallyRef.current, rate: perception.status.rate });
    stopCamera();
    go("results");
  };

  const startOver = () => {
    stopCamera();
    classifierRef.current?.reset();
    setMoves(null);
    setExamples(NO_EXAMPLES);
    setPrediction(null);
    go("pick");
  };

  const nextPlayer = useCallback(() => {
    stopCamera();
    // Forget the trackers too: the next visitor gets fresh ones, loaded while they pick moves.
    loadRef.current += 1;
    disposeVision();
    setModels(null);
    setModelFailed(false);
    classifierRef.current?.reset();
    classifierRef.current = null;
    resetPerception();
    tallyRef.current = EMPTY_TALLY;
    shownRef.current = { key: "", at: 0 };
    setMoves(null);
    setExamples(NO_EXAMPLES);
    setActive("a");
    setTrainMs(0);
    setPrediction(null);
    setTally(EMPTY_TALLY);
    setResults({ tally: EMPTY_TALLY, rate: 0 });
    setCameraAllowed(false);
    setVisitor((n) => n + 1);
    setStep("intro");
    window.scrollTo({ top: 0 });
  }, [stopCamera, resetPerception]);

  const retryModels = () => {
    // Loaded fine but every frame failed: the graphics driver is the likely cause, so use the CPU.
    if (perception.failed) preferCpu();
    disposeVision();
    setModels(null);
    requestModels();
  };

  /* ── Booth: reset abandoned screens ────────────────────────────── */

  // The intro is already the reset state, so idling there changes nothing.
  useIdle(
    () => {
      if (step !== "intro") nextPlayer();
    },
    { enabled: step === "intro" || step === "pick" || step === "results" },
  );
  useAbandoned(nextPlayer, perception.lastSeenRef, { enabled: step === "collect" || step === "train" || step === "test" });

  // Move focus to the new screen's heading, so keyboard and screen reader users follow along.
  useEffect(() => {
    if (step === "intro") return;
    document.querySelector<HTMLElement>("[data-step-focus]")?.focus({ preventScroll: true });
  }, [step]);

  /* ── Screens ───────────────────────────────────────────────────── */

  const gate = (content: ReactNode) => {
    if (camera.status === "idle") {
      return (
        <Centered>
          <CameraPrompt
            text={`It learns your moves from the camera. You'll show it each move ${EXAMPLES_NEEDED} times.`}
            onAllow={allowCamera}
            privacy={PRIVACY}
          />
        </Centered>
      );
    }
    if (camera.status === "requesting") {
      return (
        <Centered>
          <CameraWaiting />
        </Centered>
      );
    }
    if (camera.status === "error") {
      return (
        <Centered>
          <CameraProblem issue={camera.issue ?? "unknown"} onRetry={allowCamera} />
        </Centered>
      );
    }
    if (modelFailed || perception.failed) {
      return (
        <Centered>
          <CameraProblem issue="model" onRetry={retryModels} />
        </Centered>
      );
    }
    // The camera shows at once; the tracker finishes loading on top of it.
    return content;
  };

  const trackerReady = models !== null;

  let screen: ReactNode = null;
  if (step === "intro") {
    screen = (
      <GameIntro
        slug="train-the-machine"
        art={<GameArt slug="train-the-machine" mode="intro" />}
        steps={[
          { title: "Pick two moves", text: "Like a wave and a clap, or hands up and hands down." },
          { title: `Show each one ${EXAMPLES_NEEDED} times`, text: "One press records them in a row." },
          { title: "Test it, then try to fool it" },
        ]}
        primary={{ label: "Choose moves", onClick: chooseMoves }}
        keys={[{ keys: ["Space"], label: "Record your moves, then test" }]}
        footnote={PRIVACY}
      />
    );
  } else if (step === "pick") {
    screen = <PickMoves onPick={pickMoves} />;
  } else if (moves && step === "collect") {
    screen = gate(
      <CollectStep
        moves={moves}
        examples={examples}
        active={active}
        onSelect={setActive}
        onAdd={addExample}
        onRemove={removeExample}
        onTrain={train}
        stream={camera.stream}
        videoRef={videoRef}
        canvasRef={canvasRef}
        perception={perception}
        trackerReady={trackerReady}
        sounds={sounds}
      />,
    );
  } else if (moves && step === "train") {
    screen = <TrainStep moves={moves} examples={examples} trainMs={trainMs} onTest={startTest} onAddMore={addMore} sounds={sounds} />;
  } else if (moves && step === "test") {
    screen = gate(
      <TestStep
        moves={moves}
        prediction={prediction}
        tally={tally}
        threshold={DEFAULT_REJECTION_THRESHOLD}
        stream={camera.stream}
        videoRef={videoRef}
        canvasRef={canvasRef}
        status={perception.status}
        trackerReady={trackerReady}
        onResults={showResults}
        onAddMore={addMore}
        onStartOver={startOver}
      />,
    );
  } else if (moves && step === "results") {
    screen = (
      <ResultsStep
        moves={moves}
        examples={examples}
        tally={results.tally}
        rate={results.rate}
        threshold={DEFAULT_REJECTION_THRESHOLD}
        onNextPlayer={nextPlayer}
        onTestAgain={startTest}
        onStartOver={startOver}
      />
    );
  }

  return (
    <GameShell
      slug="train-the-machine"
      sound
      // The results screen carries its own Next player button.
      actions={step !== "intro" && step !== "results" ? <NextPlayerButton onClick={nextPlayer} /> : null}
    >
      <motion.div
        key={`${visitor}-${step}`}
        initial={entrance({ opacity: 0 })}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-1 flex-col"
      >
        {screen}
      </motion.div>
    </GameShell>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="grid flex-1 place-items-center px-4 py-12 sm:px-6">{children}</div>;
}

/**
 * Booth safety net for camera screens: when nobody has been in view and
 * nobody has touched anything for a while, the visitor has left. Reset, so
 * their examples and photos don't wait for the next person.
 */
function useAbandoned(onAbandoned: () => void, lastSeenRef: RefObject<number>, { enabled, ms = ABANDONED_MS }: { enabled: boolean; ms?: number }) {
  const callback = useRef(onAbandoned);
  useEffect(() => {
    callback.current = onAbandoned;
  });

  useEffect(() => {
    if (!enabled) return;
    let lastInput = performance.now();
    const mark = () => {
      lastInput = performance.now();
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, mark, { passive: true });
    const timer = window.setInterval(() => {
      if (performance.now() - Math.max(lastInput, lastSeenRef.current) >= ms) callback.current();
    }, 5000);
    return () => {
      window.clearInterval(timer);
      for (const e of events) window.removeEventListener(e, mark);
    };
  }, [enabled, ms, lastSeenRef]);
}
