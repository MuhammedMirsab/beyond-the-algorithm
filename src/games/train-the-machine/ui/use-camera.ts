"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cameraIssueFrom, type CameraIssue } from "@/components/game/camera-notice";

/**
 * The front camera as a MediaStream. From the original's startCamera and
 * stopCameraStream: a secure-context check, three levels of constraints
 * (exact size, any front camera, any camera) and full cleanup. A request
 * that finishes after stop() or unmount is stopped at once.
 */

export type CameraStatus = "idle" | "requesting" | "live" | "error";

export interface CameraState {
  status: CameraStatus;
  stream: MediaStream | null;
  issue: CameraIssue | null;
}

const ATTEMPTS: MediaStreamConstraints[] = [
  { video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }, audio: false },
  { video: { facingMode: "user" }, audio: false },
  { video: true, audio: false },
];

/** Errors where a simpler request might still work. Never retry a "no": it would ask again. */
const RETRY = new Set(["OverconstrainedError", "ConstraintNotSatisfiedError", "NotReadableError", "TypeError"]);

function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
}

async function openStream(): Promise<MediaStream> {
  let lastError: unknown = new Error("No camera request was made");
  for (const constraints of ATTEMPTS) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
      if (!RETRY.has(errorName(error))) break;
    }
  }
  throw lastError;
}

function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.onended = null;
    track.stop();
  }
}

const IDLE: CameraState = { status: "idle", stream: null, issue: null };

export function useCamera() {
  const [state, setState] = useState<CameraState>(IDLE);
  const streamRef = useRef<MediaStream | null>(null);
  /** Bumped by every start and stop, so a late answer from the browser is thrown away. */
  const requestRef = useRef(0);
  /** A request is waiting on the browser: a second start would only ask twice. */
  const pendingRef = useRef(false);

  const release = useCallback(() => {
    requestRef.current += 1;
    pendingRef.current = false;
    stopStream(streamRef.current);
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    release();
    setState(IDLE);
  }, [release]);

  const start = useCallback(async () => {
    if (streamRef.current || pendingRef.current) return;
    const request = ++requestRef.current;
    if (window.isSecureContext === false) {
      setState({ status: "error", stream: null, issue: "insecure" });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ status: "error", stream: null, issue: "unsupported" });
      return;
    }
    setState({ status: "requesting", stream: null, issue: null });
    pendingRef.current = true;
    try {
      const stream = await openStream();
      if (request !== requestRef.current) {
        stopStream(stream);
        return;
      }
      pendingRef.current = false;
      streamRef.current = stream;
      for (const track of stream.getVideoTracks()) {
        // Unplugged or taken by another app mid-game.
        track.onended = () => {
          if (streamRef.current !== stream) return;
          release();
          setState({ status: "error", stream: null, issue: "unknown" });
        };
      }
      setState({ status: "live", stream, issue: null });
    } catch (error) {
      if (request !== requestRef.current) return;
      pendingRef.current = false;
      setState({ status: "error", stream: null, issue: cameraIssueFrom(error) });
    }
  }, [release]);

  useEffect(() => release, [release]);

  return { ...state, start, stop };
}
