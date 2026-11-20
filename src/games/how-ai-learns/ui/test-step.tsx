"use client";

import Image from "next/image";
import { ImageOff, LoaderCircle, MousePointerClick } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { SliderRow, Segmented } from "@/components/ui/controls";
import { Modal } from "@/components/ui/dialog";
import { Stat } from "@/components/ui/score";
import { cn } from "@/lib/cn";
import { track } from "@/lib/play-tracker";
import { photoUrl, type DatasetPhoto } from "../engine/dataset";
import { decide, outcomeOf, THRESHOLD_MAX, THRESHOLD_MIN, type Decision, type Outcome } from "../engine/rules";
import { withArticle } from "./copy";
import { LiveTest } from "./live-test";
import { tallyResults, trainingGroups, type TestResult } from "./state";
import { StepLayout } from "./step-layout";
import { cameraPermission, useCamera } from "./use-camera";
import type { LearnGame } from "./use-learn-game";
import { OutcomeBadge, Verdict } from "./verdict";

const DESKTOP = "(min-width: 1024px)";
function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
/** Desktop shows results in a side panel; phones and tablets use a bottom sheet. */
function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

interface Judged {
  photo: DatasetPhoto;
  result: TestResult | null;
  failed: boolean;
  decision: Decision | null;
  outcome: Outcome | null;
}

