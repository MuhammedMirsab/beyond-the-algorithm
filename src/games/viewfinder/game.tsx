"use client";

import { CircleQuestionMark, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GameArt } from "@/components/art/game-art";
import { PRIVACY_LINE } from "@/components/game/camera-notice";
import { GameIntro } from "@/components/game/game-intro";
import { GameShell } from "@/components/game/game-shell";
import { Button, IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useIdle } from "@/lib/idle";
import {
  ViewfinderError,
  cameraPermission,
  hasMultipleCameras,
  issueForEndedCamera,
  issueFrom,
  openCamera,
  stopStream,
  type CameraFacing,
  type ViewfinderIssue,
} from "./engine/camera";
import { ViewfinderEngine } from "./engine/engine";
import { EngineStore } from "./engine/store";
import {
  disposeHandTracker,
  isHandTrackerReady,
  loadHandTracker,
  type Delegate,
  type LoadProgress,
} from "./engine/tracker";
import { INTRO_STEPS, averageRate, type SessionNumbers, type SessionSummary } from "./ui/copy";
import { HowItWorksModal } from "./ui/how-it-works";
import { LiveHud } from "./ui/live-hud";
import { LoadingScreen } from "./ui/loading-screen";
import { ProblemScreen } from "./ui/problem-screen";
import { SessionEnd } from "./ui/session-end";

type Phase = "intro" | "loading" | "live" | "ended" | "error";
type Permission = PermissionState | "unknown" | "checking";

/** Booth: no hands in the picture (and no key or mouse) for this long during play → back to the intro. */
const ABSENT_MS = 60_000;
/** Booth: intro, results and problem screens reset after this long without input (DESIGN.md §10). */
const IDLE_MS = 90_000;

const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

function waitForFrame(video: HTMLVideoElement, timeoutMs = 10_000) {
  return new Promise<void>((resolve, reject) => {
    if (video.readyState >= 2 && video.videoWidth > 0) return resolve();
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new ViewfinderError("unknown", "The camera sent no picture"));
    };
    const timer = window.setTimeout(onError, timeoutMs);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", onError);
  });
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** `?delegate=gpu|cpu` pins a backend (skips the startup benchmark) on known booth hardware. */
function pinnedDelegate(): Delegate | undefined {
  const pinned = new URLSearchParams(window.location.search).get("delegate")?.toUpperCase();
  return pinned === "GPU" || pinned === "CPU" ? pinned : undefined;
}

/**
 * Viewfinder: frame the world with both hands.
 *
 * intro → loading (model download in parallel with the camera prompt) → live
 * → ended (the reveal) → intro. Any failure lands on a problem screen that
 * can retry. One run token guards every async step, so End session, retries
 * and unmounting (StrictMode included) can never leave a camera or a GL
 * context behind.
 */
