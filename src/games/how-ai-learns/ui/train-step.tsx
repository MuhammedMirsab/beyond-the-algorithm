"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Stat } from "@/components/ui/score";
import { MachineLabel } from "@/components/ui/surface";
import { ModelLoading } from "@/components/game/camera-notice";
import { EMBEDDING_SIZE, MODEL_NAME } from "../engine/vision";
import { AccuracyChart } from "./accuracy-chart";
import { pct } from "./copy";
import { EmbeddingDots } from "./embedding-dots";
import { StepLayout } from "./step-layout";
import type { TrainState } from "./state";
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
        lead: "Each round it labels every example, checks the answers, and adjusts itself to make fewer mistakes.",
      };
    case "done":
      return {
        title: `Trained on ${train.run.examples} photos`,
        lead: `That took ${train.run.seconds.toFixed(1)} seconds on this device. Now test it on photos it has never seen.`,
      };
    case "error":
      return { title: "Training didn’t finish", lead: train.message };
  }
}

export function TrainStep({ game }: { game: LearnGame }) {
  const { state, model, actions } = game;
  const train = state.train;
  const { title, lead } = copyFor(train);

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
          <div className="grid gap-4 sm:grid-cols-2">
            <figure className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-ring">
              <div className="relative aspect-[5/4] overflow-hidden rounded-md bg-sunken">
                {train.current ? (
                  <Image src={train.current.photo.url} alt={`${train.current.photo.label}: ${train.current.photo.title}`} fill unoptimized sizes="(min-width: 640px) 500px, 100vw" className="object-cover" />
                ) : null}
              </div>
              <figcaption className="type-label tabular-nums text-fg-subtle">
                Photo {train.done} of {train.total}
              </figcaption>
            </figure>
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

      {train.phase === "practising" || train.phase === "done" ? (
        <TrainingPanel game={game} />
      ) : null}


    </StepLayout>
  );
}

function TrainingPanel({ game }: { game: LearnGame }) {
  const { state, model } = game;
  const train = state.train;
  if (train.phase !== "practising" && train.phase !== "done") return null;
  const history = train.phase === "done" ? train.run.history : train.history;
  const total = train.phase === "done" ? train.run.history.length : train.total;
  const last = history.at(-1);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-6 rounded-xl bg-surface p-5 shadow-ring sm:p-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="type-title-3 text-fg">How many of its examples it gets right</h2>
            <p className="type-small text-fg-subtle">After each practice round.</p>
          </div>
          <AccuracyChart history={history} total={total} />
        </div>
        <div className="grid grid-cols-2 content-start gap-x-6 gap-y-5 lg:grid-cols-1">
          <Stat value={last ? `${last.epoch} of ${total}` : `0 of ${total}`} label="Practice rounds" />
          <Stat value={last ? pct(last.accuracy) : "0%"} label="Examples it gets right" />
          {last ? (
            <div className="col-span-2 flex flex-col gap-1 lg:col-span-1">
              <MachineLabel className="tabular-nums">Loss {last.loss.toFixed(3)}</MachineLabel>
              <span className="type-caption text-fg-subtle">How wrong it still is. Lower is better.</span>
            </div>
          ) : null}
        </div>
      </div>

      {train.phase === "done" ? (
        <section aria-labelledby="averages" className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
          <div className="flex flex-col gap-1">
            <h2 id="averages" className="type-title-3 text-fg">
              What your examples have in common
            </h2>
            <p className="type-small max-w-[40rem] text-fg-subtle">
              The average of each group’s {NUMBERS} numbers. Same place, same number, so you can compare them. A new photo
              that matches none of these gets “I don’t know”.
            </p>
          </div>
          <ul className={`grid gap-4 ${train.run.labels.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {train.run.labels.map((label, i) => (
              <li key={label} className="dot-field flex flex-col gap-2 rounded-lg bg-sunken p-3">
                <EmbeddingDots values={train.run.centroids[i]} label={`Average numbers of the ${label.toLowerCase()} examples, drawn as dots.`} />
                <span className="type-label text-fg-subtle">
                  Average {label.toLowerCase()} · {train.run.perGroup[label] ?? 0} photos
                </span>
              </li>
            ))}
          </ul>
          {model.state === "ready" ? (
            <MachineLabel>
              {MODEL_NAME} · {model.backend}
            </MachineLabel>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
