"use client";

import { Check, CircleX, Link2, LoaderCircle, MonitorSmartphone, ShieldCheck, Smartphone, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { NextPlayerIcon } from "@/components/game/next-player";
import { Button, IconButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { useLink } from "./link";
import type { FailReason, PhoneNotice } from "./phone-machine";
import { linkPath, TIMING } from "./protocol";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const subscribeNever = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => null;

/** Wall-clock time, refreshed every `ms`. Starts at 0 until the first tick. */
function useNow(ms: number): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const first = window.requestAnimationFrame(() => setNow(Date.now()));
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => {
      window.cancelAnimationFrame(first);
      window.clearInterval(id);
    };
  }, [ms]);
  return now;
}

function clockFrom(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** What travels to the booth screen and what never does: said before anyone scans, and again on the phone. */
export const LINK_PROMISES = {
  sent: "The booth screen gets readings only: tilt, taps, loudness.",
  never: "Never your camera picture, your sound or where you are.",
  saved: "Nothing is saved, on either device.",
};

function Qr({ value, size }: { value: string; size: number }) {
  return (
    <div className="grid shrink-0 place-items-center rounded-md bg-white p-2.5" style={{ width: size + 20, height: size + 20 }} data-url={value}>
      <QRCodeSVG value={value} size={size} level="M" marginSize={0} bgColor="#ffffff" fgColor="#0e1015" title="QR code to play on your phone" />
    </div>
  );
}

/* ── The booth laptop ─────────────────────────────────────────────── */

/**
 * The laptop's QR code. While it holds a code, scanning links the phone to
 * this screen. If the matchmaking server can't be reached, it falls back to
 * the plain link, so the phone can still play on its own.
 */
export function LinkCard({ hero = false, compact = false, className }: { hero?: boolean; compact?: boolean; className?: string }) {
  const link = useLink();
  const origin = useSyncExternalStore(subscribeNever, getOrigin, getServerOrigin);
  if (link.role !== "host" || link.following) return null;
  const { host } = link;
  const size = hero ? 116 : compact ? 96 : 116;
  const offline = host.kind === "offline";
  const url = origin ? `${origin}${host.kind === "waiting" ? linkPath(host.code) : "/phone"}` : null;
  const ready = url != null && (host.kind === "waiting" || offline);

  return (
    <div className={cn("flex w-full max-w-[34rem] items-center gap-5 rounded-lg bg-surface p-3 pr-5 shadow-ring", className)}>
      {ready ? (
        <Qr value={url} size={size} />
      ) : (
        <div className="grid shrink-0 place-items-center rounded-md bg-sunken" style={{ width: size + 20, height: size + 20 }}>
          <LoaderCircle aria-hidden className="size-6 animate-spin text-fg-subtle" />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className={cn("font-semibold text-fg", hero ? "type-title-3" : "type-body")}>{offline ? "Play on your phone" : "Play with your own phone"}</span>
        <span className="type-small text-fg-muted">
          {offline
            ? "Scan to open the game on your phone. Linking it to this screen needs the internet, and the link server isn't answering."
            : host.kind === "waiting"
              ? "Scan with your phone's camera. Your phone becomes the controller; this screen shows what it senses."
              : "Getting a code for your phone."}
        </span>
        {offline || compact ? null : (
          <span className="type-small inline-flex items-start gap-1.5 text-fg-subtle">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            Only readings travel, never your picture, sound or location. Nothing is saved.
          </span>
        )}
      </div>
    </div>
  );
}

/** Header status on the laptop while a phone drives it. */
export function HostLinkStatus() {
  const link = useLink();
  if (link.role !== "host" || !link.following) return null;
  const away = link.host.kind === "paused";
  return (
    <span
      role="status"
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[0.875rem] font-semibold",
        away ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
      )}
    >
      <span aria-hidden className={cn("size-2 rounded-full", away ? "bg-warning" : "bg-success")} />
      {away ? "Waiting for the phone" : "Phone linked"}
    </span>
  );
}

const PAUSED_COPY = {
  away: {
    title: "Waiting for the phone",
    text: "Its screen is locked, or it's showing another app. When the visitor comes back, this screen carries on.",
  },
  left: {
    title: "Waiting for the phone",
    text: "The visitor left the game on their phone. If they open it again, this screen carries on.",
  },
  lost: {
    title: "Lost contact with the phone",
    text: "Trying to reach it again. Phones on busy Wi-Fi drop out for a moment sometimes.",
  },
} as const;

/**
 * Laptop: the linked phone stepped away. The session is held for the same
 * phone for a while (with a real countdown); anyone new can scan to start,
 * and staff can start over at once.
 */
export function PausedOverlay() {
  const link = useLink();
  const now = useNow(1000);
  const origin = useSyncExternalStore(subscribeNever, getOrigin, getServerOrigin);
  const { host } = link;
  const paused = link.role === "host" && host.kind === "paused";
  return (
    <AnimatePresence>
      {paused ? (
        <motion.div
          key="paused"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
          className="fixed inset-x-0 bottom-0 top-16 z-20 grid place-items-center bg-canvas/85 px-4"
        >
          <motion.div
            initial={{ scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT } }}
            role="alertdialog"
            aria-labelledby="paused-title"
            className="flex w-full max-w-[38rem] flex-col gap-6 rounded-xl bg-raised p-6 shadow-float sm:p-8"
          >
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-warning/15 text-warning">
                <Smartphone aria-hidden className="size-6" />
              </span>
              <div className="flex min-w-0 flex-col gap-2">
                <h2 id="paused-title" className="type-title-2 text-fg">
                  {PAUSED_COPY[host.why].title}
                </h2>
                <p className="type-body text-fg-muted">{PAUSED_COPY[host.why].text}</p>
                {now > 0 ? (
                  <p className="type-label tabular-nums text-fg-subtle">
                    Starting over for the next visitor in {clockFrom(TIMING.grace - (now - host.since))}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-5 rounded-lg bg-surface p-3 pr-5">
              <div className="flex items-center gap-4">
                {origin ? <Qr value={`${origin}${linkPath(host.code)}`} size={84} /> : null}
                <div className="flex flex-col gap-1">
                  <span className="type-body font-semibold text-fg">New visitor?</span>
                  <span className="type-small text-fg-muted">Scan to start with your own phone.</span>
                </div>
              </div>
              <Button variant="secondary" size="lg" icon={<NextPlayerIcon />} onClick={link.nextPlayer}>
                Start over now
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ── The visitor's phone ──────────────────────────────────────────── */

const NOTICE_COPY: Record<PhoneNotice, string> = {
  reset: "The booth screen started over for the next visitor. You're unlinked, and nothing was kept.",
  idle: `Unlinked after ${TIMING.idle / 60_000} minutes with nothing happening. Nothing was kept.`,
  timeout: "Unlinked: your phone was away for too long. Nothing was kept.",
  replaced: "Someone else linked to the booth screen while you were away.",
  gone: "The booth screen has moved on. Scan its code again to link.",
  lost: "Lost the booth screen. You can keep playing here.",
  unlinked: "Unlinked. Nothing was kept on either device.",
};

export const FAIL_COPY: Record<FailReason, { title: string; text: string }> = {
  expired: { title: "This code has expired", text: "The booth screen has a new one. Scan the code on the screen again to link." },
  busy: { title: "Someone else is linked", text: "The booth screen follows one phone at a time. Play here, or scan again when they're done." },
  network: { title: "Couldn't reach the booth screen", text: "Linking needs the internet. Check that your phone is online, then try again." },
  timeout: { title: "Linking is taking too long", text: "The Wi-Fi here may be blocking it. Try again, or play on this phone." },
  unsupported: { title: "This browser can't link", text: "You can still try every sensor here." },
};

export function canRetry(reason: FailReason) {
  return reason === "network" || reason === "timeout";
}

/**
 * Phone: a slim line under the header whenever the link changes while the
 * visitor is playing. Steady "linked" lives in the header button instead.
 */
export function PhoneLinkBanner() {
  const link = useLink();
  const { phone } = link;
  if (link.role !== "phone") return null;

  let icon: ReactNode = null;
  let text: string | null = null;
  let actions: ReactNode = null;
  if (phone.kind === "connecting") {
    icon = <LoaderCircle aria-hidden className="size-4 animate-spin text-game" />;
    text = "Linking to the booth screen";
  } else if (phone.kind === "reconnecting") {
    icon = <LoaderCircle aria-hidden className="size-4 animate-spin text-game" />;
    text = "Reconnecting to the booth screen";
    actions = (
      <Button variant="ghost" size="sm" onClick={link.unlink}>
        Stop
      </Button>
    );
  } else if (phone.kind === "failed") {
    icon = <CircleX aria-hidden className="size-4 text-warning" />;
    text = FAIL_COPY[phone.reason].title;
    actions = (
      <>
        {canRetry(phone.reason) ? (
          <Button variant="ghost" size="sm" onClick={link.retry}>
            Try again
          </Button>
        ) : null}
        <IconButton label="Close" icon={<X />} size="sm" variant="ghost" onClick={link.dismiss} />
      </>
    );
  } else if (phone.kind === "off" && phone.notice) {
    icon = <Link2 aria-hidden className="size-4 text-fg-subtle" />;
    text = NOTICE_COPY[phone.notice];
    actions = <IconButton label="Close" icon={<X />} size="sm" variant="ghost" onClick={link.dismiss} />;
  }

  return (
    <AnimatePresence initial={false}>
      {text ? (
        <motion.div
          key={phone.kind}
          role="status"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto", transition: { duration: 0.3, ease: EASE_OUT } }}
          exit={{ opacity: 0, height: 0, transition: { duration: 0.2, ease: EASE_OUT } }}
          className="mx-auto w-full max-w-[40rem] overflow-hidden px-4 sm:px-6"
        >
          <div className="mb-2 flex min-h-12 items-center gap-3 rounded-lg bg-surface py-1.5 pl-4 pr-1.5 shadow-ring">
            <span className="shrink-0">{icon}</span>
            <span className="type-small min-w-0 flex-1 py-1 text-fg-muted">{text}</span>
            {actions}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Phone header: linked, with the details and Unlink one tap away. */
export function PhoneLinkButton() {
  const link = useLink();
  const [open, setOpen] = useState(false);
  if (link.role !== "phone" || link.phone.kind !== "linked") return null;
  return (
    <>
      <span className="relative inline-flex">
        <IconButton label="Linked to the booth screen" icon={<MonitorSmartphone />} variant="ghost" onClick={() => setOpen(true)} />
        <span aria-hidden className="pointer-events-none absolute right-2 top-2 size-2.5 rounded-full bg-success shadow-[0_0_0_2px_var(--color-canvas)]" />
      </span>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Linked to the booth screen"
        description="The booth screen shows what your phone senses, as you play."
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setOpen(false)}>
              Keep playing
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => {
                setOpen(false);
                link.unlink();
              }}
            >
              Unlink
            </Button>
          </>
        }
      >
        <Promises />
      </Modal>
    </>
  );
}

export function Promises({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      <li className="flex items-start gap-3">
        <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
        <span className="type-body text-fg-muted">{LINK_PROMISES.sent}</span>
      </li>
      <li className="flex items-start gap-3">
        <X aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-subtle" />
        <span className="type-body text-fg-muted">{LINK_PROMISES.never}</span>
      </li>
      <li className="flex items-start gap-3">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-subtle" />
        <span className="type-body text-fg-muted">{LINK_PROMISES.saved}</span>
      </li>
    </ul>
  );
}

/**
 * Two devices and the line between them: dots travel from the phone to the
 * booth screen once linked, the line waits while linking, breaks on failure.
 */
export function LinkPicture({ state }: { state: "linking" | "linked" | "failed" }) {
  return (
    <svg viewBox="0 0 220 96" className="h-24 w-full max-w-[17rem]" aria-hidden>
      {/* The phone. */}
      <rect x={14} y={14} width={40} height={70} rx={9} className="fill-fg/[0.06] stroke-fg/60" strokeWidth={2.4} />
      <rect x={28} y={20} width={12} height={4} rx={2} className="fill-fg/40" />
      {/* The booth screen. */}
      <rect x={136} y={16} width={70} height={48} rx={6} className="fill-fg/[0.06] stroke-fg/60" strokeWidth={2.4} />
      <path d="M160 64 l-4 14 h28 l-4 -14" className="fill-fg/[0.06] stroke-fg/60" strokeWidth={2.4} strokeLinejoin="round" />
      <line
        x1={64}
        y1={48}
        x2={126}
        y2={48}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeDasharray={state === "linked" ? undefined : "4 6"}
        className={state === "failed" ? "stroke-fg/20" : state === "linked" ? "stroke-game" : "stroke-fg/40"}
      />
      {state === "linked"
        ? [0, 1, 2].map((i) => (
            <motion.circle
              key={i}
              cy={48}
              r={4}
              className="fill-game"
              initial={{ cx: 64, opacity: 0 }}
              animate={{ cx: [64, 126], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.5, ease: "linear", repeat: Infinity, delay: i * 0.5 }}
            />
          ))
        : null}
      {state === "failed" ? <path d="M88 40 l14 16 m0 -16 l-14 16" className="stroke-warning" strokeWidth={2.6} strokeLinecap="round" /> : null}
      {state === "linked" ? <circle cx={171} cy={40} r={10} className="fill-game" /> : null}
      {state === "linked" ? <path d="M166 40 l3.5 3.5 l6 -7" className="stroke-game-ink" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </svg>
  );
}
