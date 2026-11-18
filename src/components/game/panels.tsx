import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";

/**
 * The reveal: how the AI did what it just did. Numbered because it is a real
 * sequence. Every game ends with one of these; it is the point of the exhibit.
 */
export function HowItWorks({
  title = "How the AI did it",
  intro,
  steps,
  heading = true,
  columns = "auto",
  className,
}: {
  title?: string;
  /** Lead under the title. May hold block content (lists, small charts). */
  intro?: ReactNode;
  steps: { title: string; text: ReactNode; visual?: ReactNode }[];
  /** Hide the title and intro, e.g. inside a Modal that already shows the title. */
  heading?: boolean;
  /** "auto" fits as many 15rem columns as there is room for. */
  columns?: "auto" | 1 | 3;
  className?: string;
}) {
  // Each card spans the same rows of a shared grid (subgrid), so pictures,
  // titles and text line up across cards even when one title wraps.
  const hasVisuals = steps.some((step) => step.visual);
  return (
    <section className={cn("flex flex-col gap-6", className)} aria-label={title}>
      {heading ? (
        <div className="flex flex-col gap-2">
          <h2 className="type-title-1 text-fg">{title}</h2>
          {intro ? <div className="type-body-lg max-w-[40rem] text-fg-muted">{intro}</div> : null}
        </div>
      ) : null}
      <ol
        className={cn(
          "grid gap-3",
          columns === "auto" && "md:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]",
          columns === 3 && "md:grid-cols-3",
        )}
      >
        {steps.map((step, i) => (
          <li
            key={step.title}
            className={cn(
              "reveal grid grid-rows-subgrid content-start gap-3 rounded-lg bg-surface p-5 shadow-ring",
              hasVisuals ? "row-span-4" : "row-span-3",
            )}
          >
            <span className="type-label text-game">Step {i + 1}</span>
            {hasVisuals ? (
              step.visual ? (
                <div className="flex flex-col justify-center overflow-hidden rounded-md bg-sunken">{step.visual}</div>
              ) : (
                <div aria-hidden />
              )
            ) : null}
            <h3 className="type-title-3 text-fg">{step.title}</h3>
            <div className="type-body text-fg-muted">{step.text}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * End of a run: one verdict line, the number that matters, a few stats, and
 * the next actions. Put the HowItWorks reveal in children.
 */
export function ResultPanel({
  label,
  badge,
  title,
  headingRef,
  score,
  stats,
  actions,
  children,
  className,
}: {
  /** Machine-voice context, e.g. "Game over · 6 rounds". */
  label?: string;
  /** A status chip next to the label, e.g. a win or loss Chip with an icon. */
  badge?: ReactNode;
  /** The verdict, e.g. "You spotted 5 of 6". */
  title: string;
  /** Focus target when the screen changes (the heading takes tabIndex -1). */
  headingRef?: Ref<HTMLHeadingElement>;
  /** The number that matters, rendered large (use <Score/>). */
  score?: ReactNode;
  stats?: ReactNode;
  actions: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mx-auto flex w-full max-w-[69rem] flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8 lg:py-12", className)}>
      <div className="grid items-end gap-8 rounded-xl bg-surface p-6 shadow-ring sm:p-8 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-4">
          {label || badge ? (
            <div className="flex flex-wrap items-center gap-3">
              {label ? <span className="type-label text-game">{label}</span> : null}
              {badge}
            </div>
          ) : null}
          <h1 ref={headingRef} tabIndex={-1} className="type-display-2 text-fg outline-none">
            {title}
          </h1>
          {stats ? <div className="flex flex-wrap gap-x-10 gap-y-4 pt-2">{stats}</div> : null}
        </div>
        {score ? <div className="md:text-right">{score}</div> : null}
        <div className="flex flex-wrap gap-3 md:col-span-2">{actions}</div>
      </div>
      {children}
    </section>
  );
}

/** A centred status/empty/notice block used for loading, errors and empty states. */
export function Notice({
  icon,
  title,
  children,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" className={cn("mx-auto flex w-full max-w-[28rem] flex-col items-center gap-4 text-center", className)}>
      {icon ? (
        <span className="grid size-14 place-items-center rounded-full bg-game-soft text-game [&_svg]:size-6">{icon}</span>
      ) : null}
      <h2 className="type-title-2 text-fg">{title}</h2>
      {children ? <div className="type-body text-fg-muted">{children}</div> : null}
      {actions ? <div className="mt-2 flex flex-wrap justify-center gap-3">{actions}</div> : null}
    </div>
  );
}
