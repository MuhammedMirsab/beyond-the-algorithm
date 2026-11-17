"use client";

import { Camera, Clock3, Mic, Smartphone, Wifi } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { gameBySlug, type GameSlug, type Need } from "@/content/games";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";

const NEED_COPY: Record<Need, { label: string; icon: ReactNode }> = {
  camera: { label: "Camera", icon: <Camera /> },
  microphone: { label: "Microphone", icon: <Mic /> },
  motion: { label: "Motion sensors", icon: <Smartphone /> },
  internet: { label: "Internet", icon: <Wifi /> },
};

export function NeedChips({ slug, tone = "neutral" }: { slug: GameSlug; tone?: "neutral" | "on-game" }) {
  const game = gameBySlug(slug);
  return (
    <div className="flex flex-wrap gap-2">
      <Chip tone={tone} icon={<Clock3 />}>
        {game.minutes} min
      </Chip>
      {game.needs.map((need) => (
        <Chip key={need} tone={tone} icon={NEED_COPY[need].icon}>
          {NEED_COPY[need].label}
        </Chip>
      ))}
    </div>
  );
}

export interface IntroStep {
  title: string;
  text?: string;
}

type Action = Pick<ButtonProps, "onClick" | "disabled" | "loading" | "icon"> & { label: string };

/**
 * The first screen of every game: what it is, what you'll do, one button.
 * Copy rules: the lead says what happens, steps are 2-3 short verbs-first lines.
 */
export function GameIntro({
  slug,
  art,
  title,
  lead,
  steps,
  primary,
  secondary,
  footnote,
  children,
  below,
  headingRef,
  className,
}: {
  slug: GameSlug;
  /** The game's illustration or a live preview. Sits on the game colour. */
  art: ReactNode;
  title?: string;
  lead?: ReactNode;
  steps: IntroStep[];
  primary: Action;
  secondary?: Action;
  /** Small print: privacy, requirements. */
  footnote?: ReactNode;
  /** Extra controls between steps and actions (e.g. a range picker). */
  children?: ReactNode;
  /** Secondary content after the actions and small print (e.g. a QR handoff). */
  below?: ReactNode;
  /** Focus target when returning to the intro (the heading takes tabIndex -1). */
  headingRef?: Ref<HTMLHeadingElement>;
  className?: string;
}) {
  const game = gameBySlug(slug);
  return (
    <section
      className={cn(
        "mx-auto grid w-full max-w-[75rem] flex-1 items-center gap-8 px-4 pb-10 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14 lg:px-8 lg:pb-16",
        className,
      )}
    >
      <div className="order-2 flex min-w-0 flex-col gap-7 lg:order-1">
        <div className="flex flex-col gap-4">
          <span className="type-label text-game">{game.skill}</span>
          <h1 ref={headingRef} tabIndex={-1} className="type-display-2 text-fg outline-none">
            {title ?? game.title}
          </h1>
          <p className="type-body-lg max-w-[34rem] text-fg-muted">{lead ?? game.hook}</p>
        </div>

        <ol className="flex flex-col gap-3">
          {steps.map((step, i) => (
            <li key={step.title} className="flex items-start gap-4">
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-full bg-game-soft font-mono text-[0.8125rem] font-semibold text-game"
              >
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-col pt-1">
                <span className="type-body font-semibold text-fg">{step.title}</span>
                {step.text ? <span className="type-small text-fg-subtle">{step.text}</span> : null}
              </span>
            </li>
          ))}
        </ol>

        {children}

        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="game"
              size="lg"
              arrow
              onClick={primary.onClick}
              disabled={primary.disabled}
              loading={primary.loading}
              icon={primary.icon}
            >
              {primary.label}
            </Button>
            {secondary ? (
              <Button
                variant="ghost"
                size="lg"
                onClick={secondary.onClick}
                disabled={secondary.disabled}
                loading={secondary.loading}
                icon={secondary.icon}
              >
                {secondary.label}
              </Button>
            ) : null}
          </div>
          <NeedChips slug={slug} />
          {footnote ? <p className="type-small max-w-[34rem] text-fg-subtle">{footnote}</p> : null}
        </div>
        {below}
      </div>

      <div className="order-1 lg:order-2">
        {/* Below desktop the art is a banner, capped so the title and Start button stay in view. */}
        <div className="tile-surface grain relative aspect-[16/10] max-h-[42dvh] w-full overflow-hidden rounded-xl lg:aspect-square lg:max-h-[min(640px,calc(100dvh-160px))]">
          <div className="absolute inset-0 z-[2]">{art}</div>
        </div>
      </div>
    </section>
  );
}
