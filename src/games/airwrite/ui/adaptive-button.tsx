"use client";

import type { ReactNode } from "react";
import { Button, IconButton } from "@/components/ui/button";

/**
 * Icon-only on phones (the label stays as its accessible name and tooltip),
 * icon and label from 640px up. Used for header actions and the camera switch.
 */
export function AdaptiveButton({
  icon,
  label,
  onClick,
  variant = "ghost",
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant?: "ghost" | "secondary";
}) {
  return (
    <>
      <IconButton label={label} icon={icon} variant={variant} onClick={onClick} className="sm:hidden" />
      <Button variant={variant} icon={icon} onClick={onClick} className="hidden sm:inline-flex">
        {label}
      </Button>
    </>
  );
}
