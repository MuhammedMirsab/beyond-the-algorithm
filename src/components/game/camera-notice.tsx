"use client";

import { Camera, CameraOff, LoaderCircle, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Notice } from "./panels";

/** Every camera failure maps to one of these, so all games speak the same way. */
export type CameraIssue = "denied" | "missing" | "busy" | "insecure" | "unsupported" | "model" | "unknown";

export const CAMERA_ISSUE_COPY: Record<CameraIssue, { title: string; text: string }> = {
  denied: {
    title: "Camera is blocked",
    text: "This page isn't allowed to use the camera. Select the camera icon in the address bar, choose Allow, then try again.",
  },
  missing: {
    title: "No camera found",
    text: "Plug in a webcam or switch to a device that has one, then try again.",
  },
  busy: {
    title: "Camera is in use",
    text: "Another app or tab is using the camera. Close it, then try again.",
  },
  insecure: {
    title: "Camera needs a secure page",
    text: "Open this site with an https:// address to use the camera.",
  },
  unsupported: {
    title: "This browser can't use the camera",
    text: "Open the arcade in the latest Chrome, Edge or Safari.",
  },
  model: {
    title: "The tracking model didn't load",
    text: "Check the internet connection, then reload the page.",
  },
  unknown: {
    title: "The camera didn't start",
    text: "Try again. If it keeps happening, reload the page.",
  },
};

/** Maps a getUserMedia / startup error to a CameraIssue. */
export function cameraIssueFrom(error: unknown): CameraIssue {
  if (typeof window !== "undefined" && window.isSecureContext === false) return "insecure";
  if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia) return "unsupported";
  const name = error instanceof Error || (typeof error === "object" && error && "name" in error) ? String((error as { name: string }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "missing";
  if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") return "busy";
  return "unknown";
}

export const PRIVACY_LINE = "Video stays on this device. Nothing is recorded or uploaded.";

/** Before asking for the camera: say why, then ask. */
export function CameraPrompt({
  title = "Turn on your camera",
  text,
  onAllow,
  allowLabel = "Turn on camera",
  alternative,
  privacy = PRIVACY_LINE,
}: {
  title?: string;
  text: ReactNode;
  onAllow: () => void;
  allowLabel?: string;
  /** e.g. a "Play with keyboard" button. */
  alternative?: ReactNode;
  privacy?: ReactNode;
}) {
  return (
    <Notice
      icon={<Camera />}
      title={title}
      actions={
        <>
          <Button variant="game" size="lg" icon={<Camera />} onClick={onAllow}>
            {allowLabel}
          </Button>
          {alternative}
        </>
      }
    >
      <p>{text}</p>
      <p className="type-small mt-3 inline-flex items-center gap-1.5 text-fg-subtle">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        {privacy}
      </p>
    </Notice>
  );
}

/** While the browser permission prompt is open. */
export function CameraWaiting() {
  return (
    <Notice icon={<LoaderCircle className="animate-spin" />} title="Waiting for permission">
      <p>Choose Allow in the box your browser just opened.</p>
    </Notice>
  );
}

/** Model download / warm-up. `progress` is 0 to 1, or null when unknown. */
export function ModelLoading({ label = "Loading the AI model", detail, progress }: { label?: string; detail?: string; progress: number | null }) {
  return (
    <div role="status" className="mx-auto flex w-full max-w-[22rem] flex-col items-center gap-4 text-center">
      <span className="type-title-3 text-fg">{label}</span>
      {progress == null ? (
        <LoaderCircle className="size-6 animate-spin text-game" aria-hidden />
      ) : (
        <Progress value={progress} label={label} tone="game" />
      )}
      {detail ? <span className="type-label text-fg-subtle">{detail}</span> : null}
    </div>
  );
}

export function CameraProblem({
  issue,
  onRetry,
  alternative,
}: {
  issue: CameraIssue;
  onRetry?: () => void;
  alternative?: ReactNode;
}) {
  const copy = CAMERA_ISSUE_COPY[issue];
  return (
    <Notice
      icon={<CameraOff />}
      title={copy.title}
      actions={
        <>
          {onRetry ? (
            <Button variant="primary" size="lg" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
          {alternative}
        </>
      }
    >
      <p>{copy.text}</p>
    </Notice>
  );
}
