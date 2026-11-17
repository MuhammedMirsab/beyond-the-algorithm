"use client";

import type { ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Icon only on small screens (the label stays as its accessible name and
 * tooltip), icon and label once there is room. `from` sets that breakpoint.
 */
export function AdaptiveButton({
  icon,
  label,
  onClick,
  variant = "ghost",
  size = "md",
  from = "sm",
  pressed,
  disabled,
  popup,
  shortcut,
  className,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant?: "ghost" | "secondary" | "game";
  size?: "md" | "lg";
  from?: "sm" | "lg" | "xl";
  pressed?: boolean;
  disabled?: boolean;
  /** Opens a dialog. */
  popup?: boolean;
  shortcut?: string;
  className?: string;
}) {
  const hideIcon = { sm: "sm:hidden", lg: "lg:hidden", xl: "xl:hidden" }[from];
  const showLabel = { sm: "hidden sm:inline-flex", lg: "hidden lg:inline-flex", xl: "hidden xl:inline-flex" }[from];
  const aria = { "aria-haspopup": popup ? ("dialog" as const) : undefined, "aria-keyshortcuts": shortcut };
  return (
    <>
      <IconButton
        label={label}
        icon={icon}
        variant={variant}
        size={size}
        pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={cn(hideIcon, className)}
        {...aria}
      />
      <Button variant={variant} size={size} icon={icon} onClick={onClick} disabled={disabled} aria-pressed={pressed} className={cn(showLabel, className)} {...aria}>
        {label}
      </Button>
    </>
  );
}
