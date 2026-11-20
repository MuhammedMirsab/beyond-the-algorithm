"use client";

import {
  hourBucket,
  PLAY_MAX_EVENTS_PER_POST,
  PLAY_MAX_EVENTS_PER_SESSION,
  type CloseReason,
  type PlayDevice,
  type PlayEvent,
  type PlayEventKind,
  type PlayPayload,
  type PlaySummary,
} from "@/content/plays";
import { deviceId, deviceProfile, randomId } from "@/lib/device";

/**
 * Browser side of the game analytics (see src/content/plays.ts). One module
 * for the whole page: GameShell opens a session for its game, games report
 * what happens with `track`, and "Next player" closes the session and opens
 * a fresh one for the next visitor. Fire-and-forget: if tracking fails, no
 * game ever notices.
 *
 *   track.start("camera")                  a round or run began
 *   track.step("round", 3)                 anything worth seeing in between
 *   track.end({ score: 5, outOf: 6, won: true, label: "spotted 5 of 6" })
 *   track.nextPlayer()                     the next visitor takes over
 */

const ENDPOINT = "/api/play";
/** Calm batching: one write per 20 s at most while nothing important happens. */
const FLUSH_MS = 20_000;
/** A fresh page waits a moment so a quick bounce still costs only one write. */
const FIRST_FLUSH_MS = 6_000;
const MAX_POSTS_PER_SESSION = 80;
/** Hidden this long, then back: treat it as somebody new. */
const AWAY_MS = 15 * 60_000;
/** No input for this long before "Next player" fired: it was the idle reset. */
const IDLE_GUESS_MS = 60_000;
const MAX_ERRORS = 5;

type Value = string | number;

interface Session {
  id: string;
  bucket: string;
  t0: number;
  sum: PlaySummary;
  queue: PlayEvent[];
  queued: number;
  posts: number;
  deviceSent: boolean;
  visibleSince: number | null;
  lastInputAt: number | null;
  closed: boolean;
}

let device: PlayDevice | null = null;
let deviceIdValue = "";
let devicePromise: Promise<void> | null = null;
let current: Session | null = null;
let page: string | null = null;
let releaseTimer: number | null = null;
let flushTimer: number | null = null;
let hiddenAt: number | null = null;
let listening = false;

const now = () => performance.now();

function newSession(forPage: string, via: "load" | "next"): Session {
  const visible = typeof document !== "undefined" && document.visibilityState === "visible";
  const t0 = now();
  return {
    id: `s${randomId()}`,
    bucket: hourBucket(),
    t0,
    sum: {
      page: forPage,
      via,
      firstInputMs: null,
      lastActiveMs: 0,
      startMs: null,
      endMs: null,
      starts: 0,
      ends: 0,
      wins: 0,
      best: null,
      lastScore: null,
      outOf: null,
      lastLabel: "",
      mode: "",
      lastStep: "",
      steps: 0,
      taps: 0,
      keys: 0,
      camera: "",
      errors: 0,
      visibleMs: 0,
      lastMs: 0,
      close: "",
    },
    queue: [],
    queued: 0,
    posts: 0,
    deviceSent: false,
    visibleSince: visible ? t0 : null,
    lastInputAt: null,
    closed: false,
  };
}

const elapsed = (s: Session) => Math.round(now() - s.t0);

function push(s: Session, k: PlayEventKind, x?: Value, v?: Value, active = true) {
  if (s.closed) return;
  const t = elapsed(s);
  if (active) s.sum.lastActiveMs = t;
  if (s.queued >= PLAY_MAX_EVENTS_PER_SESSION) return;
  const ev: PlayEvent = { k, t };
  if (x !== undefined && x !== "") ev.x = String(x).slice(0, 60);
  if (v !== undefined && v !== "") ev.v = typeof v === "number" ? v : String(v).slice(0, 40);
  s.queue.push(ev);
  s.queued++;
}

/** A session that only ever sat on screen after "Next player" isn't a person: never written. */
const worthSending = (s: Session) => s.sum.via === "load" || s.sum.firstInputMs !== null || s.sum.starts > 0;

