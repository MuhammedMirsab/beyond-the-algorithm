"use client";

import { useEffect, useRef, useState } from "react";
import { tracker } from "../engine/tracking/tracker";
import { cameraLine, lessonLine, type CoachInput, type CoachLine } from "../play/coach";
import { coachStart, stepCoach } from "../play/coach-timing";
import type { StudioSession } from "../play/session";

const SAMPLE_MS = 200;

/**
 * The coach line to show now. It samples the tracker and the session five
 * times a second (outside React's render), lets stepCoach decide when the
 * line changes (coach-timing.ts), and only sets state when it does.
 */
export function useCoach(session: StudioSession, opts: { touch: boolean; leftHanded: boolean }): CoachLine | null {
  const [line, setLine] = useState<CoachLine | null>(null);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    let timing = coachStart(session.getSnapshot().reveal);
    let lastSeen = performance.now();

    const tick = () => {
      const now = performance.now();
      const v = session.getSnapshot();
      const f = tracker.frame;
      const fresh = now - f.time < 400;
      const hands = fresh ? f.hands : [];
      if (hands.length) lastSeen = now;
      const active = v.view === "play" && !!v.instrument && !!v.mode && v.reach.status === "idle";
      let input: CoachInput | null = null;
      if (active && v.instrument && v.mode) {
        const m = tracker.metrics;
        const c = session.coachState(now);
        input = {
          mode: v.mode,
          live: v.live,
          instrument: v.instrument,
          leftHanded: optsRef.current.leftHanded,
          touch: optsRef.current.touch,
          left: !!(fresh && f.Left),
          right: !!(fresh && f.Right),
          size: hands.length ? hands.reduce((a, h) => a + h.size, 0) / hands.length : null,
          noHandsFor: hands.length ? 0 : now - lastSeen,
          brightness: m.brightness,
          detectRate: m.detectRate,
          fps: m.fps,
          events: c.events,
          sinceEvent: c.sinceEvent,
          sinceLive: c.sinceLive,
        };
      }
      const before = timing.shown;
      timing = stepCoach(timing, now, {
        reveal: v.reveal,
        active,
        camera: input ? cameraLine(input) : null,
        lesson: input ? lessonLine(input) : null,
      });
      if (timing.shown !== before) setLine(timing.shown);
    };
    const timer = window.setInterval(tick, SAMPLE_MS);
    return () => window.clearInterval(timer);
  }, [session]);

  return line;
}