export function TestStep({ game }: { game: LearnGame }) {
  const { state, dispatch, actions, testPhotos } = game;
  const { camera, videoRef, start, stop } = useCamera();
  const isDesktop = useIsDesktop();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Camera testing: once this visitor has allowed the camera, start it without asking again.
  const cameraMode = testPhotos.length === 0 || state.testMode === "camera";
  const cameraOff = camera.status === "off";
  const welcomed = state.cameraWelcomed;
  useEffect(() => {
    if (!cameraMode || !cameraOff) return;
    if (welcomed) {
      void start();
      return;
    }
    // The browser already allows the camera here (the booth after its first visitor): no need to ask.
    let live = true;
    void cameraPermission().then((permission) => {
      if (live && permission === "granted") dispatch({ type: "camera-welcomed" });
    });
    return () => {
      live = false;
    };
  }, [cameraMode, cameraOff, welcomed, start, dispatch]);

  if (state.train.phase !== "done") return null;
  const run = state.train.run;
  const { threshold } = state;
  const similarityCutoff = run.similarityCutoff;

  const judged: Judged[] = testPhotos.map((photo) => {
    const result = state.results[photo.id] ?? null;
    const decision = result ? decide(result.candidates, { threshold, similarityCutoff }) : null;
    return {
      photo,
      result,
      failed: state.failed.includes(photo.id),
      decision,
      outcome: result && decision ? outcomeOf(decision, result.truth) : null,
    };
  });
  const total = judged.filter((j) => !j.failed).length;
  const finished = judged.every((j) => j.result || j.failed);
  const revealed = judged.filter((j) => j.result && state.revealed.includes(j.photo.id));
  const shownTally = tallyResults(
    Object.fromEntries(revealed.map((j) => [j.photo.id, j.result as TestResult])),
    threshold,
    similarityCutoff,
  );
  const allRevealed = finished && revealed.length === total;
  const selected = judged.find((j) => j.photo.id === state.selected) ?? null;

  const setMode = (mode: "photos" | "camera") => {
    dispatch({ type: "test-mode", mode });
    track.step("test-mode", mode);
    if (mode === "photos") stop();
  };

  const select = (id: string) => {
    if (camera.status !== "off") stop();
    dispatch({ type: "select-test", id });
    if (!isDesktop) setSheetOpen(true);
  };

  const nextUnseen = () => {
    const from = judged.findIndex((j) => j.photo.id === state.selected);
    const order = [...judged.slice(from + 1), ...judged.slice(0, Math.max(0, from))];
    const next = order.find((j) => !state.revealed.includes(j.photo.id)) ?? order[0];
    if (next) dispatch({ type: "select-test", id: next.photo.id });
  };

  // In the order the visitor named them: the same marks as on the training map.
  const labels = trainingGroups(state.groups).map((g) => g.label);
  // With no library groups there are no test photos: the camera is the test.
  const cameraOnly = testPhotos.length === 0;
  const mode = cameraOnly ? "camera" : state.testMode;

  return (
    <StepLayout
      step="test"
      title={mode === "camera" ? "Test it with the camera" : "Test it on photos it has never seen"}
      lead={
        mode === "camera" ? (
          <p>Hold up each thing you taught it. Then take it away, or show it something it never learned.</p>
        ) : (
          <p>None of these {total} photos were in its examples. Tap one to see what it says.</p>
        )
      }
      secondary={
        <Button variant="ghost" size="lg" onClick={() => actions.go("examples")}>
          Change examples
        </Button>
      }
      primary={
        <Button variant="game" size="lg" arrow loading={!finished} onClick={() => actions.go("results")}>
          See the results
        </Button>
      }
      note={finished ? null : "Checking the test photos…"}
    >
      <div className="flex flex-col gap-6">
        {cameraOnly ? null : (
          <Segmented
            label="How to test"
            value={state.testMode}
            onValueChange={setMode}
            options={[
              { value: "camera", label: "Camera" },
              { value: "photos", label: `${total} new photos` },
            ]}
          />
        )}

        {mode === "camera" ? (
          <LiveTest
            camera={camera}
            videoRef={videoRef}
            onRetry={() => void start()}
            labels={labels}
            threshold={threshold}
            similarityCutoff={similarityCutoff}
            map={run.map}
            onWelcome={() => {
              dispatch({ type: "camera-welcomed" });
              void start();
            }}
            aside={<ThresholdCard value={threshold} onChange={(v) => dispatch({ type: "threshold", value: v })} />}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-start">
            <div className="flex min-w-0 flex-col gap-5">
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-4">
                {judged.map((j, i) => {
                  const isOpen = state.revealed.includes(j.photo.id);
                  const isSelected = state.selected === j.photo.id;
                  const said = j.decision ? (j.decision.answer?.toLowerCase() ?? "I don’t know") : null;
                  return (
                    <li key={j.photo.id}>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => select(j.photo.id)}
                        aria-label={
                          isOpen && j.outcome && said
                            ? `Photo ${i + 1}, ${withArticle(j.photo.label)}. It said ${said}: ${j.outcome === "unknown" ? "not sure" : j.outcome}.`
                            : `Test photo ${i + 1}, ${withArticle(j.photo.label)}`
                        }
                        className={cn(
                          "group/tile relative block aspect-square w-full overflow-hidden rounded-md bg-sunken",
                          "transition-[box-shadow,transform] duration-150 ease-out active:scale-[0.97]",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                          isSelected && "ring-2 ring-game ring-offset-2 ring-offset-canvas",
                        )}
                      >
                        <Image
                          src={photoUrl(j.photo)}
                          alt=""
                          fill
                          unoptimized
                          sizes="(min-width: 1024px) 160px, (min-width: 640px) 25vw, 33vw"
                          className="object-cover"
                        />
                        {isOpen && j.outcome ? <OutcomeBadge outcome={j.outcome} className="absolute bottom-1.5 left-1.5" /> : null}
                        {j.failed ? (
                          <span className="absolute inset-0 grid place-items-center bg-black/60 text-white">
                            <ImageOff className="size-5" aria-hidden />
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-ring">
                <div aria-live="polite" className="flex flex-wrap items-end gap-x-8 gap-y-4">
                  {revealed.length === 0 ? (
                    <p className="type-body text-fg-muted">Tap a photo to test it.</p>
                  ) : (
                    <>
                      <Stat value={`${shownTally.right} of ${revealed.length}`} label="Right" />
                      <Stat value={shownTally.wrong} label="Wrong" />
                      <Stat value={shownTally.unknown} label="“I don’t know”" />
                    </>
                  )}
                </div>
                {!allRevealed ? (
                  <Button
                    variant="secondary"
                    size="lg"
                    className="self-start"
                    disabled={!finished}
                    onClick={() => dispatch({ type: "reveal-all" })}
                  >
                    Check all {total} photos
                  </Button>
                ) : null}
              </div>

              <ThresholdCard className="lg:hidden" value={threshold} onChange={(v) => dispatch({ type: "threshold", value: v })} />
            </div>

            <div className="hidden flex-col gap-4 lg:sticky lg:top-6 lg:flex">
              <div className="rounded-xl bg-surface p-5 shadow-ring">
                {selected ? (
                  <ResultView judged={selected} threshold={threshold} />
                ) : (
                  <div className="flex min-h-80 flex-col items-center justify-center gap-3 text-center">
                    <span className="grid size-14 place-items-center rounded-full bg-game-soft text-game">
                      <MousePointerClick className="size-6" aria-hidden />
                    </span>
                    <p className="type-title-3 text-fg">Pick a photo to test</p>
                    <p className="type-small max-w-[18rem] text-fg-subtle">It will say what it is, how sure it is, or that it doesn’t know.</p>
                  </div>
                )}
              </div>
              <ThresholdCard value={threshold} onChange={(v) => dispatch({ type: "threshold", value: v })} />
            </div>
          </div>
        )}
      </div>

      {!isDesktop && selected ? (
        <Modal
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={`Test photo ${judged.indexOf(selected) + 1} of ${judged.length}`}
          footer={
            <>
              <Button variant="ghost" size="lg" onClick={() => setSheetOpen(false)}>
                Back to photos
              </Button>
              <Button variant="secondary" size="lg" onClick={nextUnseen}>
                Next photo
              </Button>
            </>
          }
        >
          <ResultView judged={selected} threshold={threshold} />
        </Modal>
      ) : null}
    </StepLayout>
  );
}

function ResultView({ judged, threshold }: { judged: Judged; threshold: number }) {
  const { photo, result, failed, decision, outcome } = judged;
  return (
    <div className="flex flex-col gap-5">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-sunken">
        <Image
          src={photoUrl(photo)}
          alt={`${photo.label}: ${photo.title}`}
          fill
          unoptimized
          sizes="(min-width: 1024px) 400px, 100vw"
          className="object-contain"
        />
      </div>
      {failed ? (
        <p className="type-body text-fg-muted">This photo didn’t load, so it was left out of the score.</p>
      ) : !result || !decision ? (
        <p className="type-body inline-flex items-center gap-2 text-fg-muted">
          <LoaderCircle className="size-5 animate-spin text-game" aria-hidden />
          Checking this photo
        </p>
      ) : (
        <Verdict candidates={result.candidates} decision={decision} threshold={threshold} truth={result.truth} outcome={outcome ?? undefined} />
      )}
    </div>
  );
}

function ThresholdCard({ value, onChange, className }: { value: number; onChange: (value: number) => void; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl bg-surface p-5 shadow-ring", className)}>
      <SliderRow
        label="How sure must it be before it answers?"
        value={Math.round(value * 100)}
        onValueChange={(v) => onChange(v / 100)}
        min={Math.round(THRESHOLD_MIN * 100)}
        max={Math.round(THRESHOLD_MAX * 100)}
        step={5}
        valueText={`${Math.round(value * 100)}%`}
      />
      <p className="type-small text-fg-subtle">Higher means more “I don’t know” and fewer mistakes.</p>
    </div>
  );
}
