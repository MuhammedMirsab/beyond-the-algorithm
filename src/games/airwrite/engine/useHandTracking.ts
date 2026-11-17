import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cameraIssueFrom, type CameraIssue } from "@/components/game/camera-notice";
import { AirPen, type PenFrame, type PenSettings } from "./airPen";
import { openCamera, stopStream } from "./camera";
import { cssColor } from "./canvasColor";
import { HAND_CONNECTIONS, acquireHandTracker, type Delegate, type HandTracker } from "./handTracker";
import type { Landmark } from "./gesture";
import type { StrokeStore } from "./strokes";

export type TrackingStatus =
  | { phase: "off" }
  /** The browser's camera permission prompt may be open. */
  | { phase: "waiting" }
  /** Camera is live; the hand model is still downloading or starting. */
  | { phase: "loading"; progress: number }
  | { phase: "ready" }
  | { phase: "error"; issue: CameraIssue };

export interface PenIndicator {
  handVisible: boolean;
  penDown: boolean;
  settling: boolean;
  /** Open palm (eraser mode). */
  palm: boolean;
  /** Palm is actively wiping. */
  erasing: boolean;
}

export interface TrackingStats {
  /** Frames the hand model actually processed in the last second. */
  fps: number;
  delegate: Delegate | null;
}

const NO_HAND: PenIndicator = { handVisible: false, penDown: false, settling: false, palm: false, erasing: false };
const NO_STATS: TrackingStats = { fps: 0, delegate: null };
const OFF: TrackingStatus = { phase: "off" };
const WAITING: TrackingStatus = { phase: "waiting" };

/** If requestVideoFrameCallback goes quiet this long, a rAF loop takes over. */
const STALL_MS = 400;

interface Session {
  /** Bumped on every start, retry and stop, so late async updates from an old session are ignored. */
  id: number;
  on: boolean;
  status: TrackingStatus;
}

interface Options {
  store: StrokeStore;
  settings: PenSettings;
  /** Whether the pen may draw. The cursor keeps tracking either way. */
  enabled: boolean;
  /** Start with the camera on. */
  initialOn: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  previewRef: RefObject<HTMLCanvasElement | null>;
  surfaceSize: RefObject<{ width: number; height: number }>;
}

/**
 * Camera → hand landmarks → AirPen → strokes, plus the camera preview overlay
 * (the 21-point skeleton and the writing zone). Tracking runs outside React;
 * only status and pen-state changes re-render.
 */
