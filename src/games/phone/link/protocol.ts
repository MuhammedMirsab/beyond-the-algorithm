/**
 * What travels between the booth laptop and a visitor's phone, and the
 * timings both sides agree on. Pure: no DOM, no PeerJS, so the state
 * machines that use it can be tested on their own.
 *
 * The phone only ever sends readings (tilt, taps, loudness, a coarse
 * brightness grid). Camera pictures, sound and coordinates never leave it.
 */

export const PROTOCOL_VERSION = 2;

/** Every laptop code starts with this, so a stray PeerJS id is never mistaken for one. */
export const CODE_PREFIX = "edex-phone-";

/** Why a session ended. Sent with `end` so the other side can say so in plain words. */
export type EndReason =
  /** Next player on the laptop. */
  | "reset"
  /** Next player on the phone. */
  | "next-player"
  /** Unlink on the phone. */
  | "unlinked"
  /** Linked, but nothing changed for a few minutes. */
  | "idle"
  /** The phone was away longer than the laptop waits. */
  | "timeout"
  /** Another phone took over the booth screen while this one was away. */
  | "replaced";

/** Why the phone stepped away: its screen locked or it switched apps, or the visitor left the game. */
export type AwayWhy = "hidden" | "left";

export type Message =
  /** Phone to laptop, first thing on every connection. The token says which phone this is. */
  | { t: "hello"; token: string; v: number }
  /** Laptop to phone: accepted. `resume` when it already knew this phone; `nav` is where it was. */
  | { t: "welcome"; resume: boolean; nav: unknown }
  /** Laptop to phone: another phone is linked. */
  | { t: "busy" }
  /** Phone to laptop: the latest readings, by key. */
  | { t: "state"; v: Record<string, unknown> }
  | { t: "away"; why: AwayWhy }
  | { t: "back" }
  | { t: "ping" }
  | { t: "end"; reason: EndReason };

const END_REASONS: readonly EndReason[] = ["reset", "next-player", "unlinked", "idle", "timeout", "replaced"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Checks a message from the other device field by field. Anything unexpected is dropped. */
export function parseMessage(data: unknown): Message | null {
  if (!isRecord(data) || typeof data.t !== "string") return null;
  switch (data.t) {
    case "hello":
      return typeof data.token === "string" && isToken(data.token) ? { t: "hello", token: data.token, v: Number(data.v) || 0 } : null;
    case "welcome":
      return { t: "welcome", resume: data.resume === true, nav: data.nav ?? null };
    case "busy":
    case "back":
    case "ping":
      return { t: data.t };
    case "state":
      return isRecord(data.v) ? { t: "state", v: data.v } : null;
    case "away":
      return { t: "away", why: data.why === "left" ? "left" : "hidden" };
    case "end":
      return { t: "end", reason: END_REASONS.includes(data.reason as EndReason) ? (data.reason as EndReason) : "reset" };
    default:
      return null;
  }
}

/** All timings in one place, in milliseconds. */
export const TIMING = {
  /** Both sides send something at least this often while linked. */
  heartbeat: 2000,
  /** Nothing heard for this long and the other side counts as gone for now. */
  lost: 8000,
  /** How long the laptop keeps a session for a phone that stepped away. */
  grace: 90_000,
  /** Linked, but no new readings for this long: the visitor has walked off. */
  idle: 180_000,
  /** The first link attempt gives up after this long. */
  connect: 12_000,
  /** After this long the phone says linking is slow. */
  slowConnect: 5000,
  /** One reconnect attempt. */
  attempt: 8000,
  /** The laptop drops a connection that never says hello. */
  hello: 5000,
  /** The laptop asks the matchmaking server again after this long. */
  serverRetry: 10_000,
  /** Readings go out at most this often (25 a second). */
  flush: 40,
} as const;

/* ── Codes and tokens ─────────────────────────────────────────────── */

type RandomBytes = (length: number) => Uint8Array;

const defaultRandom: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** The laptop's code: 48 random bits, unguessable for the few minutes it is on screen. */
export function newCode(random: RandomBytes = defaultRandom): string {
  return CODE_PREFIX + hex(random(6));
}

/** The phone's token: 64 random bits that say "the same phone as before" when it reconnects. */
export function newToken(random: RandomBytes = defaultRandom): string {
  return hex(random(8));
}

const CODE_RE = /^[A-Za-z0-9_-]{6,64}$/;
const TOKEN_RE = /^[a-f0-9]{8,32}$/;

export function isCode(value: string): boolean {
  return CODE_RE.test(value);
}

export function isToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

export interface LinkTarget {
  code: string;
  /** Present once this phone has started linking: a reload or a return then rejoins as the same phone. */
  token: string | null;
}

/** Reads `#link=CODE` (a fresh scan) or `#link=CODE.TOKEN` (this phone, back after a reload). */
export function parseLinkHash(hash: string): LinkTarget | null {
  const match = /[#&]link=([A-Za-z0-9_-]{6,64})(?:\.([a-f0-9]{8,32}))?(?:&|$)/.exec(hash);
  if (!match) return null;
  return { code: match[1], token: match[2] ?? null };
}

export function linkHash(code: string, token: string): string {
  return `#link=${code}.${token}`;
}

/** What the QR code carries. */
export function linkPath(code: string): string {
  return `/phone#link=${code}`;
}
