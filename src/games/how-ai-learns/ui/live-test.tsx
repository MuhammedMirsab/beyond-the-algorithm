"use client";

import { CircleHelp, ScanEye, ScanSearch } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { CameraProblem, CameraPrompt, CameraWaiting } from "@/components/game/camera-notice";
import { cn } from "@/lib/cn";
import { scoreEmbedding, type Classifier } from "../engine/classifier";
import { objectAxes, objectScore, type ObjectAxes } from "../engine/objectness";
import { analyzePresence, type EmptyReason } from "../engine/presence";
import { placeOnMap, type Point2, type TrainMap } from "../engine/projection";
import { decide, LIVE_CUTOFF_SHARE, NONE_LABEL, type Candidate, type Decision } from "../engine/rules";
import { extractEmbedding, loadTf } from "../engine/vision";
import { ClusterMap } from "./cluster-map";
import { explainDecision, withArticle } from "./copy";
import { getSession, UNSURE } from "./session";
import type { CameraState } from "./use-camera";
import { SureBars } from "./verdict";

/** "a cup or a pen", "a cup, keys or a pen". */
const orWords = (words: string[]) =>
  words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;

type LiveReading =
  | { kind: "empty"; reason: EmptyReason }
  /** present: one of its things stands out from the scene (objectness.ts). */
  | { kind: "result"; candidates: Candidate[]; point: Point2 | null; present: boolean };

/** Time between the end of one prediction and the start of the next. */
const FRAME_GAP_MS = 200;

/** What it says when none of the visitor's things is in the picture. */
export const NO_OBJECT_TITLE = "No object is present on the screen";

/** Why it sees no object, without naming a guess it isn't sure of. */
function noObjectReason(present: boolean): string {
  if (!present) return "Nothing stands out from the background behind your things.";
  return "Nothing here looks enough like the things it learned.";
}

/** The usual decision, with a looser familiarity check for live frames. */
function decideLive(reading: LiveReading, threshold: number, similarityCutoff: number): Decision | null {
  if (reading.kind !== "result") return null;
  return decide(reading.candidates, { threshold, similarityCutoff: similarityCutoff * LIVE_CUTOFF_SHARE });
}

/** The shared scene and group directions, worked out once per trained model. */
let axesFor: { classifier: Classifier; axes: ObjectAxes } | null = null;
function axesOf(classifier: Classifier): ObjectAxes {
  if (axesFor?.classifier !== classifier) axesFor = { classifier, axes: objectAxes(classifier.centroids) };
  return axesFor.axes;
}

const EMPTY_COPY: Record<EmptyReason, string> = {
  dark: "The picture is too dark. Turn towards the light.",
  blank: "The picture is almost one colour. Hold something up to the camera.",
  "no-edges": "It can’t make out any shapes. Hold something closer.",
};

interface PlateView {
  key: string;
  word: string;
  line: string;
  icon: ReactNode;
  tone: "game" | "dark";
  /** Long words (the no-object sentence) get a smaller size. */
  long?: boolean;
}

function plateFor(reading: LiveReading | null, decision: Decision | null, threshold: number): PlateView {
  if (!reading) return { key: "look", word: "Looking", line: "Hold something up", icon: <ScanSearch />, tone: "dark" };
  if (reading.kind === "empty") {
    return { key: `empty-${reading.reason}`, word: NO_OBJECT_TITLE, line: EMPTY_COPY[reading.reason], icon: <ScanEye />, tone: "dark", long: true };
  }
  if (!reading.present) {
    return { key: "none", word: NO_OBJECT_TITLE, line: noObjectReason(false), icon: <ScanEye />, tone: "dark", long: true };
  }
  if (!decision) return { key: "look", word: "Looking", line: "Hold something up", icon: <ScanSearch />, tone: "dark" };
  if (decision.answer) {
    return {
      key: `is-${decision.answer}`,
      word: decision.answer,
      line: `${Math.round(decision.top.probability * 100)}% sure`,
      icon: <ScanEye />,
      tone: "game",
    };
  }
  if (decision.reason === "unfamiliar") {
    return { key: "none", word: NO_OBJECT_TITLE, line: noObjectReason(true), icon: <ScanEye />, tone: "dark", long: true };
  }
  return { key: "unsure", word: "I don’t know", line: explainDecision(decision, threshold), icon: <CircleHelp />, tone: "dark" };
}

/**
 * Live test: every frame goes through MobileNet and the visitor's model.
 * Frames are never stored; the embedding of a frame is thrown away at once.
 * The answer sits on the video; the side shows how sure it is and where the
 * frame lands on the map of the visitor's photos.
 */
