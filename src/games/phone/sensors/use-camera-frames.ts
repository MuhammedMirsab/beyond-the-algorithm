"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cellGrid, frameStatsFromLuma, lumaFromRGBA, type FrameStats } from "../engine/frame-stats";
import { hasMediaDevices, stopStream } from "./browser";
import { statusFromMediaError, type SensorStatus } from "./status";

/** Frames are measured at this size: plenty for brightness and edges, cheap on a phone. */
const LONG_SIDE = 160;
/** One cell of the phone's-eye view covers this many measured pixels. */
const CELL = 5;
const MEASURE_EVERY_MS = 125;

export interface CellView {
  cells: Float32Array;
  cols: number;
  rows: number;
}

/**
 * The front camera, measured 8 times a second: mean brightness, edge
 * sharpness, and a coarse grid of brightness values. Frames are drawn to a
 * small canvas, measured and dropped. Nothing is recorded or uploaded.
 * The tracks stop on `stop`, when the page is hidden and on unmount.
 */
export function useCameraFrames() {
  const [status, setStatus] = useState<SensorStatus>("idle");
  const [stats, setStats] = useState<FrameStats | null>(null);
  const [view, setView] = useState<CellView | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const timer = useRef(0);
  const onVisibility = useRef<(() => void) | null>(null);
  const generation = useRef(0);

  const attachVideo = useCallback((el: HTMLVideoElement, media: MediaStream) => {
    if (el.srcObject !== media) el.srcObject = media;
    el.muted = true;
    el.playsInline = true;
    void el.play().catch(() => {});
  }, []);

  /** Callback ref for the preview <video>; survives the layout swapping it out. */
  const attachVideoElement = useCallback(
    (el: HTMLVideoElement | null) => {
      video.current = el;
      if (el && stream.current) attachVideo(el, stream.current);
    },
    [attachVideo],
  );

  const release = useCallback(() => {
    generation.current += 1;
    window.clearInterval(timer.current);
    timer.current = 0;
    if (onVisibility.current) document.removeEventListener("visibilitychange", onVisibility.current);
    onVisibility.current = null;
    stopStream(stream.current);
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const halt = useCallback(
    (next: SensorStatus) => {
      release();
      setStatus(next);
      setStats(null);
      setView(null);
    },
    [release],
  );

  const start = useCallback(() => {
    release();
    const gen = generation.current;
    if (!window.isSecureContext) {
      setStatus("insecure");
      return;
    }
    if (!hasMediaDevices()) {
      setStatus("unavailable");
      return;
    }
    setStatus("starting");
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then((media) => {
        if (generation.current !== gen) {
          stopStream(media);
          return;
        }
        stream.current = media;
        if (video.current) attachVideo(video.current, media);
        const hide = () => {
          if (document.hidden) halt("idle");
        };
        onVisibility.current = hide;
        document.addEventListener("visibilitychange", hide);
        setStatus("live");

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        timer.current = window.setInterval(() => {
          const el = video.current;
          if (!el || el.readyState < 2 || !el.videoWidth || generation.current !== gen) return;
          const scale = LONG_SIDE / Math.max(el.videoWidth, el.videoHeight);
          const w = Math.max(CELL, Math.round(el.videoWidth * scale));
          const h = Math.max(CELL, Math.round(el.videoHeight * scale));
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
          // Mirrored like the preview, so the grid matches what people see.
          ctx.setTransform(-1, 0, 0, 1, w, 0);
          ctx.drawImage(el, 0, 0, w, h);
          const luma = lumaFromRGBA(ctx.getImageData(0, 0, w, h).data, w, h);
          const cols = Math.round(w / CELL);
          const rows = Math.round(h / CELL);
          setStats(frameStatsFromLuma(luma, w, h));
          setView({ cells: cellGrid(luma, w, h, cols, rows), cols, rows });
        }, MEASURE_EVERY_MS);
      })
      .catch((error: unknown) => {
        if (generation.current !== gen) return;
        halt(statusFromMediaError(error));
      });
  }, [attachVideo, halt, release]);

  const stop = useCallback(() => halt("idle"), [halt]);

  useEffect(() => release, [release]);

  return { status, stats, view, attachVideoElement, start, stop };
}
