"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { levelPercent, rmsFromBytes } from "../engine/audio-level";
import { pushLimited } from "../engine/math";
import { audioContextCtor } from "../engine/sound";
import { hasMediaDevices, stopStream } from "./browser";
import { statusFromMediaError, type SensorStatus } from "./status";

/** About 3 seconds of levels at 12 a second, for the room guess. */
export const LEVEL_HISTORY = 36;
const LEVEL_EVERY_MS = 83;

interface MicResources {
  ctx: AudioContext;
  stream: MediaStream | null;
  source: MediaStreamAudioSourceNode | null;
  frame: number;
  onVisibility: () => void;
}

/**
 * Live microphone level. An AnalyserNode reads the wave (getByteTimeDomainData,
 * as in the original exhibit); the level goes to React 12 times a second and
 * the analyser is shared through a ref so the waveform can draw every frame.
 * Nothing is recorded. The tracks stop on `stop`, when the page is hidden and
 * on unmount (the original never stopped them).
 */
export function useMicLevel() {
  const [status, setStatus] = useState<SensorStatus>("idle");
  const [level, setLevel] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const resources = useRef<MicResources | null>(null);
  const generation = useRef(0);

  const release = useCallback(() => {
    generation.current += 1;
    analyser.current = null;
    const r = resources.current;
    resources.current = null;
    if (!r) return;
    window.cancelAnimationFrame(r.frame);
    document.removeEventListener("visibilitychange", r.onVisibility);
    stopStream(r.stream);
    try {
      r.source?.disconnect();
    } catch {
      // Already disconnected.
    }
    void r.ctx.close().catch(() => {});
  }, []);

  const halt = useCallback(
    (next: SensorStatus) => {
      release();
      setStatus(next);
      setLevel(0);
      setHistory([]);
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
    const Ctor = audioContextCtor();
    if (!Ctor || !hasMediaDevices()) {
      setStatus("unavailable");
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      setStatus("error");
      return;
    }
    // Created and resumed inside the tap: iPhone keeps it suspended otherwise.
    void ctx.resume().catch(() => {});
    const onVisibility = () => {
      if (document.hidden) halt("idle");
    };
    resources.current = { ctx, stream: null, source: null, frame: 0, onVisibility };
    setStatus("starting");

    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then((stream) => {
        const r = resources.current;
        if (generation.current !== gen || !r) {
          stopStream(stream);
          return;
        }
        const source = ctx.createMediaStreamSource(stream);
        const node = ctx.createAnalyser();
        node.fftSize = 2048;
        node.smoothingTimeConstant = 0;
        source.connect(node);
        r.stream = stream;
        r.source = source;
        analyser.current = node;
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        document.addEventListener("visibilitychange", onVisibility);
        setSampleRate(ctx.sampleRate);
        setStatus("live");

        const samples = new Uint8Array(node.fftSize);
        let lastAt = 0;
        let recent: number[] = [];
        const tick = (now: number) => {
          const current = resources.current;
          if (!current || generation.current !== gen) return;
          if (now - lastAt >= LEVEL_EVERY_MS) {
            lastAt = now;
            node.getByteTimeDomainData(samples);
            const value = levelPercent(rmsFromBytes(samples));
            recent = pushLimited(recent, value, LEVEL_HISTORY);
            setLevel(value);
            setHistory(recent);
          }
          current.frame = window.requestAnimationFrame(tick);
        };
        r.frame = window.requestAnimationFrame(tick);
      })
      .catch((error: unknown) => {
        if (generation.current !== gen) return;
        halt(statusFromMediaError(error));
      });
  }, [halt, release]);

  const stop = useCallback(() => halt("idle"), [halt]);

  useEffect(() => release, [release]);

  return { status, level, history, sampleRate, analyser, start, stop };
}
