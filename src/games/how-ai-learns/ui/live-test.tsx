"use client";

import { ScanEye } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { CameraProblem, CameraPrompt, CameraWaiting } from "@/components/game/camera-notice";
import { ConfidenceBars } from "@/components/ui/meter";
import { cn } from "@/lib/cn";
import { scoreEmbedding } from "../engine/classifier";
import { analyzePresence, type EmptyReason } from "../engine/presence";
import { decide, NONE_LABEL, type Candidate, type Decision } from "../engine/rules";
import { extractEmbedding, loadTf } from "../engine/vision";
import { withArticle } from "./copy";
import { getSession } from "./session";
import type { CameraState } from "./use-camera";
import { Verdict } from "./verdict";

/** "a cup or a pen", "a cup, keys or a pen". */
const orWords = (words: string[]) =>
  words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;

type LiveReading = { kind: "empty"; reason: EmptyReason } | { kind: "result"; candidates: Candidate[] };

/** Time between the end of one prediction and the start of the next. */
const FRAME_GAP_MS = 200;

/** What it says when none of the visitor's things is in the picture. */
export const NO_OBJECT_TITLE = "No object is present on the screen";

/** Why it sees no object, without naming a guess it isn't sure of. */
function noObjectReason(decision: Decision): string {
  if (decision.reason === "nothing") return `It matches the “${NONE_LABEL}” photos best.`;
  if (decision.reason === "unfamiliar") return "Nothing here looks like the things it learned.";
  return "Nothing here looks enough like the things it learned.";
}

const EMPTY_COPY: Record<EmptyReason, string> = {
  dark: "The picture is too dark. Turn towards the light.",
  blank: "The picture is almost one colour. Hold something up to the camera.",
  "no-edges": "It can’t make out any shapes. Hold something closer.",
};

/**
 * Live test: every frame goes through MobileNet and the visitor's model.
 * Frames are never stored; the embedding of a frame is thrown away at once.
 */
export function LiveTest({
  camera,
  videoRef,
  onRetry,
  labels,
  threshold,
  similarityCutoff,
  onWelcome,
}: {
  camera: CameraState;
  videoRef: RefObject<HTMLVideoElement | null>;
  onRetry: () => void;
  labels: string[];
  threshold: number;
  similarityCutoff: number;
  onWelcome: () => void;
}) {
  const [reading, setReading] = useState<LiveReading | null>(null);
  const status = camera;
  const live = status.status === "live";
  const things = labels.filter((l) => l !== NONE_LABEL);

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
            if (!cancelled) setReading({ kind: "empty", reason: presence.reason });
          } else {
            const tf = await loadTf();
            const embedding = await extractEmbedding(video);
            const candidates = await scoreEmbedding(tf, classifier, embedding);
            if (!cancelled) setReading({ kind: "result", candidates });
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

  if (status.status === "off") {
    return (
      <div className="py-6">
        <CameraPrompt
          title="Test it with the camera"
          text={`Hold up ${orWords(things.map(withArticle))}. Then take it away, or try something it never learned, like your hand.`}
          onAllow={onWelcome}
        />
      </div>
    );
  }
  if (status.status === "waiting") {
    return (
      <div className="py-6">
        <CameraWaiting />
      </div>
    );
  }
  if (status.status === "error") {
    return (
      <div className="py-6">
        <CameraProblem issue={status.issue} onRetry={onRetry} />
      </div>
    );
  }

  const decision = reading?.kind === "result" ? decide(reading.candidates, { threshold, similarityCutoff }) : null;
  const noObject = reading?.kind === "empty" || (decision !== null && decision.answer === null);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-8">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-sunken">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-hidden
          className={cn("size-full object-cover", status.mirrored && "-scale-x-100")}
        />
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-4">
        {reading === null ? (
          <p className="type-body text-fg-muted">Looking…</p>
        ) : noObject ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="type-label text-fg-subtle">It says</span>
              <p aria-live="polite" className="type-title-1 text-fg">
                {NO_OBJECT_TITLE}
              </p>
              <p className="type-small inline-flex items-start gap-2 text-fg-muted">
                <ScanEye className="mt-0.5 size-4 shrink-0" aria-hidden />
                {reading.kind === "empty" ? EMPTY_COPY[reading.reason] : decision ? noObjectReason(decision) : null}
              </p>
            </div>
            {reading.kind === "result" ? (
              <ConfidenceBars
                rows={reading.candidates.map((c) => ({ id: c.label, label: c.label, value: c.probability }))}
                highlight={NONE_LABEL}
              />
            ) : null}
          </div>
        ) : decision && reading.kind === "result" ? (
          <Verdict candidates={reading.candidates} decision={decision} threshold={threshold} live />
        ) : null}
      </div>
    </div>
  );
}
