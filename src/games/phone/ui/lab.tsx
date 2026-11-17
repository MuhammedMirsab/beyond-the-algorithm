"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SensorArt, type SensorId } from "@/components/art/sensor-art";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Progress } from "@/components/ui/progress";
import { Kbd } from "@/components/ui/surface";
import { EXPERIMENT_COUNT, EXPERIMENTS } from "../data/experiments";
import { LinkHandoff } from "../link/link-panel";

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/** Eight sensors to pick from, each ticked once tried. Keys 1 to 8 open them on the laptop. */
export function SensorLab({
  tested,
  onOpen,
  onQuiz,
}: {
  tested: ReadonlySet<SensorId>;
  onOpen: (id: SensorId) => void;
  onQuiz: () => void;
}) {
  const [lifted, setLifted] = useState<SensorId | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const count = tested.size;

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
      const n = Number(event.key);
      if (!Number.isInteger(n) || n < 1 || n > EXPERIMENT_COUNT) return;
      event.preventDefault();
      onOpen(EXPERIMENTS[n - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);

  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 pb-16 pt-4 sm:px-6 lg:gap-10 lg:px-8 lg:pt-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
        <div className="flex max-w-[40rem] flex-col gap-3">
          <span className="type-label text-game">Sensor lab</span>
          <h1 ref={heading} tabIndex={-1} className="type-display-2 text-fg outline-none">
            Eight sensors, one phone
          </h1>
          <p className="type-body-lg text-fg-muted">Pick one and try it. Then see what an app can work out about you from it.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:max-w-sm lg:w-80 lg:shrink-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="type-body font-semibold tabular-nums text-fg">
              {count} of {EXPERIMENT_COUNT} tested
            </span>
            <span className="type-small text-fg-subtle">{count === EXPERIMENT_COUNT ? "All done" : `${EXPERIMENT_COUNT - count} to go`}</span>
          </div>
          <Progress value={count / EXPERIMENT_COUNT} label="Sensors tested" tone="game" />
          <Button variant={count > 0 ? "game" : "secondary"} size="lg" arrow={count > 0} onClick={onQuiz} className="mt-2">
            Take the quiz
          </Button>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4">
        {EXPERIMENTS.map((experiment, i) => {
          const done = tested.has(experiment.id);
          return (
            <li key={experiment.id}>
              <button
                type="button"
                onClick={() => onOpen(experiment.id)}
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") setLifted(experiment.id);
                }}
                onPointerLeave={() => setLifted(null)}
                onFocus={() => setLifted(experiment.id)}
                onBlur={() => setLifted(null)}
                className="flex h-full w-full flex-col gap-3 rounded-xl bg-surface p-2.5 text-left shadow-ring transition-[background-color,transform] duration-150 ease-out hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg active:scale-[0.98] sm:p-3"
              >
                <span className="block aspect-square w-full overflow-hidden rounded-lg bg-sunken">
                  <SensorArt sensor={experiment.id} active={lifted === experiment.id} />
                </span>
                <span className="flex flex-col gap-1.5 px-1.5 pb-1.5">
                  <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span className="type-title-3 text-fg">{experiment.name}</span>
                    {done ? (
                      <Chip tone="success" icon={<Check />}>
                        Tested
                      </Chip>
                    ) : (
                      <Kbd aria-hidden className="hidden pointer-fine:inline-grid">
                        {i + 1}
                      </Kbd>
                    )}
                  </span>
                  <span className="type-small text-fg-subtle">{experiment.line}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="hidden pointer-fine:md:flex">
        <LinkHandoff size={88} />
      </div>
    </section>
  );
}
