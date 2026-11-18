"use client";

import { ArrowRight, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { GameArt } from "@/components/art/game-art";
import { GameIntro } from "@/components/game/game-intro";
import { PhoneFrame } from "@/components/game/phone-frame";
import { Button } from "@/components/ui/button";
import { isEuler, roundEuler, rotationMatrix, pointingHeading, type Euler } from "../engine/orientation";
import { useLink, useShared } from "../link/link";
import { canRetry, FAIL_COPY, LinkCard, LinkPicture, Promises } from "../link/link-ui";
import { TIMING } from "../link/protocol";
import { motionNeedsPermission, useDeviceTilt } from "../sensors/use-device-tilt";
import { useCapabilities, useViewportHeight } from "../sensors/use-device";
import { Twin } from "./twin";

const FOOTNOTE = "Nothing is recorded, saved or uploaded. Each sensor turns off when you leave its test.";

/** The booth laptop with nobody linked: scan with your own phone, or try it here. */
export function LaptopIntro({ onStart }: { onStart: () => void }) {
  return (
    <GameIntro
      slug="phone"
      art={<GameArt slug="phone" mode="intro" />}
      lead="Eight sensors are hiding in your phone. Scan the code to test them on your own phone, or try them here."
      steps={[{ title: "Tilt it, tap it, talk to it" }, { title: "See what an app works out about you from each one" }]}
      primary={{ label: "Try it on this laptop", onClick: onStart }}
      keys={[{ keys: ["Enter"], label: "Try it on this laptop" }]}
    >
      {/* For this game the phone is the main way in, so the code sits above the button, not below it. */}
      <LinkCard hero />
    </GameIntro>
  );
}

/** A phone on its own (no booth screen): straight into the sensors. */
export function PhoneIntro({ onStart }: { onStart: () => void }) {
  const [asks, setAsks] = useState(false);
  useEffect(() => {
    // Only known in the browser: iPhones ask before sharing motion.
    const id = window.requestAnimationFrame(() => setAsks(motionNeedsPermission()));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return (
    <GameIntro
      slug="phone"
      art={<GameArt slug="phone" mode="intro" />}
      steps={[
        { title: "Tilt it, tap it, talk to it", text: "Eight sensors, one at a time." },
        { title: "See the numbers it measures" },
        { title: "See what an app works out about you" },
      ]}
      primary={{ label: "Start", onClick: onStart }}
      footnote={
        <>
          {asks ? "Your phone will ask about motion and orientation first: choose Allow. " : null}
          {FOOTNOTE}
        </>
      }
    />
  );
}

/** Seconds since `since`, ticking, for "this is taking a while". */
function useSlow(since: number | null, after: number): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (since == null) return;
    const id = window.setTimeout(() => setSlow(true), Math.max(0, since + after - Date.now()));
    return () => {
      window.clearTimeout(id);
      setSlow(false);
    };
  }, [since, after]);
  return slow;
}

/** What the phone's welcome shares with the booth screen: only its tilt, for the twin. */
interface WelcomeShare {
  live: boolean;
  euler: Euler;
  yaw: number;
}

/**
 * The visitor's phone right after scanning: linking, linked, or why not.
 * Says what travels before anything does. On Android the tilt starts at once,
 * so the twin on the booth screen moves while the visitor reads this.
 */
