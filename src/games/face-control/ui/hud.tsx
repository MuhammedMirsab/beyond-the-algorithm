"use client";

import type { ReactNode } from "react";
import { START_LIVES } from "../engine/game/bridge";
import { LEVELS } from "../engine/game/levels";
import { formatScore, formatTime } from "../engine/format";
import type { RunValues } from "./hooks";
import { Lives, SparkIcon } from "./icons";

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-10 items-center gap-2 rounded-full bg-surface px-3.5 shadow-ring">
      <dt className="type-label text-fg-subtle">{label}</dt>
      <dd className="type-small flex items-center gap-1.5 font-semibold tabular-nums text-fg">{children}</dd>
    </div>
  );
}

/** Level, score, sparks, time and lives, in chips along the top of the play view. */
export function Hud({ run }: { run: RunValues }) {
  const level = LEVELS[run.levelIndex] ?? LEVELS[0];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] z-20 px-4 sm:px-6 lg:px-8">
      <dl aria-label="Game status" className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
        <Item label="Level">
          <span>
            {run.levelIndex + 1} of {LEVELS.length}
          </span>
          <span className="hidden font-medium text-fg-muted md:inline">· {level.name}</span>
        </Item>
        <Item label="Score">{formatScore(run.score)}</Item>
        <Item label="Sparks">
          <SparkIcon className="text-game" />
          {run.sparks}/{run.sparksTotal}
        </Item>
        <Item label="Time">{formatTime(run.levelTime)}</Item>
        <div className="flex h-10 items-center gap-2 rounded-full bg-surface px-3.5 shadow-ring">
          <dt className="type-label text-fg-subtle">Lives</dt>
          <dd>
            <Lives lives={run.lives} total={START_LIVES} />
          </dd>
        </div>
      </dl>
    </div>
  );
}
