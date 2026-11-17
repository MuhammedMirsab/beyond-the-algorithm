"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cameraIssueFrom, type CameraIssue } from "@/components/game/camera-notice";

export type CameraState =
  | { status: "off" }
  | { status: "waiting" }
  | { status: "live"; mirrored: boolean }
  | { status: "error"; issue: CameraIssue };

/**
 * One camera stream, owned by the component that uses it. Phones ask for the
 * back camera (point it at a pen), laptops for the webcam. The user-facing
 * view is mirrored like a mirror; photos are taken exactly as shown.
 * Tracks stop on stop(), on unmount, and when a newer start() wins.
 */
export function useCamera() {
  const [camera, setCamera] = useState<CameraState>({ status: "off" });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef(0);

  const release = useCallback(() => {
    requestRef.current++;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stop = useCallback(() => {
    release();
    setCamera({ status: "off" });
  }, [release]);

  const start = useCallback(async () => {
    release();
    const request = requestRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera({ status: "error", issue: cameraIssueFrom(null) });
      return;
    }
    setCamera({ status: "waiting" });
    const phone = window.matchMedia("(pointer: coarse)").matches;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: phone ? "environment" : "user" },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      if (request !== requestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const facing = stream.getVideoTracks()[0]?.getSettings().facingMode;
      setCamera({ status: "live", mirrored: facing ? facing === "user" : !phone });
    } catch (error) {
      if (request !== requestRef.current) return;
      setCamera({ status: "error", issue: cameraIssueFrom(error) });
    }
  }, [release]);

  // Attach the stream once the <video> element is on screen.
  useEffect(() => {
    if (camera.status !== "live") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => {
      // Autoplay of a muted inline video is allowed; ignore aborted plays.
    });
  }, [camera]);

  useEffect(() => release, [release]);

  /** The current frame as a canvas, mirrored if the preview is. Null until frames arrive. */
  const capture = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (camera.status === "live" && camera.mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }, [camera]);

  return { camera, videoRef, start, stop, capture };
}