export function useHandTracking({ store, settings, enabled, initialOn, videoRef, previewRef, surfaceSize }: Options) {
  const [session, setSession] = useState<Session>(() => ({ id: 0, on: initialOn, status: initialOn ? WAITING : OFF }));
  const [indicator, setIndicator] = useState<{ id: number; value: PenIndicator }>({ id: -1, value: NO_HAND });
  const [pen] = useState(() => new AirPen(store, settings));
  const frameRef = useRef<PenFrame | null>(null);
  const statsRef = useRef<TrackingStats>(NO_STATS);

  useEffect(() => {
    pen.setSettings(settings);
  }, [pen, settings]);

  useEffect(() => {
    pen.setEnabled(enabled);
  }, [pen, enabled]);

  const { id: sessionId, on } = session;

  useEffect(() => {
    if (!on) return;
    const video = videoRef.current;
    if (!video) return;

    const id = sessionId;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let track: MediaStreamTrack | undefined;
    let rafId = 0;
    let vfcId = 0;
    const lease = acquireHandTracker();
    const accent = cssColor(video, "--game", "#5cb8f2");

    const setStatus = (status: TrackingStatus) => {
      if (!cancelled) setSession((s) => (s.id === id ? { ...s, status } : s));
    };
    const offProgress = lease.onProgress((progress) => {
      if (cancelled) return;
      setSession((s) => (s.id === id && s.status.phase === "loading" ? { ...s, status: { phase: "loading", progress } } : s));
    });
    // Unplugged, or taken by another app, mid-session.
    const onEnded = () => setStatus({ phase: "error", issue: "stopped" });

    const clearPreview = () => {
      const canvas = previewRef.current;
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    };

    const drawPreview = (lm: Landmark[] | null, frame: PenFrame) => {
      const canvas = previewRef.current;
      if (!canvas) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Writing zone: the part of the camera view that maps onto the writing area.
      const r = frame.region;
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(r.x * w + 0.5, r.y * h + 0.5, r.w * w, r.h * h);
      ctx.setLineDash([]);

      if (!lm) return;
      // The video is mirrored on screen, so mirror the points too.
      const px = (i: number) => (1 - lm[i].x) * w;
      const py = (i: number) => lm[i].y * h;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(px(a), py(a));
        ctx.lineTo(px(b), py(b));
      }
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      for (let i = 0; i < lm.length; i++) {
        ctx.beginPath();
        ctx.arc(px(i), py(i), 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (frame.palm) {
        // Eraser: outline the palm instead of marking the fingertip.
        const ids = [0, 1, 5, 9, 13, 17];
        let cx = 0;
        let cy = 0;
        for (const i of ids) {
          cx += px(i);
          cy += py(i);
        }
        ctx.strokeStyle = frame.eraser?.active ? accent : "rgba(255,255,255,0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx / ids.length, cy / ids.length, Math.hypot(px(0) - px(9), py(0) - py(9)) * 0.75, 0, Math.PI * 2);
        ctx.stroke();
        return;
      }
      // Pen tip (index) filled, thumb as a ring: the two points a pinch brings together.
      const tip = frame.penDown ? accent : "#ffffff";
      ctx.fillStyle = tip;
      ctx.beginPath();
      ctx.arc(px(8), py(8), 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = tip;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px(4), py(4), 4, 0, Math.PI * 2);
      ctx.stroke();
    };

    const run = async () => {
      try {
        stream = await openCamera();
      } catch (err) {
        setStatus({ phase: "error", issue: cameraIssueFrom(err) });
        return;
      }
      if (cancelled) {
        stopStream(stream);
        stream = null;
        return;
      }
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      try {
        await video.play();
      } catch {
        // Muted playback is always allowed; a spurious abort here is harmless.
      }
      if (cancelled) return;
      // If the camera is unplugged mid-session, say so instead of freezing.
      track = stream.getVideoTracks()[0];
      track?.addEventListener("ended", onEnded);

      setStatus({ phase: "loading", progress: lease.progress() });
      let tracker: HandTracker;
      try {
        tracker = await lease.promise;
      } catch (err) {
        console.error("[airwrite] hand tracking failed to start", err);
        setStatus({ phase: "error", issue: "model" });
        return;
      }
      if (cancelled) return;
      statsRef.current = { fps: 0, delegate: tracker.delegate };
      setStatus({ phase: "ready" });

      let frames = 0;
      let fpsSince = performance.now();
      let lastVideoTime = -1;
      let lastVfcAt = performance.now();
      let shown = NO_HAND;

      const process = () => {
        if (cancelled || video.readyState < 2 || video.currentTime === lastVideoTime) return;
        lastVideoTime = video.currentTime;
        const now = performance.now();
        let lm: Landmark[] | null = null;
        try {
          lm = tracker.detect(video, now);
        } catch (err) {
          console.warn("[airwrite] hand detection failed", err);
        }
        const size = surfaceSize.current;
        pen.setAspects(video.videoWidth / video.videoHeight, size.width / size.height);
        const frame = pen.update(lm, now);
        frameRef.current = frame;
        drawPreview(lm, frame);

        const next: PenIndicator = {
          handVisible: frame.handVisible,
          penDown: frame.penDown,
          settling: frame.settling,
          palm: frame.palm,
          erasing: !!frame.eraser?.active,
        };
        if ((Object.keys(next) as (keyof PenIndicator)[]).some((k) => shown[k] !== next[k])) {
          shown = next;
          setIndicator({ id, value: next });
        }

        frames++;
        if (now - fpsSince >= 1000) {
          statsRef.current = { fps: Math.round((frames * 1000) / (now - fpsSince)), delegate: tracker.delegate };
          frames = 0;
          fpsSince = now;
        }
      };

      // requestVideoFrameCallback runs once per camera frame. A rAF loop stands by
      // in case it stops firing (or doesn't exist), so tracking never freezes.
      const hasVfc = typeof video.requestVideoFrameCallback === "function";
      const onVideoFrame = () => {
        if (cancelled) return;
        lastVfcAt = performance.now();
        process();
        vfcId = video.requestVideoFrameCallback(onVideoFrame);
      };
      const onAnimationFrame = () => {
        if (cancelled) return;
        if (!hasVfc || performance.now() - lastVfcAt > STALL_MS) process();
        rafId = requestAnimationFrame(onAnimationFrame);
      };
      if (hasVfc) vfcId = video.requestVideoFrameCallback(onVideoFrame);
      rafId = requestAnimationFrame(onAnimationFrame);
    };

    void run();

    return () => {
      cancelled = true;
      offProgress();
      cancelAnimationFrame(rafId);
      if (vfcId && typeof video.cancelVideoFrameCallback === "function") video.cancelVideoFrameCallback(vfcId);
      track?.removeEventListener("ended", onEnded);
      lease.release();
      pen.reset(); // ends any open stroke
      frameRef.current = null;
      statsRef.current = NO_STATS;
      stopStream(stream);
      video.srcObject = null;
      clearPreview();
    };
  }, [on, sessionId, pen, videoRef, previewRef, surfaceSize]);

  /** Turn the camera on, or try again after a problem. */
  const start = useCallback(() => setSession((s) => ({ id: s.id + 1, on: true, status: WAITING })), []);
  /** Turn the camera off (mouse or touch only). */
  const stop = useCallback(() => setSession((s) => ({ id: s.id + 1, on: false, status: OFF })), []);
  /** Current fingertip in mirrored camera coordinates, for centring the writing zone. */
  const fingertip = useCallback(() => pen.rawFingertip(), [pen]);

  const live = session.on && session.status.phase === "ready";
  return {
    on: session.on,
    status: session.status,
    /** Changes only when the pen state changes. */
    indicator: live && indicator.id === session.id ? indicator.value : NO_HAND,
    /** Read in callbacks (it updates every second without re-rendering). */
    statsRef,
    frameRef,
    start,
    stop,
    fingertip,
  };
}
