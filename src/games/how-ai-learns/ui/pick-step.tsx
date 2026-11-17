"use client";

import Image from "next/image";
import { Check, ImageOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/game/panels";
import { cn } from "@/lib/cn";
import { photoUrl } from "../engine/dataset";
import { joinWords } from "./copy";
import { MAX_GROUPS, MIN_GROUPS } from "./state";
import { StepLayout } from "./step-layout";
import { loadDataset } from "./use-dataset";
import type { LearnGame } from "./use-learn-game";

export function PickStep({ game }: { game: LearnGame }) {
  const { state, dataset, dispatch, actions } = game;
  const picked = state.picked;
  const ready = picked.length >= MIN_GROUPS;
  const full = picked.length >= MAX_GROUPS;

  const labels =
    dataset.status === "ready"
      ? picked.map((id) => dataset.manifest.categories.find((c) => c.id === id)?.label ?? id)
      : [];

  return (
    <StepLayout
      step="pick"
      title="What should it learn to tell apart?"
      lead="Pick two things. Add a third if you want a harder test."
      primary={
        <Button variant="game" size="lg" arrow disabled={!ready || dataset.status !== "ready"} onClick={() => actions.go("examples")}>
          Add examples
        </Button>
      }
      note={ready ? null : "Pick at least two things."}
    >
      {dataset.status === "loading" ? (
        <Notice icon={<LoaderCircle className="animate-spin" />} title="Loading the photo library" className="py-16" />
      ) : dataset.status === "error" ? (
        <Notice
          icon={<ImageOff />}
          title="The photo library didn’t load"
          className="py-16"
          actions={
            <Button variant="primary" size="lg" onClick={loadDataset}>
              Try again
            </Button>
          }
        >
          <p>Check the internet connection, then try again.</p>
        </Notice>
      ) : (
        <div className="flex flex-col gap-4">
          <p aria-live="polite" className="type-small text-fg-subtle">
            {picked.length === 0
              ? "Nothing picked yet."
              : `Teaching it: ${joinWords(labels)}.${full ? " That’s the most it can learn here." : ""}`}
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {dataset.manifest.categories.map((category, i) => {
              const sample = dataset.split.pool.get(category.id)?.[0];
              const on = picked.includes(category.id);
              const disabled = !on && full;
              return (
                <li key={category.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => dispatch({ type: "toggle-pick", id: category.id })}
                    className={cn(
                      "group/card flex w-full flex-col gap-2.5 rounded-lg bg-surface p-1.5 pb-3 text-left",
                      "transition-[background-color,box-shadow,transform,opacity] duration-150 ease-out active:scale-[0.97]",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                      "disabled:pointer-events-none disabled:opacity-45",
                      on ? "ring-2 ring-game" : "shadow-ring hover:bg-raised",
                    )}
                  >
                    <span className="relative block aspect-[4/3] overflow-hidden rounded-md bg-sunken">
                      {sample ? (
                        <Image
                          src={photoUrl(sample)}
                          alt=""
                          fill
                          unoptimized
                          loading={i < 5 ? "eager" : "lazy"}
                          sizes="(min-width: 1024px) 200px, (min-width: 640px) 33vw, 50vw"
                          className="object-cover"
                        />
                      ) : null}
                      {on ? (
                        <span aria-hidden className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-game text-game-ink">
                          <Check className="size-4" strokeWidth={3} />
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center justify-between gap-2 px-1.5">
                      <span className="type-body truncate font-semibold text-fg">{category.label}</span>
                      {on ? <span className="type-caption shrink-0 text-game">Picked</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </StepLayout>
  );
}