function payload(s: Session): PlayPayload | null {
  if (!device || !deviceIdValue || !worthSending(s)) return null;
  if (s.visibleSince !== null) {
    s.sum.visibleMs += now() - s.visibleSince;
    s.visibleSince = s.closed ? null : now();
  }
  s.sum.visibleMs = Math.round(s.sum.visibleMs);
  s.sum.lastMs = elapsed(s);
  const e = s.queue.splice(0, PLAY_MAX_EVENTS_PER_POST);
  const body: PlayPayload = { d: deviceIdValue, b: s.bucket, s: s.id, sum: { ...s.sum }, e };
  if (!s.deviceSent) {
    body.dev = device;
    s.deviceSent = true;
  }
  s.posts++;
  return body;
}

function send(s: Session, leaving: boolean) {
  if (s.posts >= MAX_POSTS_PER_SESSION && !s.closed) return;
  const body = payload(s);
  if (!body) return;
  const json = JSON.stringify(body);
  try {
    if (leaving && navigator.sendBeacon?.(ENDPOINT, new Blob([json], { type: "text/plain" }))) {
      if (s.queue.length) send(s, leaving);
      return;
    }
  } catch {
    // fall through to fetch
  }
  fetch(ENDPOINT, { method: "POST", body: json, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
  if (s.queue.length) send(s, leaving);
}

function flush(leaving = false) {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  const s = current;
  if (!s) return;
  if (!device) {
    // The profile is still being worked out (a few ms): send once it's there.
    void ensureDevice().then(() => {
      if (current === s || s.closed) send(s, leaving);
    });
    return;
  }
  send(s, leaving);
}

function schedule(ms = FLUSH_MS) {
  if (flushTimer !== null || typeof window === "undefined") return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flush();
  }, ms);
}

function ensureDevice(): Promise<void> {
  if (!devicePromise) {
    devicePromise = deviceProfile()
      .then((profile) => {
        const { id, returning, ...rest } = profile;
        deviceIdValue = id;
        device = { ...rest, returning };
      })
      .catch(() => {
        deviceIdValue = deviceId().id;
      });
  }
  return devicePromise;
}

function close(reason: CloseReason, x?: string) {
  const s = current;
  if (!s || s.closed) return;
  push(s, reason === "next-player" || reason === "idle" ? "next" : "leave", x ?? reason, undefined, false);
  s.sum.close = reason;
  s.closed = true;
  const visibleFor = s.visibleSince !== null ? now() - s.visibleSince : 0;
  s.visibleSince = null;
  s.sum.visibleMs += visibleFor;
  current = null;
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!device) {
    void ensureDevice().then(() => send(s, true));
    return;
  }
  send(s, reason === "left" || reason === "away");
}

function open(forPage: string, via: "load" | "next") {
  current = newSession(forPage, via);
  push(current, "open", via, undefined, false);
  schedule(via === "load" ? FIRST_FLUSH_MS : FLUSH_MS);
}

/* ── Page-wide listeners (once) ───────────────────────────────────── */

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;

  const input = (kind: "taps" | "keys") => () => {
    const s = current;
    if (!s) return;
    s.sum[kind]++;
    const t = elapsed(s);
    if (s.sum.firstInputMs === null) {
      s.sum.firstInputMs = t;
      schedule();
    }
    s.sum.lastActiveMs = t;
    s.lastInputAt = now();
  };
  window.addEventListener("pointerdown", input("taps"), { passive: true, capture: true });
  window.addEventListener("keydown", input("keys"), { passive: true, capture: true });

  document.addEventListener("visibilitychange", () => {
    const s = current;
    if (document.visibilityState === "hidden") {
      hiddenAt = now();
      if (!s) return;
      if (s.visibleSince !== null) {
        s.sum.visibleMs += now() - s.visibleSince;
        s.visibleSince = null;
      }
      push(s, "hide", undefined, undefined, false);
      flush(true);
    } else {
      const away = hiddenAt !== null ? now() - hiddenAt : 0;
      hiddenAt = null;
      if (!s) return;
      if (away > AWAY_MS && page) {
        const p = page;
        close("away");
        open(p, "next");
        return;
      }
      s.visibleSince = now();
      push(s, "show", undefined, Math.round(away / 1000), false);
      schedule();
    }
  });

  window.addEventListener("pagehide", () => close("left", "closed"));
  // Back from the browser's page cache: the old session was closed on the way out.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted && page && !current) open(page, "load");
  });

  const error = (message: string) => {
    const s = current;
    if (!s || s.sum.errors >= MAX_ERRORS) return;
    s.sum.errors++;
    push(s, "error", message.slice(0, 60), undefined, false);
    schedule();
  };
  window.addEventListener("error", (e) => error(e.message || "error"));
  window.addEventListener("unhandledrejection", (e) => {
    const r: unknown = e.reason;
    error(r instanceof Error ? `${r.name}: ${r.message}` : typeof r === "string" ? r : "promise rejected");
  });

  // Camera answers, for every game at once, without touching any game's code.
  const media = navigator.mediaDevices;
  if (media && typeof media.getUserMedia === "function") {
    const original = media.getUserMedia.bind(media);
    media.getUserMedia = (constraints?: MediaStreamConstraints) => {
      const wantsVideo = Boolean(constraints?.video);
      return original(constraints).then(
        (stream) => {
          if (wantsVideo) camera("ok");
          return stream;
        },
        (err: unknown) => {
          if (wantsVideo) camera(err instanceof Error ? err.name : "error");
          throw err;
        },
      );
    };
  }
}

