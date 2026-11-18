"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { KeyHints } from "@/components/ui/key-hints";
import { Progress } from "@/components/ui/progress";
import { Stat } from "@/components/ui/score";
import { ModelLoading } from "@/components/game/camera-notice";
import type { TrainMap } from "../engine/projection";
import { EMBEDDING_SIZE, MODEL_NAME } from "../engine/vision";
import { AccuracyChart } from "./accuracy-chart";
import { ClusterMap, MarkSwatch } from "./cluster-map";
import { pct } from "./copy";
import { EmbeddingDots } from "./embedding-dots";
import { StepLayout } from "./step-layout";
import { trainingGroups, type TrainState } from "./state";
import type { LearnGame } from "./use-learn-game";

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
const NUMBERS = EMBEDDING_SIZE.toLocaleString("en");

function copyFor(train: TrainState): { title: string; lead: string } {
  switch (train.phase) {
    case "idle":
    case "model":
      return {
        title: "Getting the AI ready",
        lead: "Loading MobileNet, the part that already knows how to look at photos.",
      };
    case "reading":
      return {
        title: "Turning photos into numbers",
        lead: `MobileNet reads each photo and writes down ${NUMBERS} numbers about it. That list is all the next part ever sees.`,
      };
    case "practising":
      return {
        title: "Practising on your examples",
        lead: "Each round it labels every example, checks the answers, and adjusts itself to be less wrong.",
      };
    case "done":
      return {
        title: `Trained on ${train.run.examples} photos in ${train.run.seconds.toFixed(1)} seconds`,
        lead: "Now test it on things it has never seen.",
      };
    case "error":
      return { title: "Training didn’t finish", lead: train.message };
  }
}

export function TrainStep({ game }: { game: LearnGame }) {
  const { state, model, actions } = game;
  const train = state.train;
  const { title, lead } = copyFor(train);
  const done = train.phase === "done";

  // Space tests it once training is done.
  const goRef = useRef(actions.go);
  useEffect(() => {
    goRef.current = actions.go;
  });
  useEffect(() => {
    if (!done) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.code !== "Space" && e.key !== " ") || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      goRef.current("test");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [done]);

  const announce =
    train.phase === "reading"
      ? "Reading your photos."
      : train.phase === "practising"
        ? "Practising on your examples."
        : train.phase === "done"
          ? `Done. It gets ${pct(train.run.history.at(-1)?.accuracy ?? 0)} of its examples right.`
          : train.phase === "error"
            ? train.message
            : "Loading the AI model.";

  return (
    <StepLayout
      step="train"
      title={title}
      lead={<p>{lead}</p>}
      secondary={
        train.phase === "done" || train.phase === "error" ? (
          <Button variant="ghost" size="lg" onClick={() => actions.go("examples")}>
            Change examples
          </Button>
        ) : null
      }
      primary={
        train.phase === "done" ? (
          <Button variant="game" size="lg" arrow onClick={() => actions.go("test")}>
            Test it
          </Button>
        ) : train.phase === "error" ? (
          <Button variant="game" size="lg" onClick={() => void actions.train()}>
            Try again
          </Button>
        ) : null
      }
      note={done ? <KeyHints className="hidden justify-end lg:flex" items={[{ keys: ["Space"], label: "Test it" }]} /> : null}
    >
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      {train.phase === "idle" || train.phase === "model" ? (
        <div className="grid min-h-64 place-items-center rounded-xl bg-surface px-4 py-12 shadow-ring">
          <ModelLoading
            label="Loading the AI model"
            progress={model.state === "loading" && model.total ? model.loaded / model.total : null}
            detail={
              model.state === "loading" && model.total ? `${MODEL_NAME} · ${mb(model.loaded)} of ${mb(model.total)} MB` : MODEL_NAME
            }
          />
        </div>
      ) : null}

      {train.phase === "reading" ? (
        <div className="flex flex-col gap-4">
          <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <figure className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-ring">
              <div className="relative aspect-[5/4] overflow-hidden rounded-md bg-sunken">
                {train.current ? (
                  <Image
                    key={train.current.photo.id}
                    src={train.current.photo.url}
                    alt={`${train.current.photo.label}: ${train.current.photo.title}`}
                    fill
                    unoptimized
                    sizes="(min-width: 640px) 500px, 100vw"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <figcaption className="flex items-baseline justify-between gap-2">
                <span className="type-body truncate font-semibold text-fg">{train.current?.photo.label ?? ""}</span>
                <span className="type-label tabular-nums text-fg-subtle">
                  Photo {train.done} of {train.total}
                </span>
              </figcaption>
            </figure>
            <ArrowRight aria-hidden className="mx-auto size-7 rotate-90 text-game sm:rotate-0" />
            <figure className="dot-field flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-ring">
              {train.current ? (
                <EmbeddingDots values={train.current.embedding} label={`The ${NUMBERS} numbers MobileNet made from this photo, drawn as dots.`} />
              ) : (
                <div className="aspect-[5/4]" />
              )}
              <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="type-label text-game">{NUMBERS} numbers</span>
                <span className="type-caption text-fg-subtle">Bigger dot, bigger number</span>
              </figcaption>
            </figure>
          </div>
          <Progress value={train.total ? train.done / train.total : 0} label="Reading photos" tone="game" />
        </div>
      ) : null}

      {train.phase === "practising" || train.phase === "done" ? <TrainingPanel game={game} /> : null}
    </StepLayout>
  );
}

function TrainingPanel({ game }: { game: LearnGame }) {
  const { state, model } = game;
  const train = state.train;
  if (train.phase !== "practising" && train.phase !== "done") return null;
  const history = train.phase === "done" ? train.run.history : train.history;
  const total = train.phase === "done" ? train.run.history.length : train.total;
  const map: TrainMap | null = train.phase === "done" ? train.run.map : train.map;
  const last = history.at(-1);
  const labels = trainingGroups(state.groups).map((g) => g.label);
  const photos = map?.points.length ?? 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {map ? (
        <section aria-labelledby="map-title" className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 id="map-title" className="type-title-3 text-fg">
              Your {photos} photos as numbers
            </h2>
            <p className="type-small text-fg-subtle">Each dot is one photo. Photos with similar numbers land close together.</p>
          </div>
          <div className="dot-field overflow-hidden rounded-lg bg-sunken">
            <ClusterMap
              map={map}
              labels={labels}
              fly={train.phase === "practising"}
              label={`A map of your ${photos} photos. Photos of the same thing land close together.`}
            />
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {labels.map((l) => (
              <li key={l} className="type-label inline-flex items-center gap-1.5 text-fg-muted">
                <MarkSwatch label={l} labels={labels} />
                {l}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="rounds-title" className="flex flex-col gap-5 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="rounds-title" className="type-title-3 text-fg">
            The last layer practising
          </h2>
          <p className="type-small text-fg-subtle">After each round: how many examples it gets right, and how wrong it still is.</p>
        </div>
        <AccuracyChart history={history} total={total} />
        <div className="grid grid-cols-3 gap-4">
          <Stat value={last ? `${last.epoch} of ${total}` : `0 of ${total}`} label="Rounds" />
          <Stat value={last ? pct(last.accuracy) : "0%"} label="Examples right" />
          <Stat value={last ? last.loss.toFixed(2) : "…"} label="Loss" />
        </div>
        {train.phase === "done" && model.state === "ready" ? (
          <span className="type-label text-fg-subtle">
            {MODEL_NAME} · {model.backend} · {train.run.weights.toLocaleString("en")} numbers adjusted
          </span>
        ) : null}
      </section>
    </div>
  );
}
