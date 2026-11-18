"use client";

import { motion } from "motion/react";
import { Check, Keyboard, ScanFace } from "lucide-react";
import { useRef, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { FaceControlSession } from "../play/session";
import { CameraSlot } from "./camera-slot";
import { useFaceCheck } from "./use-calibration";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/**
 * The outline, in a 400 x 300 box over the 4:3 camera crop: the size of a face
 * at arm's length from a laptop (about a third of the picture's width).
 */
const GUIDE = { cy: 142, rx: 66, ry: 88 };

/**
 * Where to put your head, drawn over the camera. Dashed until your face is
 * inside it; then a ring in the game colour fills as you hold still, and the
 * whole outline lights up when the check is done.
 */
function FaceGuide({ progress, ok, done }: { progress: number; ok: boolean; done: boolean }) {
  return (
    <svg viewBox="0 0 400 300" aria-hidden className="pointer-events-none absolute inset-0 size-full">
      <ellipse
        cx={200}
        cy={GUIDE.cy}
        rx={GUIDE.rx}
        ry={GUIDE.ry}
        fill="none"
        className={cn("stroke-white transition-[stroke-opacity] duration-200", ok || done ? "[stroke-opacity:0.3]" : "[stroke-opacity:0.75]")}
        strokeWidth={2.5}
        strokeDasharray={ok || done ? undefined : "7 7"}
      />
      {/* The same outline as a path that starts at the top and runs clockwise, so the ring fills from 12 o'clock. */}
      <path
        d={`M200 ${GUIDE.cy - GUIDE.ry}A${GUIDE.rx} ${GUIDE.ry} 0 1 1 200 ${GUIDE.cy + GUIDE.ry}A${GUIDE.rx} ${GUIDE.ry} 0 1 1 200 ${GUIDE.cy - GUIDE.ry}`}
        fill="none"
        pathLength={100}
        className="stroke-game"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray="100 100"
        style={{ strokeDashoffset: 100 - progress * 100, transition: "stroke-dashoffset 180ms linear", opacity: progress > 0 ? 1 : 0 }}
      />
      {done ? (
        <motion.ellipse
          cx={200}
          cy={GUIDE.cy}
          rx={GUIDE.rx}
          ry={GUIDE.ry}
          className="fill-game/20 stroke-game"
          strokeWidth={5}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, transition: { type: "spring", duration: 0.45, bounce: 0.3 } }}
        />
      ) : null}
    </svg>
  );
}

function Readout({ label, valueRef }: { label: string; valueRef: RefObject<HTMLElement | null> }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-sunken px-4 py-3">
      <dt className="type-label text-fg-subtle">{label}</dt>
      <dd ref={valueRef} className="type-title-3 truncate tabular-nums text-fg">
        None yet
      </dd>
    </div>
  );
}

/**
 * The face check: about a second, not a setup wall. The camera is big so you
 * see yourself and the points land on your face; the machine's three live
 * numbers sit beside it (points found, eye line, mouth), the same numbers the
 * game will steer with.
 */
export function CalibrationScreen({ session }: { session: FaceControlSession }) {
  const points = useRef<HTMLElement>(null);
  const eyeLine = useRef<HTMLElement>(null);
  const mouth = useRef<HTMLElement>(null);
  const { view, skip } = useFaceCheck(session, { points, eyeLine, mouth });

  return (
    <section
      aria-labelledby="check-title"
      className="mx-auto grid w-full max-w-[1200px] flex-1 items-center gap-6 px-4 pb-8 pt-2 sm:px-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-12 lg:px-8"
    >
      <CameraSlot
        session={session}
        className="aspect-[4/3] w-full rounded-xl shadow-ring lg:w-[min(100%,calc(133.33dvh-12rem))] lg:justify-self-center"
      >
        <FaceGuide progress={view.progress} ok={view.faceOk} done={view.done} />
      </CameraSlot>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-3">
          <span className="type-label text-game">Face check · about a second</span>
          <motion.h1
            key={view.done ? "done" : "look"}
            id="check-title"
            className="type-title-1 text-fg"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE_OUT } }}
          >
            {view.done ? "Got you" : "Look straight at the screen"}
          </motion.h1>
          <p className="type-body-lg max-w-[34rem] text-fg-muted">
            {view.done
              ? "Your face is the controller now. Next, a quick go with the ball."
              : "Keep your head in the outline and your mouth closed while the model finds your face."}
          </p>
        </div>

        <dl aria-label="What the model measures right now" className="grid grid-cols-3 gap-px overflow-hidden rounded-lg shadow-ring">
          <Readout label="Points" valueRef={points} />
          <Readout label="Eye line" valueRef={eyeLine} />
          <Readout label="Mouth" valueRef={mouth} />
        </dl>

        <p aria-live="polite" className="type-body flex min-h-[1.6em] items-start gap-2 font-semibold text-fg">
          {view.hint ? (
            <>
              {view.hint.ok ? (
                <Check className="mt-0.5 size-5 shrink-0 text-game" aria-hidden />
              ) : (
                <ScanFace className="mt-0.5 size-5 shrink-0 text-fg-subtle" aria-hidden />
              )}
              <span>{view.hint.text}</span>
            </>
          ) : null}
        </p>

        <div className="flex flex-wrap gap-3">
          {view.canSkip && !view.done ? (
            <Button variant="secondary" size="lg" onClick={skip}>
              Start anyway
            </Button>
          ) : null}
          <Button variant="ghost" size="lg" icon={<Keyboard />} onClick={() => session.act({ type: "choose-keyboard" })} disabled={view.done}>
            Use the keyboard instead
          </Button>
        </div>
      </div>
    </section>
  );
}
