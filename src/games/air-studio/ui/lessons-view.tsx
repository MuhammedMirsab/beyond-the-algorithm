"use client";

import { ArrowLeft } from "lucide-react";
import { useState, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Segmented } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { LESSON_GROUPS, LESSONS, type Lesson } from "../engine/practice/lessons";
import { WINDOWS, type TimingLevel } from "../engine/practice/scoring";
import { INSTRUMENT_NAMES, type InstrumentId } from "../engine/settings";
import { InstrumentGlyph } from "./instrument-glyph";

const UNIT: Record<InstrumentId, [string, string]> = {
  piano: ["note", "notes"],
  drums: ["hit", "hits"],
  guitar: ["strum", "strums"],
  synth: ["note", "notes"],
  percussion: ["hit", "hits"],
};

export const lessonSize = (l: Lesson) => `${l.targets.length} ${UNIT[l.inst][l.targets.length === 1 ? 0 : 1]}`;
export const lessonTempo = (l: Lesson, level: TimingLevel) => Math.round(l.bpm * WINDOWS[level].tempo);

function LessonRow({ lesson, selected, best, onSelect }: { lesson: Lesson; selected: boolean; best: number | undefined; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-16 w-full items-center gap-4 rounded-md px-4 py-3 text-left",
        "transition-[background-color,box-shadow] duration-150 ease-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        selected ? "bg-game-soft shadow-[inset_0_0_0_2px_var(--game)]" : "hover:bg-fg/[0.05]",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="type-body font-semibold text-fg">{lesson.title}</span>
        <span className="type-small text-fg-subtle">
          {lesson.level} · {lessonSize(lesson)}
        </span>
      </span>
      {best !== undefined ? (
        <span className="flex shrink-0 flex-col items-end">
          <span className="type-title-3 tabular-nums text-fg">{best}</span>
          <span className="type-caption text-fg-subtle">Your best</span>
        </span>
      ) : null}
    </button>
  );
}

/**
 * Practice: the original app's 16 lessons by instrument. Pick one, read
 * what to do, choose how strict the timing is, start.
 */
export function LessonsView({
  current,
  bests,
  headingRef,
  onStart,
  onBack,
}: {
  current: InstrumentId | null;
  bests: Record<string, number>;
  headingRef: Ref<HTMLHeadingElement>;
  onStart: (id: string, level: TimingLevel) => void;
  onBack: () => void;
}) {
  const [selectedId, setSelectedId] = useState(() => (LESSONS.find((l) => l.inst === current) ?? LESSONS[0]).id);
  const [level, setLevel] = useState<TimingLevel>("beginner");
  const lesson = LESSONS.find((l) => l.id === selectedId) ?? LESSONS[0];
  const w = WINDOWS[level];

  return (
    <div className="mx-auto grid w-full max-w-[69rem] items-start gap-8 px-4 pb-12 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10 lg:px-8">
      <div className="flex min-w-0 flex-col gap-8">
        <div className="flex flex-col gap-3">
          <span className="type-label text-game">Practice</span>
          <h1 ref={headingRef} tabIndex={-1} className="type-title-1 text-fg outline-none">
            Pick a lesson
          </h1>
          <p className="type-body-lg max-w-[36rem] text-fg-muted">
            Targets light up on the instrument and slide along a timeline. Every note you play is checked against the beat as you go.
          </p>
        </div>
        {LESSON_GROUPS.map((group) => (
          <section key={group.inst} aria-labelledby={`lessons-${group.inst}`} className="flex flex-col gap-2">
            <h2 id={`lessons-${group.inst}`} className="flex items-center gap-2.5 px-1">
              <InstrumentGlyph id={group.inst} className="size-5 text-game" />
              <span className="type-title-3 text-fg">{group.title}</span>
            </h2>
            <ul className="flex flex-col gap-1">
              {LESSONS.filter((l) => l.inst === group.inst).map((l) => (
                <li key={l.id}>
                  <LessonRow lesson={l} selected={l.id === lesson.id} best={bests[l.id]} onSelect={() => setSelectedId(l.id)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <aside aria-label="Selected lesson" className="flex flex-col gap-6 rounded-xl bg-surface p-6 shadow-ring lg:sticky lg:top-20">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Chip tone="game" icon={<InstrumentGlyph id={lesson.inst} />}>
              {INSTRUMENT_NAMES[lesson.inst]}
            </Chip>
            <Chip>{lesson.level}</Chip>
            <Chip>{lessonSize(lesson)}</Chip>
          </div>
          <h2 className="type-title-2 text-fg">{lesson.title}</h2>
          <p className="type-body text-fg-muted">{lesson.desc}</p>
          <p className="type-small text-fg-subtle">
            <span className="font-semibold text-fg-muted">Tip: </span>
            {lesson.tip}
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <Segmented
            label="Timing"
            value={level}
            onValueChange={setLevel}
            options={[
              { value: "beginner", label: "Relaxed timing" },
              { value: "advanced", label: "Strict timing" },
            ]}
          />
          <p className="type-small text-fg-subtle">
            On time means within {w.perfect} ms of the beat; up to {w.max} ms counts as early or late. Tempo: {lessonTempo(lesson, level)} beats a minute
            {level === "advanced" ? ", a little faster" : ""}.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button variant="game" size="lg" arrow onClick={() => onStart(lesson.id, level)} className="self-start">
            Start lesson
          </Button>
          <Button variant="ghost" icon={<ArrowLeft />} onClick={onBack} className="-ml-2 self-start">
            Back to free play
          </Button>
        </div>
      </aside>
    </div>
  );
}