function camera(answer: string) {
  const s = current;
  if (!s) return;
  if (s.sum.camera === answer) return;
  s.sum.camera = answer;
  push(s, "camera", answer);
  schedule();
}

/* ── For GameShell and the hub ────────────────────────────────────── */

/**
 * GameShell calls this on mount and the returned function on unmount. A
 * remount of the same game within 2 s (screen changes, StrictMode) keeps the
 * session; anything else closes it.
 */
export function openPage(forPage: string): () => void {
  if (typeof window === "undefined") return () => {};
  listen();
  void ensureDevice();
  if (releaseTimer !== null) {
    window.clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  if (current && page === forPage && !current.closed) return release(forPage);
  if (current) close("left", forPage);
  page = forPage;
  open(forPage, "load");
  return release(forPage);
}

function release(forPage: string) {
  return () => {
    if (releaseTimer !== null) window.clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(() => {
      releaseTimer = null;
      if (page === forPage) {
        close("left", "page");
        page = null;
      }
    }, 2000);
  };
}

/* ── For games ────────────────────────────────────────────────────── */

export interface PlayResult {
  /** The number that matters (points, rounds won, accuracy %...). */
  score?: number;
  /** What the score is out of, when there is a maximum. */
  outOf?: number;
  /** Did the visitor win, beat the machine or finish the level? */
  won?: boolean;
  /** A few words: "caught on round 4", "level 2 cleared", "machine guessed 37". */
  label?: string;
}

export const track = {
  /** A round, match, run or lesson began. `mode`: how they play it (camera, mouse, easy...). */
  start(mode?: string, detail?: Value) {
    const s = current;
    if (!s) return;
    const t = elapsed(s);
    s.sum.starts++;
    if (s.sum.startMs === null) s.sum.startMs = t;
    if (mode) s.sum.mode = mode.slice(0, 24);
    push(s, "start", mode, detail);
    flush();
  },

  /** Anything in between: a screen, a choice, a round result, a setting. Keep `name` short and stable. */
  step(name: string, value?: Value) {
    const s = current;
    if (!s) return;
    s.sum.steps++;
    s.sum.lastStep = name.slice(0, 40);
    push(s, "step", name, value);
    schedule();
  },

  /** The round, match, run or lesson finished and the visitor saw a result. */
  end(result: PlayResult = {}) {
    const s = current;
    if (!s) return;
    const t = elapsed(s);
    s.sum.ends++;
    if (s.sum.endMs === null) s.sum.endMs = t;
    if (result.won) s.sum.wins++;
    if (typeof result.score === "number" && Number.isFinite(result.score)) {
      s.sum.lastScore = result.score;
      s.sum.best = s.sum.best === null ? result.score : Math.max(s.sum.best, result.score);
    }
    if (typeof result.outOf === "number" && Number.isFinite(result.outOf)) s.sum.outOf = result.outOf;
    if (result.label) s.sum.lastLabel = result.label.slice(0, 40);
    push(s, "end", result.label ?? (result.won === undefined ? "" : result.won ? "won" : "lost"), result.score);
    flush();
  },

  /**
   * The next visitor takes over: closes this session and opens a new one.
   * Safe to call twice (button and game both): a second call within a moment
   * of a fresh session does nothing.
   */
  nextPlayer() {
    const s = current;
    if (!s || !page) return;
    const fresh = s.sum.via === "next" && s.sum.firstInputMs === null && s.sum.starts === 0;
    if (fresh) return;
    const idle = s.lastInputAt === null || now() - s.lastInputAt > IDLE_GUESS_MS;
    const p = page;
    close(idle ? "idle" : "next-player", idle ? "idle" : "button");
    open(p, "next");
  },
};