export function ViewfinderGame() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ViewfinderEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** The last canvas an engine drew on. Its GL context was released, so it can't be used again. */
  const spentCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const facingRef = useRef<CameraFacing>("user");
  const liveSinceRef = useRef(0);
  const runRef = useRef(0);

  const [store] = useState(() => new EngineStore());
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [phase, setPhase] = useState<Phase>("intro");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [cameraPending, setCameraPending] = useState(false);
  const [permission, setPermission] = useState<Permission>("checking");
  const [issue, setIssue] = useState<ViewfinderIssue | null>(null);
  const [canFlip, setCanFlip] = useState(false);
  /** New canvases for every session (see spentCanvasRef). */
  const [canvasKey, setCanvasKey] = useState(0);
  const [howOpen, setHowOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  /** Tear down the engine (and its GL context), the camera and the video. */
  const release = useCallback(() => {
    engineRef.current?.dispose();
    engineRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    }
  }, []);

  /** Invalidate any in-flight start() and release everything. */
  const stop = useCallback(() => {
    runRef.current++;
    release();
  }, [release]);

  const start = useCallback(
    async (facing: CameraFacing) => {
      const run = ++runRef.current;
      const alive = () => runRef.current === run;
      release();
      facingRef.current = facing;
      store.resetSession();
      setIssue(null);
      setProgress(null);
      // Play again: the tracker is already loaded, so the first frame says "Starting the camera".
      setModelReady(isHandTrackerReady());
      setPermission("checking");
      setCanFlip(false);
      setHowOpen(false);
      setCanvasKey((k) => k + 1);
      setPhase("loading");

      try {
        void cameraPermission().then((state) => {
          if (alive()) setPermission(state);
        });

        // Model download and the camera permission prompt run in parallel.
        const trackerReady = loadHandTracker((p) => {
          if (alive()) setProgress(p);
        }, pinnedDelegate()).catch((err: unknown) => {
          throw new ViewfinderError("model", err instanceof Error ? err.message : String(err));
        });
        trackerReady.then(
          () => {
            if (alive()) setModelReady(true);
          },
          // A model failure is reported below, once the camera step is done.
          () => {},
        );

        setCameraPending(true);
        const stream = await openCamera(facing).finally(() => {
          if (alive()) setCameraPending(false);
        });
        if (!alive()) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;

        const tracker = await trackerReady;
        if (!alive()) return;

        const video = videoRef.current;
        if (!video) throw new ViewfinderError("unknown", "The video element is missing");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play().catch(() => {
          throw new ViewfinderError("unknown", "The camera picture would not play");
        });
        await waitForFrame(video);
        if (!alive()) return;

        // React swaps in fresh canvases for this session; wait a frame if it hasn't yet.
        if (glRef.current === spentCanvasRef.current) await nextFrame();
        if (!alive()) return;
        const glCanvas = glRef.current;
        const overlayCanvas = overlayRef.current;
        if (!glCanvas || !overlayCanvas || glCanvas === spentCanvasRef.current) {
          throw new ViewfinderError("unknown", "There was no fresh canvas to draw on");
        }

        let engine: ViewfinderEngine;
        try {
          const { lens, skeleton } = store.getSnapshot();
          engine = new ViewfinderEngine({
            video,
            glCanvas,
            overlayCanvas,
            tracker,
            store,
            mirror: facing === "user",
            fit: "cover",
            lens,
            skeleton,
          });
        } catch (err) {
          throw new ViewfinderError("webgl", err instanceof Error ? err.message : String(err));
        }
        spentCanvasRef.current = glCanvas;
        engineRef.current = engine;
        engine.start();
        liveSinceRef.current = performance.now();
        setPhase("live");

        stream.getVideoTracks()[0]?.addEventListener(
          "ended",
          () => {
            if (!alive()) return;
            stop();
            const lost = runRef.current;
            void issueForEndedCamera().then((next) => {
              if (runRef.current !== lost) return;
              store.resetSession();
              setIssue(next);
              setHowOpen(false);
              setPhase("error");
            });
          },
          { once: true },
        );
        // Front/back switching is for phones and tablets. Laptops often list a face-login IR
        // camera too, which would put a confusing "Switch camera" on the booth screen.
        if (window.matchMedia("(pointer: coarse)").matches) {
          void hasMultipleCameras().then((multi) => {
            if (alive()) setCanFlip(multi);
          });
        }
      } catch (err) {
        if (!alive()) return;
        release();
        setCameraPending(false);
        setIssue(issueFrom(err));
        setPhase("error");
      }
    },
    [release, stop, store],
  );

  /** Next player, idle timeouts and nobody-there: forget everything, back to the first screen. */
  const resetToIntro = useCallback(() => {
    stop();
    store.reset();
    setSummary(null);
    setIssue(null);
    setHowOpen(false);
    setShowStats(false);
    setPhase("intro");
  }, [stop, store]);

  /** End session: keep this visitor's numbers for the reveal, release the camera, reset the hints. */
  const endSession = useCallback(() => {
    const counts = engineRef.current?.sessionCounts() ?? { framesTracked: 0, handsFound: 0, locks: 0, lensesTried: 0 };
    const seconds = (performance.now() - liveSinceRef.current) / 1000;
    setSummary({ ...counts, seconds, perSecond: averageRate(counts.framesTracked, seconds) });
    stop();
    store.resetSession();
    setHowOpen(false);
    setPhase("ended");
  }, [stop, store]);

  const playAgain = useCallback(() => {
    setSummary(null);
    void start(facingRef.current);
  }, [start]);

  const retry = useCallback(() => void start(facingRef.current), [start]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  // Release the camera, the GL context and the tracker when the game leaves the screen.
  // (Fast Refresh re-runs this cleanup while mounted; going back to the intro keeps the UI honest.)
  useEffect(
    () => () => {
      stop();
      disposeHandTracker();
      setHowOpen(false);
      setPhase("intro");
    },
    [stop],
  );

  // Each screen starts at the top (the results page is long; the live view is not scrollable).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase]);

  // Keyboard: 1 to 0 lenses, ← → cycle, M mirror, H what the AI sees, F full screen.
  useEffect(() => {
    if (phase !== "live" || howOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]")) return;
      const engine = engineRef.current;
      if (!engine) return;
      const key = e.key.toLowerCase();
      // Holding an arrow keeps cycling; holding a toggle key must not flicker it.
      if (e.repeat && key !== "arrowleft" && key !== "arrowright") return;
      if (/^[0-9]$/.test(key)) {
        const n = Number(key);
        engine.setLens(n === 0 ? 9 : n - 1);
      } else if (key === "arrowright") {
        e.preventDefault();
        engine.stepLens(1);
      } else if (key === "arrowleft") {
        e.preventDefault();
        engine.stepLens(-1);
      } else if (key === "m") engine.setMirror(!store.getSnapshot().mirror);
      else if (key === "h") engine.setSkeleton(!store.getSnapshot().skeleton);
      else if (key === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, howOpen, store, toggleFullscreen]);

  // Booth: camera play sends no input events, so "nobody there" means no hands
  // in the picture and no key or mouse for a minute. Paused while reading.
  useEffect(() => {
    if (phase !== "live" || howOpen) return;
    let lastInput = performance.now();
    const onInput = () => {
      lastInput = performance.now();
    };
    for (const name of INPUT_EVENTS) window.addEventListener(name, onInput, { passive: true });
    const timer = window.setInterval(() => {
      const engine = engineRef.current;
      const now = performance.now();
      if (engine && engine.handsAbsentFor(now) > ABSENT_MS && now - lastInput > ABSENT_MS) resetToIntro();
    }, 1000);
    return () => {
      window.clearInterval(timer);
      for (const name of INPUT_EVENTS) window.removeEventListener(name, onInput);
    };
  }, [phase, howOpen, resetToIntro]);

  // Booth: screens without a camera in use (and the reading modal) reset after 90 s idle.
  useIdle(resetToIntro, {
    ms: IDLE_MS,
    enabled: phase === "intro" || phase === "ended" || phase === "error" || (phase === "live" && howOpen),
  });

  const live = phase === "live";
  const waitingForPermission = cameraPending && (permission === "prompt" || permission === "unknown");
  const liveNumbers: SessionNumbers = {
    framesTracked: snap.framesTracked,
    handsFound: snap.handsFound,
    perSecond: snap.fps > 0 ? snap.fps : null,
    locks: snap.locks,
    lensesTried: snap.lensesTried,
  };

  return (
    <GameShell
      slug="viewfinder"
      immersive={live}
      actions={live ? <LiveActions onHowItWorks={() => setHowOpen(true)} onEnd={endSession} /> : null}
    >
      {/* Stage: always mounted, so the video element is stable; canvases are new each session.
          The video stays composited under the opaque GL canvas so requestVideoFrameCallback keeps firing. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 overflow-hidden bg-black",
          live ? "opacity-100 transition-opacity duration-400 ease-out" : "pointer-events-none opacity-0",
        )}
      >
        <video ref={videoRef} className="absolute inset-0 size-full object-cover" muted playsInline disablePictureInPicture />
        <canvas key={`gl-${canvasKey}`} ref={glRef} className="absolute inset-0 size-full" />
        <canvas key={`ui-${canvasKey}`} ref={overlayRef} className="pointer-events-none absolute inset-0 size-full" />
      </div>

      {live ? (
        <LiveHud
          snap={snap}
          showStats={showStats}
          canFlip={canFlip}
          onLens={(i) => engineRef.current?.setLens(i)}
          onStep={(d) => engineRef.current?.stepLens(d)}
          onMirror={() => engineRef.current?.setMirror(!store.getSnapshot().mirror)}
          onSkeleton={() => engineRef.current?.setSkeleton(!store.getSnapshot().skeleton)}
          onStats={() => setShowStats((on) => !on)}
          onFlip={() => void start(facingRef.current === "user" ? "environment" : "user")}
        />
      ) : (
        <div className="relative z-10 flex flex-1 flex-col">
          {phase === "intro" ? (
            <GameIntro
              slug="viewfinder"
              art={<GameArt slug="viewfinder" />}
              steps={INTRO_STEPS}
              primary={{ label: "Turn on camera", onClick: () => void start("user") }}
              footnote={PRIVACY_LINE}
            />
          ) : null}
          {phase === "loading" ? (
            <LoadingScreen waitingForPermission={waitingForPermission} progress={progress} modelReady={modelReady} />
          ) : null}
          {phase === "error" && issue ? <ProblemScreen issue={issue} onRetry={retry} /> : null}
          {phase === "ended" && summary ? (
            <SessionEnd summary={summary} onNextPlayer={resetToIntro} onPlayAgain={playAgain} />
          ) : null}
        </div>
      )}

      <HowItWorksModal open={live && howOpen} onOpenChange={setHowOpen} numbers={liveNumbers} />
    </GameShell>
  );
}

/** Header actions during play. Icon-only on phones, where the header is tight. */
function LiveActions({ onHowItWorks, onEnd }: { onHowItWorks: () => void; onEnd: () => void }) {
  return (
    <>
      <Button variant="secondary" icon={<CircleQuestionMark />} onClick={onHowItWorks} className="max-sm:hidden">
        How it works
      </Button>
      <IconButton label="How it works" icon={<CircleQuestionMark />} onClick={onHowItWorks} className="sm:hidden" />
      <Button variant="secondary" icon={<X />} onClick={onEnd} className="max-sm:hidden">
        End session
      </Button>
      <IconButton label="End session" icon={<X />} onClick={onEnd} className="sm:hidden" />
    </>
  );
}
