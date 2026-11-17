"use client";

import { useEffect, useState } from "react";
import type { ConnectionInfo } from "../engine/connection";
import { networkInformation } from "./browser";

/**
 * navigator.connection (Chrome and Android) plus online/offline. The browser
 * rounds these numbers on purpose, so pages can't fingerprint the network.
 */
export function useConnection(enabled: boolean) {
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    const connection = networkInformation();
    const read = () => {
      setOnline(navigator.onLine);
      if (!connection) return;
      setInfo({
        type: connection.type,
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData,
      });
    };
    // First reading on the next frame, so the effect itself never sets state.
    const first = window.requestAnimationFrame(read);
    connection?.addEventListener("change", read);
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.cancelAnimationFrame(first);
      connection?.removeEventListener("change", read);
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, [enabled]);

  return { info: enabled ? info : null, online };
}
