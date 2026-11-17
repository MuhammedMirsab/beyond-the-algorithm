"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Modal built on Base UI (focus trap, Escape, return focus, scroll lock).
 * On phones it becomes a bottom sheet; on wider screens a centred panel.
 * Enter 250ms / exit 150ms, scale from 0.96, never from 0.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Actions. Rendered outside the scrolling body so they never scroll away. */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Set false for decisions that must be answered (no backdrop click / Escape). */
  dismissible?: boolean;
}) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !dismissible) return;
        onOpenChange(next);
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/60",
            "transition-opacity duration-250 ease-out data-[ending-style]:duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
          )}
        />
        <BaseDialog.Popup
          className={cn(
            "fixed z-50 flex max-h-[calc(100dvh-24px)] flex-col overflow-hidden bg-raised text-fg shadow-float outline-none",
            // Phone: bottom sheet, attached to the edge.
            "inset-x-0 bottom-0 rounded-t-xl pb-[env(safe-area-inset-bottom)]",
            "transition-[transform,opacity] duration-400 ease-[var(--ease-drawer)] data-[ending-style]:duration-250",
            "data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full",
            // Tablet and up: centred card that scales in.
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:pb-0",
            "sm:duration-250 sm:ease-out sm:data-[ending-style]:duration-150",
            "sm:data-[starting-style]:-translate-y-1/2 sm:data-[ending-style]:-translate-y-1/2",
            "sm:data-[starting-style]:scale-[0.96] sm:data-[ending-style]:scale-[0.96] sm:data-[starting-style]:opacity-0 sm:data-[ending-style]:opacity-0",
            size === "sm" && "sm:max-w-[420px]",
            size === "md" && "sm:max-w-[560px]",
            size === "lg" && "sm:max-w-[760px]",
          )}
        >
          <div className="flex items-start gap-4 px-6 pt-6 sm:px-7 sm:pt-7">
            <div className="min-w-0 flex-1">
              <BaseDialog.Title className="type-title-2 text-fg">{title}</BaseDialog.Title>
              {description ? (
                <BaseDialog.Description className="type-body mt-2 text-fg-muted">{description}</BaseDialog.Description>
              ) : null}
            </div>
            {dismissible ? (
              <BaseDialog.Close
                aria-label="Close"
                className="-mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-fg-muted transition-colors duration-150 hover:bg-fg/[0.08] hover:text-fg focus-visible:outline-2 focus-visible:outline-fg"
              >
                <X className="size-5" />
              </BaseDialog.Close>
            ) : null}
          </div>
          {children ? <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-5 sm:px-7">{children}</div> : <div className="h-6" />}
          {footer ? (
            <div className="flex flex-col-reverse gap-3 border-t border-line px-6 py-4 sm:flex-row sm:justify-end sm:px-7">{footer}</div>
          ) : null}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
