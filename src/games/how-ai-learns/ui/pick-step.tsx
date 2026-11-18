"use client";

import Image from "next/image";
import { Check, ImageOff, LoaderCircle, Plus, X } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/chip";
import { Notice } from "@/components/game/panels";
import { cn } from "@/lib/cn";
import { photoUrl } from "../engine/dataset";
import { MAX_GROUPS, MIN_GROUPS, NAME_MAX, namesProblem } from "./state";
import { StepLayout } from "./step-layout";
import { loadDataset } from "./use-dataset";
import type { LearnGame } from "./use-learn-game";

const PLACEHOLDERS = ["e.g. Phone", "e.g. Bottle", "e.g. Pen"];
/** Things visitors usually have on them: one tap instead of typing. */
const IDEAS = ["Phone", "Water bottle", "Pen", "Keys", "Watch", "Glasses"];

/**
 * Step 1: the visitor names the things they will show the camera. The photo
 * library is the backup, for anyone with nothing to hold up.
 */
export function PickStep({ game }: { game: LearnGame }) {
  const { state, dataset, dispatch, actions } = game;
  const id = useId();
  const groups = state.groups;
  const problem = namesProblem(groups);
  const ready = problem === null && dataset.status === "ready";
  const full = groups.length >= MAX_GROUPS;

  return (
    <StepLayout
      step="pick"
      title="What will you teach it?"
      lead="Name two things you can show the camera. Add a third if you want a harder test."
      primary={
        <Button variant="game" size="lg" arrow disabled={!ready} onClick={actions.toExamples}>
          Show them to the camera
        </Button>
      }
      note={problem}
    >
      <div className="flex flex-col gap-8">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) actions.toExamples();
          }}
          className="flex flex-col gap-4 rounded-xl bg-surface p-4 shadow-ring sm:p-5"
        >
          <div className={cn("grid gap-4", groups.length === 3 ? "md:grid-cols-3" : "sm:grid-cols-2")}>
            {groups.map((group, i) => {
              const inputId = `${id}-${group.id}`;
              const library = dataset.status === "ready" ? dataset.manifest.categories.find((c) => c.id === group.library) : null;
              return (
                <div key={group.id} className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor={inputId} className="type-small font-semibold text-fg-muted">
                      Thing {i + 1}
                    </label>
                    {groups.length > MIN_GROUPS ? (
                      <button
                        type="button"
                        onClick={() => actions.removeGroup(group)}
                        aria-label={`Remove thing ${i + 1}`}
                        className="grid size-7 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-fg"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                  <input
                    id={inputId}
                    value={group.name}
                    onChange={(e) => dispatch({ type: "rename", id: group.id, name: e.target.value })}
                    maxLength={NAME_MAX}
                    autoComplete="off"
                    autoCapitalize="sentences"
                    spellCheck={false}
                    enterKeyHint={i === groups.length - 1 ? "done" : "next"}
                    placeholder={PLACEHOLDERS[i]}
                    className={cn(
                      "type-body-lg h-14 w-full min-w-0 rounded-full bg-sunken px-6 font-medium text-fg shadow-ring outline-none placeholder:text-fg-faint",
                      "transition-shadow duration-150 focus:shadow-[0_0_0_2px_var(--color-fg)]",
                    )}
                  />
                  {library ? (
                    <span className="type-caption px-2 text-game">Can use library photos of {library.plural}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="type-small text-fg-subtle">Or tap what you have with you</span>
            <div className="flex flex-wrap gap-2">
              {IDEAS.map((idea) => {
                const owner = groups.find((g) => g.name.trim().toLowerCase() === idea.toLowerCase());
                const empty = groups.find((g) => !g.name.trim());
                return (
                  <ToggleChip
                    key={idea}
                    pressed={!!owner}
                    disabled={!owner && !empty}
                    // The reducer picks the field, so two quick taps never land in the same one.
                    onClick={() => dispatch({ type: "toggle-name", name: idea })}
                    className="disabled:opacity-45"
                  >
                    {idea}
                  </ToggleChip>
                );
              })}
            </div>
          </div>
          {!full ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              icon={<Plus />}
              className="self-start"
              onClick={() => dispatch({ type: "add-group" })}
            >
              Add a third thing
            </Button>
          ) : null}
          {/* Lets Enter submit the form from any field. */}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>

        <section aria-labelledby={`${id}-library`} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={`${id}-library`} className="type-title-3 text-fg">
              Nothing to show? Use the photo library
            </h2>
            <p className="type-small text-fg-subtle">Tap one to use its photos instead of the camera. Tap it again to stop.</p>
          </div>
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
            /* Eight curated categories: two even rows of four from 640px up. */
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {dataset.manifest.categories.map((category, i) => {
                const sample =
                  dataset.manifest.photos.find((p) => p.id === category.cover) ?? dataset.split.pool.get(category.id)?.[0];
                const on = groups.some((g) => g.library === category.id);
                const disabled = !on && full && groups.every((g) => g.library);
                return (
                  <li key={category.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={disabled}
                      onClick={() => dispatch({ type: "use-library", category: category.id, label: category.label })}
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
                            sizes="(min-width: 1024px) 260px, (min-width: 640px) 25vw, 50vw"
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
          )}
        </section>
      </div>
    </StepLayout>
  );
}
