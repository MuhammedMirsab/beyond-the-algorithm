/**
 * Typed access to sensor APIs that TypeScript's DOM library doesn't describe
 * (they're Safari-only or Chromium-only). Local types and narrow casts, no
 * global augmentation, so nothing leaks into other games. Only call these in
 * the browser (inside handlers and effects).
 */

export type PermissionAnswer = "granted" | "denied" | "default";
type RequestPermission = () => Promise<PermissionAnswer>;

/** iOS 13+: DeviceOrientationEvent.requestPermission(), which must run inside a tap. */
export function permissionRequester(api: "DeviceOrientationEvent" | "DeviceMotionEvent"): RequestPermission | null {
  const ctor: unknown = (window as unknown as Record<string, unknown>)[api];
  if (typeof ctor !== "function") return null;
  const request: unknown = (ctor as { requestPermission?: unknown }).requestPermission;
  if (typeof request !== "function") return null;
  return () => (request as (this: unknown) => Promise<PermissionAnswer>).call(ctor);
}

/** The Battery Status API (Chrome, Edge, Samsung Internet; not Safari or Firefox). */
export interface BatteryManagerLike extends EventTarget {
  readonly level: number;
  readonly charging: boolean;
  readonly chargingTime: number;
  readonly dischargingTime: number;
}

export function batteryGetter(): (() => Promise<BatteryManagerLike>) | null {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
  return typeof nav.getBattery === "function" ? () => (nav.getBattery as () => Promise<BatteryManagerLike>).call(navigator) : null;
}

/** The Network Information API (Chrome and Android; not Safari or Firefox). */
export interface NetworkInformationLike extends EventTarget {
  readonly type?: string;
  readonly effectiveType?: string;
  readonly downlink?: number;
  readonly rtt?: number;
  readonly saveData?: boolean;
}

export function networkInformation(): NetworkInformationLike | null {
  const nav = navigator as Navigator & { connection?: NetworkInformationLike };
  return nav.connection ?? null;
}

export function hasMediaDevices(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}
