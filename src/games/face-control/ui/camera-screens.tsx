"use client";

import { CameraOff, Keyboard } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CameraProblem, CameraWaiting, ModelLoading } from "@/components/game/camera-notice";
import { Notice } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { formatMB } from "../engine/format";
import type { Issue } from "../play/machine";
import type { FaceControlSession, ModelState } from "../play/session";
import { CameraSlot } from "./camera-slot";

/** Centred status screens between the intro and calibration. */
function Centered({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col items-center justify-center gap-8 px-4 py-10 sm:px-6 lg:px-8">{children}</div>;
}

/** Shows children only after `ms`, so an already-granted camera doesn't flash a prompt. */
function useDelayed(ms: number) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), ms);
    return () => window.clearTimeout(timer);
  }, [ms]);
  return shown;
}

function KeyboardButton({ session }: { session: FaceControlSession }) {
  return (
    <Button variant="ghost" size="lg" icon={<Keyboard />} onClick={() => session.act({ type: "choose-keyboard" })}>
      Play with keyboard
    </Button>
  );
}

export function PermissionScreen({ session }: { session: FaceControlSession }) {
  const shown = useDelayed(400);
  return (
    <Centered>
      {shown ? (
        <div className="flex flex-col items-center gap-6">
          <CameraWaiting />
          <Button variant="ghost" size="lg" onClick={() => session.act({ type: "cancel-permission" })}>
            Cancel
          </Button>
        </div>
      ) : null}
    </Centered>
  );
}

export function LoadingScreen({ session, model }: { session: FaceControlSession; model: ModelState }) {
  // Download is most of the wait; starting the model (and timing GPU against CPU) is the rest.
  const progress = model.stage === "initialise" ? 0.97 : model.fraction * 0.95;
  const detail =
    model.stage === "initialise"
      ? "Choosing GPU or CPU for this laptop"
      : model.total > 0
        ? `${formatMB(model.loaded)} of ${formatMB(model.total)}`
        : undefined;
  return (
    <Centered>
      <CameraSlot session={session} density="outline" className="aspect-[4/3] w-full max-w-[22rem] rounded-lg" />
      <ModelLoading label="Loading the face model" detail={detail} progress={progress} />
      <KeyboardButton session={session} />
    </Centered>
  );
}

/** Two problems only happen once tracking runs; the shared copy covers the rest. */
const LOCAL_ISSUES: Record<"ended" | "tracking", { title: string; text: string }> = {
  ended: {
    title: "The camera stopped",
    text: "It was unplugged or switched off. Plug it back in, then try again.",
  },
  tracking: {
    title: "Face tracking stopped",
    text: "Try again. If it keeps happening, reload the page.",
  },
};

export function ErrorScreen({ session, issue }: { session: FaceControlSession; issue: Issue }) {
  const retry = () => session.act({ type: "choose-camera" });
  return (
    <Centered>
      {issue === "ended" || issue === "tracking" ? (
        <Notice
          icon={<CameraOff />}
          title={LOCAL_ISSUES[issue].title}
          actions={
            <>
              <Button variant="primary" size="lg" onClick={retry}>
                Try again
              </Button>
              <KeyboardButton session={session} />
            </>
          }
        >
          <p>{LOCAL_ISSUES[issue].text}</p>
        </Notice>
      ) : (
        <CameraProblem issue={issue} onRetry={retry} alternative={<KeyboardButton session={session} />} />
      )}
    </Centered>
  );
}
