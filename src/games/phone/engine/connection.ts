import type { Guess } from "./math";

/**
 * What the Network Information API reports (Chrome and Android only). Every
 * field is optional because browsers share different amounts.
 */
export interface ConnectionInfo {
  /** "wifi", "cellular", "ethernet"... Android only. */
  type?: string;
  /** "slow-2g", "2g", "3g" or "4g": a speed class, not the real network. */
  effectiveType?: string;
  /** Megabits per second, rounded and capped by the browser. */
  downlink?: number;
  /** Round-trip time in ms, rounded by the browser. */
  rtt?: number;
  saveData?: boolean;
}

export function connectionLabel(type: string | undefined): string | null {
  switch (type) {
    case "wifi":
      return "Wi-Fi";
    case "cellular":
      return "Mobile data";
    case "ethernet":
      return "Cable";
    case "bluetooth":
      return "Bluetooth";
    case "none":
      return "None";
    default:
      return null;
  }
}

export function speedClass(effectiveType: string | undefined): string | null {
  switch (effectiveType) {
    case "4g":
      return "Fast";
    case "3g":
      return "Medium";
    case "2g":
    case "slow-2g":
      return "Slow";
    default:
      return null;
  }
}

export function connectionGuess(info: ConnectionInfo, online: boolean): Guess {
  if (!online) return { label: "Offline", because: "No connection at all: a lift, a tunnel or flight mode." };
  if (info.type === "wifi") {
    return { label: "Indoors somewhere with Wi-Fi", because: "Phones join Wi-Fi at home, at school or in shops." };
  }
  if (info.type === "cellular") {
    return { label: "Probably out", because: "On mobile data, so no Wi-Fi it knows is nearby." };
  }
  if (info.type === "ethernet") {
    return { label: "At a desk", because: "A cable connection means the device isn't moving." };
  }
  if (info.effectiveType === "4g" && (info.rtt ?? 999) <= 100) {
    return { label: "A good, steady connection", because: "Fast with little delay, typical of Wi-Fi or a strong signal." };
  }
  if (info.effectiveType) {
    return { label: "A slow connection", because: "Slow or laggy, typical of a weak signal or a busy network." };
  }
  return { label: "Online", because: "This browser doesn't say more than that." };
}
