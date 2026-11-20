import { readJSON, storageKey, writeJSON } from "@/lib/storage";

/**
 * Browser only. What a device looks like to the analytics: a random id kept
 * in localStorage (shared by the feedback form and the game tracker, so a
 * phone that plays and then answers shows up as one device), a hash of
 * stable traits (finds the same device again after storage was cleared or
 * in a private window) and a readable description.
 *
 * A booth laptop is one device for hundreds of visitors, so a device is never
 * treated as a person: people are sessions (see src/content/plays.ts).
 */

/** Kept under the feedback key so devices tracked since 19 Nov keep their id. */
const DEVICE_KEY = storageKey("feedback", "visitor");

export function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

/** The id this browser keeps in localStorage. Private windows get a new one each time. */
export function deviceId(): { id: string; returning: boolean } {
  const saved = readJSON<string | null>(DEVICE_KEY, null);
  if (typeof saved === "string" && /^[a-z0-9]{8,32}$/.test(saved)) return { id: saved, returning: true };
  const id = randomId();
  writeJSON(DEVICE_KEY, id);
  return { id, returning: false };
}

/** FNV-1a, for when crypto.subtle isn't there (plain http). */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

async function hash(text: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return fnv(text) + fnv(text.split("").reverse().join(""));
  }
}

function deviceTraits(): string {
  const n = navigator as Navigator & { deviceMemory?: number };
  return [
    navigator.userAgent,
    navigator.language,
    (navigator.languages ?? []).join(","),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${screen.width}x${screen.height}x${screen.colorDepth}@${window.devicePixelRatio}`,
    navigator.hardwareConcurrency ?? "",
    n.deviceMemory ?? "",
    navigator.maxTouchPoints ?? 0,
  ].join("|");
}

/**
 * A hash of traits that stay the same in one browser on one device. Many
 * phones of the same model share it, so it groups, never names. The formula
 * matches the one the feedback form used since 19 Nov.
 */
export function fingerprint(): Promise<string> {
  return hash(deviceTraits());
}

/** The graphics chip's name, which tells two laptops of the same model apart more often than not. */
export function gpuName(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
    if (!gl || !(gl instanceof WebGLRenderingContext)) return "";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return typeof name === "string" ? name.slice(0, 80) : "";
  } catch {
    return "";
  }
}

export interface DeviceBasics {
  kind: "phone" | "tablet" | "desktop";
  os: string;
  browser: string;
  lang: string;
}

export function describeDevice(): DeviceBasics {
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints > 1;
  // iPadOS reports itself as a Mac; touch gives it away.
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch);
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPod/.test(ua)
      ? "iOS"
      : ipad
        ? "iPadOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X/.test(ua)
            ? "macOS"
            : /CrOS/.test(ua)
              ? "ChromeOS"
              : /Linux/.test(ua)
                ? "Linux"
                : "Other";
  const browser = /SamsungBrowser/.test(ua)
    ? "Samsung"
    : /EdgA?\//.test(ua)
      ? "Edge"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /Firefox|FxiOS/.test(ua)
          ? "Firefox"
          : /CriOS|Chrome/.test(ua)
            ? "Chrome"
            : /Safari/.test(ua)
              ? "Safari"
              : "Other";
  const kind = ipad || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "tablet" : /Mobi|iPhone|Android/.test(ua) ? "phone" : "desktop";
  return { kind, os, browser, lang: navigator.language?.slice(0, 16) ?? "" };
}

/** Everything the game tracker sends about the device, once per session. */
export async function deviceProfile() {
  const { id, returning } = deviceId();
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string } };
  return {
    id,
    returning,
    fp: await fingerprint(),
    ...describeDevice(),
    screen: `${screen.width}x${screen.height}@${Math.round(window.devicePixelRatio * 100) / 100}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    cores: navigator.hardwareConcurrency ?? 0,
    memory: n.deviceMemory ?? 0,
    touch: navigator.maxTouchPoints ?? 0,
    gpu: gpuName(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    net: n.connection?.effectiveType ?? "",
  };
}
