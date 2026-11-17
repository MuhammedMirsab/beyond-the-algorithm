"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A modern iPhone, drawn in CSS at true proportions (393 x 852 pt screen,
 * Dynamic Island, titanium band, side buttons). Children render inside the
 * screen at 1pt = 1px * scale, so a 393px-wide frame shows UI at real size.
 *
 * Inside the screen, use var(--phone-safe-top) / var(--phone-safe-bottom)
 * to clear the status bar and home indicator.
 *
 * Do not render this on an actual phone: show the content full-screen instead.
 */
export function PhoneFrame({
  children,
  width = 360,
  finish = "black",
  statusBar = "light",
  time,
  island,
  className,
  screenClassName,
}: {
  children?: ReactNode;
  /** Outer width of the device in px. Height follows the real aspect ratio. */
  width?: number;
  finish?: "black" | "natural" | "blue";
  /** Text colour of the status bar: light text on dark screens. */
  statusBar?: "light" | "dark";
  /** Fixed time label, e.g. "7:00". Defaults to the live clock. */
  time?: string;
  /** Content inside the Dynamic Island (expands it). */
  island?: ReactNode;
  className?: string;
  screenClassName?: string;
}) {
  const W = width;
  const H = W * 2.092;
  const band = W * 0.017;
  const bezel = W * 0.019;
  const inset = band + bezel;
  const screenW = W - inset * 2;
  const s = screenW / 393; // points to px
  const outerR = W * 0.168;
  const screenR = outerR - inset;

  const metal = {
    black: "linear-gradient(140deg, #5b5e64 0%, #2a2c30 18%, #3e4146 46%, #1f2124 72%, #4a4d52 100%)",
    natural: "linear-gradient(140deg, #d9d4cc 0%, #9c978f 20%, #c8c2b8 48%, #8e8981 74%, #cfc9bf 100%)",
    blue: "linear-gradient(140deg, #6f7f97 0%, #39465a 20%, #56657d 48%, #2f3a4b 74%, #66768e 100%)",
  }[finish];

  const button = (side: "left" | "right", top: number, height: number): CSSProperties => ({
    position: "absolute",
    top: H * top,
    height: H * height,
    width: W * 0.012,
    [side]: -W * 0.0105,
    borderRadius: W * 0.01,
    background: metal,
  });

  return (
    <div
      className={cn("relative shrink-0 select-none", className)}
      style={{ width: W, height: H }}
      role="img"
      aria-label="Phone"
    >
      {/* Side buttons: action, volume up, volume down, side button. */}
      <span aria-hidden style={button("left", 0.168, 0.034)} />
      <span aria-hidden style={button("left", 0.232, 0.062)} />
      <span aria-hidden style={button("left", 0.31, 0.062)} />
      <span aria-hidden style={button("right", 0.25, 0.098)} />

      {/* Titanium band. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          borderRadius: outerR,
          background: metal,
          boxShadow: `0 ${W * 0.06}px ${W * 0.14}px -${W * 0.04}px oklch(0 0 0 / 0.7), 0 ${W * 0.01}px ${W * 0.03}px oklch(0 0 0 / 0.4)`,
        }}
      />
      {/* Black glass edge. */}
      <div aria-hidden className="absolute bg-black" style={{ inset: band, borderRadius: outerR - band }} />

      {/* Screen. */}
      <div
        className={cn("absolute overflow-hidden bg-black", screenClassName)}
        style={
          {
            inset,
            borderRadius: screenR,
            "--phone-safe-top": `${54 * s}px`,
            "--phone-safe-bottom": `${34 * s}px`,
            "--phone-scale": s,
          } as CSSProperties
        }
      >
        <div className="relative size-full">{children}</div>

        {/* Status bar. */}
        <div
          aria-hidden
          className={cn("pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between", statusBar === "light" ? "text-white" : "text-black")}
          style={{ height: 54 * s, paddingInline: 33 * s, paddingTop: 4 * s }}
        >
          <span className="tabular-nums" style={{ fontSize: 16.5 * s, fontWeight: 650, letterSpacing: "-0.01em", width: 70 * s, textAlign: "center" }}>
            <Clock fixed={time} />
          </span>
          <StatusIcons s={s} />
        </div>

        {/* Dynamic Island. */}
        <div
          aria-hidden={island ? undefined : true}
          className="absolute left-1/2 z-30 flex -translate-x-1/2 items-center justify-center overflow-hidden bg-black text-white transition-[width,height,border-radius] duration-400 ease-[var(--ease-out)]"
          style={{
            top: 11 * s,
            width: island ? screenW - 22 * s : 126 * s,
            height: island ? 84 * s : 37 * s,
            borderRadius: island ? 42 * s : 18.5 * s,
          }}
        >
          {island}
        </div>

        {/* Home indicator. */}
        <div
          aria-hidden
          className={cn("pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 rounded-full", statusBar === "light" ? "bg-white/85" : "bg-black/80")}
          style={{ bottom: 8 * s, width: 134 * s, height: 5 * s }}
        />
      </div>
    </div>
  );
}

function Clock({ fixed }: { fixed?: string }) {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    if (fixed) return;
    const tick = () => {
      const d = new Date();
      setNow(`${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [fixed]);
  return <>{fixed ?? now ?? "9:41"}</>;
}

function StatusIcons({ s }: { s: number }) {
  return (
    <span className="flex items-center" style={{ gap: 6 * s, width: 70 * s, justifyContent: "center" }}>
      {/* Signal */}
      <svg width={18 * s} height={12 * s} viewBox="0 0 18 12" fill="currentColor">
        <rect x="0" y="8" width="3" height="4" rx="0.8" />
        <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
        <rect x="10" y="3" width="3" height="9" rx="0.8" />
        <rect x="15" y="0" width="3" height="12" rx="0.8" />
      </svg>
      {/* Wi-Fi */}
      <svg width={16 * s} height={12 * s} viewBox="0 0 16 12" fill="currentColor">
        <path d="M8 12 5.6 9.3a3.4 3.4 0 0 1 4.8 0L8 12Z" />
        <path d="M3.4 7.1a6.5 6.5 0 0 1 9.2 0l-1.3 1.4a4.6 4.6 0 0 0-6.6 0L3.4 7.1Z" />
        <path d="M1.1 4.6a9.8 9.8 0 0 1 13.8 0l-1.3 1.4a7.9 7.9 0 0 0-11.2 0L1.1 4.6Z" />
      </svg>
      {/* Battery */}
      <svg width={26 * s} height={12 * s} viewBox="0 0 26 12" fill="none">
        <rect x="0.5" y="0.5" width="22" height="11" rx="3.2" stroke="currentColor" opacity="0.45" />
        <rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" />
        <path d="M24 4v4c.8-.3 1.3-1.1 1.3-2S24.8 4.3 24 4Z" fill="currentColor" opacity="0.45" />
      </svg>
    </span>
  );
}