export function LiveTest({
  camera,
  videoRef,
  onRetry,
  labels,
  threshold,
  similarityCutoff,
  map,
  onWelcome,
  aside,
}: {
  camera: CameraState;
  videoRef: RefObject<HTMLVideoElement | null>;
  onRetry: () => void;
  labels: string[];
  threshold: number;
  similarityCutoff: number;
  map: TrainMap | null;
  onWelcome: () => void;
  /** More controls under the side panel (the threshold slider). */
  aside?: ReactNode;
}) {
  const [reading, setReading] = useState<LiveReading | null>(null);
  const live = camera.status === "live";
  const things = labels;
  // The loop reads these without restarting.
  const settings = useRef({ threshold, similarityCutoff, map });
  useEffect(() => {
    settings.current = { threshold, similarityCutoff, map };
  });

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    let timer = 0;
    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      const classifier = getSession().getClassifier();
      if (video && classifier && video.readyState >= 2 && video.videoWidth) {
        try {
          const presence = analyzePresence(video);
          if (presence.isEmpty && presence.reason) {
            if (!cancelled) {
              setReading({ kind: "empty", reason: presence.reason });
              getSession().recordLive(NONE_LABEL);
            }
          } else {
            const tf = await loadTf();
            const embedding = await extractEmbedding(video);
            const candidates = await scoreEmbedding(tf, classifier, embedding);
            if (!cancelled) {
              const { map: m, threshold: t, similarityCutoff: cut } = settings.current;
              const present = objectScore(axesOf(classifier), embedding) >= classifier.objectCutoff;
              const next: LiveReading = { kind: "result", candidates, point: m ? placeOnMap(m, embedding) : null, present };
              setReading(next);
              const d = decideLive(next, t, cut);
              getSession().recordLive(!present || d?.reason === "unfamiliar" ? NONE_LABEL : (d?.answer ?? UNSURE));
            }
          }
        } catch {
          // A dropped frame; the next one usually works.
        }
      }
      if (!cancelled) timer = window.setTimeout(tick, FRAME_GAP_MS);
    };
    timer = window.setTimeout(tick, FRAME_GAP_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [live, videoRef]);

  if (camera.status === "off") {
    return (
      <div className="rounded-xl bg-surface px-4 py-10 shadow-ring">
        <CameraPrompt
          title="Test it with the camera"
          text={`Hold up ${orWords(things.map(withArticle))}. Then take it away, or try something it never learned, like your hand.`}
          onAllow={onWelcome}
        />
      </div>
    );
  }
  if (camera.status === "waiting") {
    return (
      <div className="rounded-xl bg-surface px-4 py-10 shadow-ring">
        <CameraWaiting />
      </div>
    );
  }
  if (camera.status === "error") {
    return (
      <div className="rounded-xl bg-surface px-4 py-10 shadow-ring">
        <CameraProblem issue={camera.issue} onRetry={onRetry} />
      </div>
    );
  }

  const decision = reading ? decideLive(reading, threshold, similarityCutoff) : null;
  const present = reading?.kind === "result" && reading.present;
  const plate = plateFor(reading, decision, threshold);
  const point = reading?.kind === "result" ? reading.point : null;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-6">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-sunken shadow-ring">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-label="Your camera"
          className={cn("absolute inset-0 size-full object-cover", camera.mirrored && "-scale-x-100")}
        />
        <div className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%-1.5rem)] sm:left-4 sm:top-4 sm:max-w-[min(30rem,calc(100%-2rem))]">
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg py-3 pl-3 pr-5 transition-colors duration-150 ease-out",
              plate.tone === "game" ? "bg-game text-game-ink" : "bg-black/75 text-white",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-md [&_svg]:size-6",
                plate.tone === "game" ? "bg-game-ink text-game" : "bg-white/15 text-white",
              )}
            >
              {plate.icon}
            </span>
            <span className="flex min-w-0 flex-col">
              {/* The answer swaps at once (it changes a few times a second); the plate's colour marks the change. */}
              <span className={cn(plate.long ? "type-title-3" : "type-title-1 truncate")}>{plate.word}</span>
              <span className="type-small font-semibold tabular-nums opacity-90">{plate.line}</span>
            </span>
          </div>
        </div>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {plate.word}
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-ring">
          <h2 className="type-small font-semibold text-fg">How sure it is</h2>
          {reading?.kind === "result" && decision ? (
            <SureBars candidates={reading.candidates} decision={present ? decision : { ...decision, answer: null }} threshold={threshold} />
          ) : (
            <p className="type-small text-fg-subtle">
              {reading?.kind === "empty" ? "Nothing to read in this picture, so it doesn’t guess." : "Waiting for the first picture."}
            </p>
          )}
        </div>
        {map ? (
          <div className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-ring">
            <div className="flex flex-col gap-0.5">
              <h2 className="type-small font-semibold text-fg">Where the camera lands among your photos</h2>
              <p className="type-caption text-fg-subtle">The white ring is what the camera sees now.</p>
            </div>
            <div className="dot-field overflow-hidden rounded-lg bg-sunken">
              <ClusterMap
                map={map}
                labels={labels}
                live={point}
                answer={present ? (decision?.answer ?? null) : null}
                label="Your photos as dots, and a ring for what the camera sees now. It moves towards the photos it looks most like."
              />
            </div>
          </div>
        ) : null}
        {aside}
      </div>
    </div>
  );
}
