"use client";

import { Hand, PencilLine, PersonStanding } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cleanName } from "@/lib/leaderboard";
import { cn } from "@/lib/cn";
import { MOVE_NAME_MAX, PRESET_PAIRS, customHint, tidyMoveName, type MovePreset, type PresetPair } from "../engine/presets";
import { classTraits } from "../engine/traits";
import { MoveGlyph } from "./figures";

export type MovePair = [MovePreset, MovePreset];

/** What recording will be like, and where to stand: decided before the camera opens. */
function describe(pair: PresetPair) {
  const traits = pair.moves.map((m) => classTraits(m.name));
  const moving = traits.some((t) => t.moving);
  const hands = traits.every((t) => t.needsHands);
  return {
    line: moving ? `${pair.kind}, recorded as clips.` : `${pair.kind}, taken as snapshots.`,
    stand: hands ? { icon: <Hand />, text: "Stay close" } : { icon: <PersonStanding />, text: "Stand back" },
  };
}

/** Choose a ready-made pair (one tap) or name two moves. */
export function PickMoves({ onPick }: { onPick: (moves: MovePair) => void }) {
  return (
    <section className="mx-auto flex w-full max-w-[69rem] flex-col gap-8 px-4 pb-12 pt-4 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3">
        <span className="type-label text-game">Step 1 of 3</span>
        <h1 data-step-focus tabIndex={-1} className="type-display-2 text-fg outline-none">
          Pick two moves to teach it
        </h1>
        <p className="type-body-lg max-w-[38rem] text-fg-muted">
          It only learns from what you show it. Moves that look different are easier to tell apart.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PRESET_PAIRS.map((pair) => (
          <li key={pair.id} className="flex">
            <PresetCard pair={pair} onPick={() => onPick(pair.moves)} />
          </li>
        ))}
        <li className="flex sm:col-span-2">
          <CustomCard onPick={onPick} />
        </li>
      </ul>
    </section>
  );
}

function PresetCard({ pair, onPick }: { pair: PresetPair; onPick: () => void }) {
  const { line, stand } = describe(pair);
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex w-full flex-col gap-5 rounded-lg bg-surface p-5 text-left shadow-ring",
        "transition-[background-color,scale] duration-150 ease-out hover:bg-raised active:scale-[0.97]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
      )}
    >
      <span className="flex flex-col gap-3">
        {pair.moves.map((move) => (
          <span key={move.name} className="flex items-center gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-md bg-game-soft text-game">
              <MoveGlyph icon={move.icon} className="size-8" />
            </span>
            <span className="type-title-2 text-fg">{move.name}</span>
          </span>
        ))}
      </span>
      {/* The chip last, so it lines up along the bottom of every card in a row. */}
      <span className="mt-auto flex flex-col items-start gap-2.5">
        <span className="type-small text-fg-subtle">{line}</span>
        <Chip icon={stand.icon}>{stand.text}</Chip>
      </span>
    </button>
  );
}

type Field = "first" | "second";

/** Empty, too short or not for a projector. Uses the scoreboard's word list. */
function nameProblem(name: string, field: Field): { field: Field; text: string } | null {
  if (name.length === 0) return { field, text: "Give both moves a name." };
  const result = cleanName(name);
  if (!result.ok) return { field, text: name.length < 2 ? result.reason : "Pick a different name." };
  return null;
}

function CustomCard({ onPick }: { onPick: (moves: MovePair) => void }) {
  const id = useId();
  const [names, setNames] = useState<Record<Field, string>>({ first: "", second: "" });
  const [error, setError] = useState<{ field: Field; text: string } | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const first = tidyMoveName(names.first);
    const second = tidyMoveName(names.second);
    const problem =
      nameProblem(first, "first") ??
      nameProblem(second, "second") ??
      (first.toLowerCase() === second.toLowerCase() ? { field: "second" as const, text: "Pick two different names." } : null);
    setError(problem);
    if (problem) return;
    onPick([
      { name: first, hint: customHint(first), icon: "custom" },
      { name: second, hint: customHint(second), icon: "custom" },
    ]);
  };

  const input = (field: Field, label: string, placeholder: string) => {
    const inputId = `${id}-${field}`;
    const invalid = error?.field === field;
    return (
      <label htmlFor={inputId} className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="type-small font-semibold text-fg-muted">{label}</span>
        <input
          id={inputId}
          value={names[field]}
          onChange={(e) => {
            const value = e.target.value;
            setNames((prev) => ({ ...prev, [field]: value }));
            if (error) setError(null);
          }}
          maxLength={MOVE_NAME_MAX}
          autoComplete="off"
          autoCapitalize="sentences"
          spellCheck={false}
          enterKeyHint={field === "first" ? "next" : "done"}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          className={cn(
            "type-body-lg h-14 w-full min-w-0 rounded-full bg-sunken px-6 font-medium text-fg shadow-ring outline-none placeholder:text-fg-faint",
            "transition-shadow duration-150 focus:shadow-[0_0_0_2px_var(--color-fg)]",
            invalid && "shadow-[0_0_0_2px_var(--color-danger)]",
          )}
        />
      </label>
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex w-full flex-col gap-5 rounded-lg bg-surface p-5 shadow-ring">
      <div className="flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-md bg-game-soft text-game [&_svg]:size-7">
          <PencilLine aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="type-title-2 text-fg">Make your own</span>
          <span className="type-small text-fg-subtle">Two short names, up to {MOVE_NAME_MAX} letters each.</span>
        </span>
      </div>
      <div className="flex flex-col gap-4 md:flex-row">
        {input("first", "First move", "e.g. Jump")}
        {input("second", "Second move", "e.g. Spin")}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="type-small text-danger">
          {error.text}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" size="lg" className="self-start">
        Use these moves
      </Button>
    </form>
  );
}
