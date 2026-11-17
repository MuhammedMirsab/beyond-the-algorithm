"use client";

import { AnimatePresence, motion } from "motion/react";
import { Trophy } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { cleanName, NAME_MAX, type BoardEntry } from "@/lib/leaderboard";
import { cn } from "@/lib/cn";

/**
 * Today's board on this screen. Highlights the visitor's own row.
 * `format` turns a score into what people read ("5 of 6", "1,240").
 */
export function Scoreboard({
  entries,
  highlightId,
  limit = 10,
  format = (e) => e.score.toLocaleString("en"),
  title = "Today's board",
  emptyText = "No scores yet. Yours could be the first.",
  className,
}: {
  entries: BoardEntry[];
  highlightId?: string | null;
  limit?: number;
  format?: (entry: BoardEntry) => string;
  title?: string;
  emptyText?: string;
  className?: string;
}) {
  const shown = entries.slice(0, limit);
  const ownIndex = highlightId ? entries.findIndex((e) => e.id === highlightId) : -1;
  const ownOutside = ownIndex >= limit ? entries[ownIndex] : null;

  return (
    <section className={cn("flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-ring sm:p-6", className)} aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-title-3 flex items-center gap-2 text-fg">
          <Trophy className="size-5 text-game" aria-hidden />
          {title}
        </h2>
        <span className="type-caption text-fg-subtle tabular-nums">
          {entries.length === 1 ? "1 player" : `${entries.length.toLocaleString("en")} players`}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="type-body py-6 text-center text-fg-subtle">{emptyText}</p>
      ) : (
        <ol className="flex flex-col">
          {shown.map((entry, i) => (
            <Row key={entry.id} rank={i + 1} entry={entry} own={entry.id === highlightId} value={format(entry)} />
          ))}
          {ownOutside ? (
            <>
              <li aria-hidden className="type-caption py-1 text-center text-fg-faint">
                ...
              </li>
              <Row rank={ownIndex + 1} entry={ownOutside} own value={format(ownOutside)} />
            </>
          ) : null}
        </ol>
      )}
    </section>
  );
}

function Row({ rank, entry, own, value }: { rank: number; entry: BoardEntry; own: boolean; value: string }) {
  return (
    <li
      className={cn(
        "grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2.5",
        own ? "bg-game text-game-ink" : "odd:bg-fg/[0.03]",
      )}
      aria-current={own ? "true" : undefined}
    >
      <span className={cn("font-mono text-[0.8125rem] font-semibold tabular-nums", own ? "text-game-ink/80" : "text-fg-subtle")}>
        {String(rank).padStart(2, "0")}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={cn("truncate font-semibold", own ? "text-game-ink" : "text-fg")} title={entry.name}>
          {entry.name}
        </span>
        {entry.detail ? (
          <span className={cn("type-caption truncate", own ? "text-game-ink/75" : "text-fg-subtle")}>{entry.detail}</span>
        ) : null}
      </span>
      <span className={cn("font-semibold tabular-nums", own ? "text-game-ink" : "text-fg")}>{value}</span>
    </li>
  );
}

/**
 * Ask for a name to put on the board. Optional by design: "Skip" always works,
 * so the next visitor is never stuck behind a form.
 */
export function NameEntry({
  onSubmit,
  onSkip,
  submitLabel = "Add to board",
  prompt = "Put your name on today's board",
}: {
  onSubmit: (name: string) => void;
  onSkip: () => void;
  submitLabel?: string;
  prompt?: string;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = cleanName(value);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    onSubmit(result.name);
  };

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3" noValidate>
      <label htmlFor={id} className="type-body font-semibold text-fg">
        {prompt}
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={id}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          maxLength={NAME_MAX}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
          placeholder="e.g. Aisha K."
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            "h-14 min-w-0 flex-1 rounded-full bg-sunken px-6 text-[1.0625rem] font-medium text-fg shadow-ring outline-none placeholder:text-fg-faint",
            "transition-shadow duration-150 focus:shadow-[0_0_0_2px_var(--color-fg)]",
            error && "shadow-[0_0_0_2px_var(--color-danger)]",
          )}
        />
        <div className="flex gap-3">
          <Button type="submit" variant="game" size="lg" className="flex-1 sm:flex-none">
            {submitLabel}
          </Button>
          <Button variant="ghost" size="lg" onClick={onSkip}>
            Skip
          </Button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="type-small pl-6 text-danger"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </form>
  );
}
