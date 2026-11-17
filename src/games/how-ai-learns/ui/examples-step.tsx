"use client";

import Image from "next/image";
import { Camera, Check, Images, X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import { NONE_LABEL } from "../engine/rules";
import { CaptureModal } from "./capture-modal";
import { joinWords } from "./copy";
import { LIBRARY_BATCH, MAX_EXAMPLES, MIN_EXAMPLES, NONE_GROUP, type ExamplePhoto } from "./state";
import { StepLayout } from "./step-layout";
import { useCamera } from "./use-camera";
import type { LearnGame } from "./use-learn-game";

export function ExamplesStep({ game }: { game: LearnGame }) {
  const { state, dataset, dispatch, actions, libraryPoolFor } = game;
  const { camera, videoRef, start, stop, capture: grabFrame } = useCamera();

  // The camera opens first: when a group's camera is open and this visitor
  // already allowed the camera, start it without asking again.
  const capturing = state.capture !== null;
  const cameraOff = camera.status === "off";
  const welcomed = state.cameraWelcomed;
  useEffect(() => {
    if (capturing && cameraOff && welcomed) void start();
  }, [capturing, cameraOff, welcomed, start]);

  if (dataset.status !== "ready") return null;

  const groups = [
    ...state.groups.map((g) => ({ id: g.id, label: g.name.trim(), hasLibrary: g.library !== null })),
    { id: NONE_GROUP, label: NONE_LABEL, hasLibrary: true },
  ].map((g) => {
    const photos = state.examples[g.id] ?? [];
    const taken = new Set(photos.map((p) => p.id));
    const left = g.hasLibrary ? libraryPoolFor(g.id).filter((p) => !taken.has(p.id)).length : 0;
    return { ...g, none: g.id === NONE_GROUP, photos, left };
  });
  const short = groups.filter((g) => g.photos.length < MIN_EXAMPLES);
  const ready = short.length === 0;
  const capture = groups.find((g) => g.id === state.capture) ?? null;

  const openCamera = (id: string) => {
    dispatch({ type: "capture", category: id });
  };
  const closeCamera = () => {
    stop();
    dispatch({ type: "capture", category: null });
  };

  return (
    <StepLayout
      step="examples"
      title="Give it examples"
      lead={
        <p>
          At least {MIN_EXAMPLES} photos of each, and {MIN_EXAMPLES} with no object in the picture, so it knows when nothing
          is there. Mix angles and backgrounds, so it learns the object and not the table it’s on.
        </p>
      }
      secondary={
        <Button variant="ghost" size="lg" onClick={() => actions.go("pick")}>
          Change what to teach
        </Button>
      }
      primary={
        <Button variant="game" size="lg" arrow disabled={!ready} onClick={() => void actions.train()}>
          Train it
        </Button>
      }
      note={ready ? null : `Add ${joinWords(short.map((g) => needed(MIN_EXAMPLES - g.photos.length, g.label)))} first.`}
    >
      <div className={cn("grid gap-4", groups.length === 3 ? "lg:grid-cols-3" : "md:grid-cols-2")}>
        {groups.map((group) => {
          const count = group.photos.length;
          const room = MAX_EXAMPLES - count;
          const batch = Math.min(LIBRARY_BATCH, group.left, room);
          return (
            <section
              key={group.id}
              aria-labelledby={`examples-${group.id}`}
              className="flex min-w-0 flex-col gap-4 rounded-xl bg-surface p-4 shadow-ring sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h2 id={`examples-${group.id}`} className="type-title-3 text-fg">
                    {group.label}
                  </h2>
                  <span aria-live="polite" className="type-small tabular-nums text-fg-subtle">
                    {count === 1 ? "1 photo" : `${count} photos`}
                  </span>
                </div>
                {count >= MIN_EXAMPLES ? (
                  <Chip tone="success" icon={<Check />}>
                    Ready
                  </Chip>
                ) : (
                  <Chip>{MIN_EXAMPLES - count} more to go</Chip>
                )}
              </div>

              {group.none ? (
                <p className="type-small -mt-2 text-fg-subtle">Take the objects away and photograph the empty background.</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="lg" icon={<Camera />} disabled={room <= 0} onClick={() => openCamera(group.id)}>
                  Take photos
                </Button>
                {group.hasLibrary ? (
                  <Button
                    variant="ghost"
                    size="lg"
                    icon={<Images />}
                    disabled={batch <= 0}
                    onClick={() => actions.addFromLibrary(group.id)}
                  >
                    {batch > 0
                      ? `Or add ${batch} from the library`
                      : group.left === 0
                        ? "No more in the library"
                        : "Full"}
                  </Button>
                ) : null}
              </div>

              {count === 0 ? (
                <div className="dot-field grid min-h-28 place-items-center rounded-lg bg-sunken px-4 py-6 text-center">
                  <span className="type-small text-fg-subtle">No photos yet</span>
                </div>
              ) : (
                <ul className={cn("grid gap-2", groups.length === 3 ? "grid-cols-4 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-4 sm:grid-cols-5")}>
                  {group.photos.map((photo, i) => (
                    <li key={photo.id}>
                      <Thumb photo={photo} index={i} label={group.label} onRemove={() => actions.removeExample(photo)} />
                    </li>
                  ))}
                </ul>
              )}
              {count > 0 ? <p className="type-caption text-fg-subtle">Tap a photo to remove it.</p> : null}
            </section>
          );
        })}
      </div>

      {capture ? (
        <CaptureModal
          label={capture.label}
          none={capture.none}
          photos={capture.photos.filter((p) => p.kind === "camera")}
          full={capture.photos.length >= MAX_EXAMPLES}
          camera={camera}
          videoRef={videoRef}
          onWelcome={() => {
            dispatch({ type: "camera-welcomed" });
            void start();
          }}
          onRetry={() => void start()}
          onTake={() => {
            const canvas = grabFrame();
            if (!canvas) return false;
            actions.addCameraPhoto(capture.id, capture.label, canvas);
            return true;
          }}
          onClose={closeCamera}
        />
      ) : null}
    </StepLayout>
  );
}

/** "3 more pen photos", "1 more cup photo". */
function needed(n: number, label: string) {
  return `${n} more ${label === NONE_LABEL ? "“No object”" : label} photo${n === 1 ? "" : "s"}`;
}

function Thumb({ photo, index, label, onRemove }: { photo: ExamplePhoto; index: number; label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${label} photo ${index + 1}${photo.kind === "camera" ? ", taken with the camera" : ""}`}
      className={cn(
        "group/thumb relative block aspect-square w-full overflow-hidden rounded-md bg-sunken",
        "transition-[opacity,transform] duration-200 ease-out starting:opacity-0 active:scale-[0.97]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
      )}
    >
      <Image src={photo.url} alt="" fill unoptimized sizes="120px" className="object-cover" />
      <span
        aria-hidden
        className={cn(
          "absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/65 text-white transition-opacity duration-150",
          "[@media(hover:hover)]:opacity-0 group-hover/thumb:opacity-100 group-focus-visible/thumb:opacity-100",
        )}
      >
        <X className="size-3.5" strokeWidth={2.5} />
      </span>
      {photo.kind === "camera" ? (
        <span aria-hidden className="absolute bottom-1 left-1 grid size-6 place-items-center rounded-full bg-black/65 text-white">
          <Camera className="size-3.5" />
        </span>
      ) : null}
    </button>
  );
}
