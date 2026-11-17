"use client";

import { Check, Hand, Lightbulb, MoveHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { distanceHint, lightHint, REACH_MS } from "../play/hand-check";
import type { StudioView } from "../play/session";
import type { LiveHands } from "./hooks";

function HandPill({ label, seen }: { label: string; seen: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full pl-2 pr-4 transition-colors duration-150 ease-out",
        seen ? "bg-game-soft text-fg" : "bg-fg/[0.06] text-fg-muted",
      )}
    >
      <span className={cn("grid size-6 place-items-center rounded-full", seen ? "bg-game text-game-ink" : "bg-fg/10 text-fg-subtle")}>
        {seen ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <Hand className="size-3.5" aria-hidden />}
      </span>
      <span className="type-small font-semibold">{label}</span>
      <span className="sr-only">{seen ? "found" : "not found yet"}</span>
    </span>
  );
}

function Hint({ ok, text, icon }: { ok: boolean; text: string; icon: React.ReactNode }) {
  return (
    <li className={cn("type-small flex items-start gap-2", ok ? "text-fg-muted" : "text-warning")}>
      <span aria-hidden className="mt-0.5 shrink-0 [&_svg]:size-4">
        {ok ? <Check className="size-4 text-success" /> : icon}
      </span>
      {text}
    </li>
  );
}

/** Six seconds counting down, from the reach state's end time. */
function useCountdown(until: number | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (until === null) return;
    const tick = () => setLeft(Math.max(0, until - performance.now()));
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 100);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [until]);
  return until === null ? 0 : left;
}

/**
 * The quick hand check: both hands in view, with honest distance and light
 * hints from the camera's own numbers, then an optional reach measurement.
 * Skip always works and keeps the defaults.
 */
export function HandCheckView({
  view,
  live,
  headingRef,
  onMeasure,
  onDone,
}: {
  view: StudioView;
  live: LiveHands;
  headingRef: Ref<HTMLHeadingElement>;
  onMeasure: () => void;
  onDone: () => void;
}) {
  const { both, reach } = view.check;
  const found = both >= 1;
  const measuring = reach.status === "measuring";
  const left = useCountdown(measuring ? reach.until : null);
  const distance = distanceHint(live.size);
  const light = lightHint(live.brightness);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const wasFound = useRef(false);

  // When both hands are found, the next step is one key press away.
  useEffect(() => {
    if (found && !wasFound.current) primaryRef.current?.focus({ preventScroll: true });
    wasFound.current = found;
  }, [found]);

  let title = "Show both hands";
  let lead = "Hold them up in front of you, palms towards the camera.";
  if (measuring) {
    title = "Reach out to the edges";
    lead = "Sweep both hands left, right, up and down, as far as is comfortable.";
  } else if (reach.status === "done") {
    title = "Reach measured";
    lead = "The instruments will fit inside the area you reached.";
  } else if (reach.status === "too-small") {
    title = "That area was small";
    lead = "Sweep your hands wider and try again, or carry on with the standard area.";
  } else if (found) {
    title = "Both hands found";
    lead = "You can measure your reach, so the instruments fit your arms, or start playing.";
  }

  return (
    <section
      aria-labelledby="air-studio-check-title"
      className="pointer-events-auto mx-auto flex w-full max-w-[40rem] flex-col gap-5 rounded-xl bg-canvas/90 p-5 shadow-float sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="type-label text-game">Hand check</span>
          <h1 id="air-studio-check-title" ref={headingRef} tabIndex={-1} className="type-title-2 text-fg outline-none" aria-live="polite">
            {title}
          </h1>
          <p className="type-body text-fg-muted">{lead}</p>
        </div>
        {!found && !measuring ? (
          <Button variant="ghost" onClick={onDone} className="-mr-2 shrink-0">
            Skip
          </Button>
        ) : null}
      </div>

      {measuring ? (
        <div className="flex flex-col gap-2">
          <Progress value={1 - left / REACH_MS} label="Measuring your reach" tone="game" />
          <span className="type-label tabular-nums text-fg-subtle">{Math.ceil(left / 1000)} s left</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <HandPill label="Left hand" seen={live.left} />
            <HandPill label="Right hand" seen={live.right} />
          </div>
          {!found ? <Progress value={both} label="Both hands in view" tone="game" /> : null}
          <ul className="flex flex-col gap-1.5">
            {distance ? <Hint ok={distance.ok} text={distance.text} icon={<MoveHorizontal />} /> : null}
            <Hint ok={light.ok} text={light.text} icon={<Lightbulb />} />
          </ul>
        </div>
      )}

      {found && !measuring ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button ref={primaryRef} variant="game" size="lg" arrow onClick={onDone}>
            Choose an instrument
          </Button>
          {reach.status !== "done" ? (
            <Button variant="secondary" size="lg" icon={<MoveHorizontal />} onClick={onMeasure}>
              {reach.status === "too-small" ? "Measure again" : "Measure my reach"}
            </Button>
          ) : null}
        </div>
      ) : null}

      <p className="type-label text-fg-subtle">
        {live.fps ? `21 points per hand · ${live.fps} fps${live.delegate ? ` · ${live.delegate}` : ""} · light ${live.brightness}` : "Starting the hand model"}
      </p>
    </section>
  );
}
