"use client";

import { useEffect, useState } from "react";
import { batteryGetter, type BatteryManagerLike } from "./browser";

export interface BatteryReading {
  /** 0 to 100. */
  level: number;
  charging: boolean;
  /** Seconds, or Infinity when unknown. */
  chargingTime: number;
  dischargingTime: number;
}

const EVENTS = ["levelchange", "chargingchange", "chargingtimechange", "dischargingtimechange"] as const;

/**
 * navigator.getBattery() where the browser has it (Chrome, Edge, Android).
 * No permission needed, so it reads as soon as `enabled` is true, and its
 * listeners go when it isn't.
 */
export function useBattery(enabled: boolean) {
  const [reading, setReading] = useState<BatteryReading | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const getBattery = batteryGetter();
    if (!getBattery) return;
    let manager: BatteryManagerLike | null = null;
    let cancelled = false;
    const read = () => {
      if (!manager || cancelled) return;
      setReading({
        level: Math.round(manager.level * 100),
        charging: manager.charging,
        chargingTime: manager.chargingTime,
        dischargingTime: manager.dischargingTime,
      });
    };
    getBattery()
      .then((m) => {
        if (cancelled) return;
        manager = m;
        read();
        for (const name of EVENTS) m.addEventListener(name, read);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (manager) for (const name of EVENTS) manager.removeEventListener(name, read);
    };
  }, [enabled]);

  return { reading: enabled ? reading : null, failed };
}