export function PhoneWelcome({ onStart }: { onStart: () => void }) {
  const link = useLink();
  const caps = useCapabilities();
  const { phone } = link;
  const tilt = useDeviceTilt();
  const { start } = tilt;
  const [asks, setAsks] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setAsks(motionNeedsPermission());
      if (caps.motion) start({ quiet: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [caps.motion, start]);

  const live = tilt.status === "live";
  const [yaw, setYaw] = useState<number | null>(null);
  if (live && yaw == null) setYaw(pointingHeading(rotationMatrix(tilt.euler)) ?? 0);
  useShared<WelcomeShare>("welcome", { live, euler: roundEuler(tilt.euler), yaw: yaw ?? 0 });

  const slow = useSlow(phone.kind === "connecting" ? phone.since : null, TIMING.slowConnect);
  const failed = phone.kind === "failed" ? phone.reason : null;
  const state = phone.kind === "linked" ? "linked" : failed ? "failed" : "linking";

  const title = failed ? FAIL_COPY[failed].title : state === "linked" ? "Linked to the booth screen" : "Linking to the booth screen";
  const text = failed
    ? FAIL_COPY[failed].text
    : state === "linked"
      ? "Your phone is the controller now. Look up: the booth screen shows what it senses."
      : slow
        ? "This is taking a while. Check that your phone is online."
        : "One moment.";

  return (
    <section className="mx-auto flex w-full max-w-[34rem] flex-1 flex-col gap-7 px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4 sm:px-6">
      <LinkPicture state={state} />
      <div className="flex flex-col gap-3">
        <h1 className="type-title-1 text-fg" aria-live="polite">
          {title}
        </h1>
        <p className="type-body-lg text-fg-muted">{text}</p>
      </div>
      {failed ? (
        <p className="type-small inline-flex items-start gap-1.5 text-fg-subtle">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          Nothing was sent from your phone.
        </p>
      ) : (
        <Promises />
      )}
      <div className="mt-auto flex flex-col gap-3">
        {failed ? (
          <>
            {canRetry(failed) ? (
              <Button variant="game" size="lg" onClick={link.retry} className="w-full">
                Try again
              </Button>
            ) : null}
            <Button variant={canRetry(failed) ? "secondary" : "game"} size="lg" arrow={!canRetry(failed)} onClick={link.dismiss} className="w-full">
              Play on this phone
            </Button>
          </>
        ) : (
          <>
            <Button variant="game" size="lg" arrow onClick={onStart} className="w-full">
              Start
            </Button>
            {asks ? <p className="type-small text-center text-fg-subtle">Your phone will ask about motion and orientation. Choose Allow.</p> : null}
            <Button variant="ghost" size="lg" onClick={link.unlink} className="w-full">
              Play on this phone only
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/** The booth laptop once a phone has linked, until the visitor presses Start on it. */
export function LinkedSplash() {
  const welcome = useShared<WelcomeShare | null>("welcome", null);
  const vh = useViewportHeight();
  const width = Math.round(Math.max(220, Math.min(320, (vh - 200) / 2.092)));
  // From the visitor's phone: only a well-formed reading turns the twin.
  const pose =
    welcome && welcome.live === true && isEuler(welcome.euler)
      ? { euler: welcome.euler, yaw: Number.isFinite(welcome.yaw) ? welcome.yaw : 0 }
      : null;
  const live = pose != null;
  const screen = (
    <PhoneFrame width={width} interactive>
      <div className="grid size-full place-items-center bg-game-soft px-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="grid size-14 place-items-center rounded-full bg-game text-game-ink">
            <Smartphone aria-hidden className="size-7" />
          </span>
          <span className="type-title-3 text-fg">Linked to the booth screen</span>
          <span className="inline-flex items-center gap-2 rounded-full bg-game px-4 py-2 text-[0.875rem] font-semibold text-game-ink">
            Start <ArrowRight aria-hidden className="size-4" />
          </span>
        </div>
      </div>
    </PhoneFrame>
  );
  return (
    <section className="mx-auto grid w-full max-w-[75rem] flex-1 items-center gap-10 px-6 py-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-16 lg:px-8">
      {/* Room around the phone: it turns in 3D and needs space to do it. */}
      <div className="grid place-items-center px-12 py-8 lg:px-20">
        {pose ? (
          <Twin pose={pose} width={width}>
            {screen}
          </Twin>
        ) : (
          screen
        )}
      </div>
      <div className="flex max-w-[36rem] flex-col gap-6">
        <span className="type-label text-game">Phone linked</span>
        <h1 className="type-display-2 text-fg">{live ? "Tilt the phone" : "Press Start on the phone"}</h1>
        <p className="type-body-lg text-fg-muted">
          {live
            ? "The phone on this screen turns with it. Next come eight sensors, and what each one gives away."
            : "When the visitor presses Start, this screen follows them through eight sensors and what each one gives away."}
        </p>
        <Promises />
      </div>
    </section>
  );
}
