import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "game" | "secondary" | "ghost" | "danger" | "on-game";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "group/button relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold " +
  "transition-[background-color,color,box-shadow,scale,translate,opacity] duration-150 ease-out " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg " +
  "[&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  // The one filled action on a neutral screen.
  primary: "bg-fg text-canvas hover:bg-white",
  // Inside a game: the game's own colour.
  game: "bg-game text-game-ink hover:brightness-[1.06]",
  secondary: "bg-raised text-fg shadow-ring hover:bg-overlay",
  ghost: "text-fg-muted hover:bg-fg/[0.06] hover:text-fg",
  danger: "bg-danger text-canvas hover:brightness-[1.06]",
  // Sitting on a coloured game surface (tiles, banners).
  "on-game": "bg-game-ink text-game hover:brightness-[1.15]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-[0.875rem] [&_svg]:size-4",
  md: "h-11 px-5 text-[0.9375rem] [&_svg]:size-[18px]",
  lg: "h-14 px-7 text-[1.0625rem] [&_svg]:size-5",
};

/** Room for the arrow chip, minus 2px of optical correction on the icon side. */
const arrowPadding: Record<ButtonSize, string> = {
  sm: "pr-1",
  md: "pr-1.5",
  lg: "pr-2",
};

const chipSizes: Record<ButtonSize, string> = {
  sm: "size-7 [&_svg]:size-3.5",
  md: "size-8 [&_svg]:size-4",
  lg: "size-10 [&_svg]:size-5",
};

const chipColors: Record<ButtonVariant, string> = {
  primary: "bg-canvas text-fg",
  game: "bg-game-ink text-game",
  secondary: "bg-fg text-canvas",
  ghost: "bg-fg/10 text-fg",
  danger: "bg-canvas text-fg",
  "on-game": "bg-game text-game-ink",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  arrow = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  arrow?: boolean;
  className?: string;
}) {
  return cn(base, variants[variant], sizes[size], arrow && arrowPadding[size], className);
}

interface ContentProps {
  icon?: ReactNode;
  arrow?: boolean;
  loading?: boolean;
  variant: ButtonVariant;
  size: ButtonSize;
  children?: ReactNode;
}

function ButtonContent({ icon, arrow, loading, variant, size, children }: ContentProps) {
  return (
    <>
      {loading ? <LoaderCircle aria-hidden className="animate-spin" /> : icon}
      {children}
      {arrow ? (
        <span
          aria-hidden
          className={cn(
            "ml-1 grid place-items-center rounded-full transition-transform duration-200 ease-out",
            "group-hover/button:translate-x-0.5",
            chipSizes[size],
            chipColors[variant],
          )}
        >
          <ArrowRight strokeWidth={2.5} />
        </span>
      ) : null}
    </>
  );
}

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon (a lucide icon element). */
  icon?: ReactNode;
  /** Trailing round arrow chip, for the main action on a screen. */
  arrow?: boolean;
  /** Shows a spinner in place of the icon and blocks clicks, keeping the label. */
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  arrow,
  loading,
  className,
  children,
  type = "button",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={cn(buttonStyles({ variant, size, arrow, className }), loading && "pointer-events-none")}
      {...props}
    >
      <ButtonContent icon={icon} arrow={arrow} loading={loading} variant={variant} size={size}>
        {children}
      </ButtonContent>
    </button>
  );
}

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  arrow?: boolean;
}

export function ButtonLink({ variant = "primary", size = "md", icon, arrow, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonStyles({ variant, size, arrow, className })} {...props}>
      <ButtonContent icon={icon} arrow={arrow} variant={variant} size={size}>
        {children}
      </ButtonContent>
    </Link>
  );
}

/* ── Icon-only buttons ──────────────────────────────────────────── */

const iconSizes: Record<ButtonSize, string> = {
  sm: "size-9 [&_svg]:size-4",
  md: "size-11 [&_svg]:size-5",
  lg: "size-14 [&_svg]:size-6",
};

export interface IconButtonProps extends Omit<ComponentProps<"button">, "children"> {
  /** Required accessible name, also shown as a native tooltip. */
  label: string;
  icon: ReactNode;
  variant?: Exclude<ButtonVariant, "danger">;
  size?: ButtonSize;
  /** Visually pressed state for toggles (sound on, skeleton on...). */
  pressed?: boolean;
}

export function IconButton({
  label,
  icon,
  variant = "secondary",
  size = "md",
  pressed,
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(base, variants[variant], iconSizes[size], "px-0", pressed && "bg-fg text-canvas hover:bg-white hover:text-canvas", className)}
      {...props}
    >
      {icon}
    </button>
  );
}
