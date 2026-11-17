"use client";

import { Slider as BaseSlider } from "@base-ui/react/slider";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A labelled on/off setting. The label describes the ON state. */
export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="type-body block font-semibold text-fg">{label}</span>
        {description ? <span className="type-small block text-fg-subtle">{description}</span> : null}
      </label>
      <BaseSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 ease-out",
          "bg-fg/15 data-[checked]:bg-game focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
        )}
      >
        <BaseSwitch.Thumb className="size-6 rounded-full bg-fg shadow-[0_1px_2px_oklch(0_0_0/0.4)] transition-transform duration-200 ease-out data-[checked]:translate-x-5 data-[checked]:bg-game-ink" />
      </BaseSwitch.Root>
    </div>
  );
}

/** A labelled slider with its current value shown in words or numbers. */
export function SliderRow({
  label,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  valueText,
  description,
}: {
  label: string;
  value: number;
  /** One line under the slider saying what changes. */
  description?: string;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** How the value reads to people, e.g. "Medium" or "62%". */
  valueText: string;
}) {
  return (
    <BaseSlider.Root
      value={value}
      min={min}
      max={max}
      step={step}
      onValueChange={(next) => onValueChange(Array.isArray(next) ? next[0] : next)}
      className="flex flex-col gap-3 py-2"
    >
      <div className="flex items-baseline justify-between gap-4">
        <BaseSlider.Label className="type-body font-semibold text-fg">{label}</BaseSlider.Label>
        <span className="type-small tabular-nums text-fg-muted">{valueText}</span>
      </div>
      <BaseSlider.Control className="flex h-6 w-full touch-none select-none items-center">
        <BaseSlider.Track className="relative h-1.5 w-full rounded-full bg-fg/15">
          <BaseSlider.Indicator className="rounded-full bg-game" />
          <BaseSlider.Thumb
            getAriaValueText={() => valueText}
            className="size-5 rounded-full bg-fg shadow-[0_1px_3px_oklch(0_0_0/0.5)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
          />
        </BaseSlider.Track>
      </BaseSlider.Control>
      {description ? <p className="type-small -mt-1 text-fg-subtle">{description}</p> : null}
    </BaseSlider.Root>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

/**
 * A small set of mutually exclusive views (2-4). Sliding pill; its first
 * position is set without a transition. Keyboard: arrow keys, one Tab stop.
 */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  label,
  activateOnFocus,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentOption<T>[];
  label: string;
  /** Select the option as soon as arrow keys focus it. */
  activateOnFocus?: boolean;
  className?: string;
}) {
  return (
    <BaseTabs.Root value={value} onValueChange={(v) => onValueChange(v as T)} className={className}>
      <BaseTabs.List
        aria-label={label}
        activateOnFocus={activateOnFocus}
        className="relative inline-flex h-11 items-center gap-1 rounded-full bg-surface p-1 shadow-ring"
      >
        {options.map((option) => (
          <BaseTabs.Tab
            key={option.value}
            value={option.value}
            className={cn(
              "relative z-10 h-9 select-none whitespace-nowrap rounded-full px-4 text-[0.9375rem] font-semibold text-fg-muted",
              "transition-colors duration-150 ease-out hover:text-fg data-[active]:text-canvas",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
            )}
          >
            {option.label}
          </BaseTabs.Tab>
        ))}
        <BaseTabs.Indicator
          renderBeforeHydration
          className={cn(
            "absolute left-0 top-1/2 z-0 h-9 -translate-y-1/2 rounded-full bg-fg",
            "w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)]",
            "transition-[translate,width] duration-250 ease-[var(--ease-out)]",
          )}
        />
      </BaseTabs.List>
    </BaseTabs.Root>
  );
}
