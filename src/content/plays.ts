import { GAMES } from "@/content/games";

/**
 * Game analytics: one session per player per game. A session starts when a
 * game page opens (or "Next player" is pressed) and ends at the next "Next
 * player", an idle reset, or when the visitor leaves the page.
 *
 * Kept cheap for the Firebase free plan: the browser batches events and
 * posts at most every 20 s (sooner on start, end and leaving), and every
 * session of one device in one hour lives in ONE Firestore document:
 *
 *   plays/<deviceId>_<yyyymmddhh UTC>
 *     dev   what the device is (sent once per session, last one wins)
 *     day   "2026-11-20" (Jeddah), for reading
 *     s.<sessionId>.sum  the session so far (replaced on every post)
 *     s.<sessionId>.net  IP address and Vercel's geo guess (first post)
 *     s.<sessionId>.at   server time of the first post
 *     s.<sessionId>.last server time of the latest post
 *     s.<sessionId>.ev   events, appended
 *
 * So the /responses dashboard reads a few dozen documents a day instead of
 * one per session. The browser posts to /api/play, which writes with the
 * service account; the security rules keep `plays` closed to the site.
 *
 * Shared by the browser (what it sends), the API route (what it accepts) and
 * the dashboard (what it reads back).
 */

export const ARCADE = "arcade";
export const PLAY_PAGES = [...GAMES.map((g) => g.slug as string), ARCADE];

export const PLAY_EVENT_KINDS = [
  "open", // page opened or a new player's session began (x = "load" | "next")
  "start", // a round or run began (x = mode, v = detail)
  "step", // anything in between (x = what, v = value)
  "end", // a round or run finished (x = label, v = score)
  "camera", // camera answer (x = "ok" | error name)
  "hide", // tab hidden, phone locked
  "show", // back again
  "next", // "Next player" or an idle reset closed this session (x = "button" | "idle")
  "leave", // left the page or moved to another game (x = where)
  "error", // the page threw (x = message)
] as const;

export type PlayEventKind = (typeof PLAY_EVENT_KINDS)[number];

export interface PlayEvent {
  k: PlayEventKind;
  /** Milliseconds since the session opened. */
  t: number;
  x?: string;
  v?: string | number;
}

export type CloseReason = "" | "next-player" | "idle" | "left" | "away";

/** What the browser knows about the session so far; sent whole on every post. */
export interface PlaySummary {
  page: string;
  /** How the session began: the page loaded, or the previous player pressed Next player. */
  via: "load" | "next";
  /** First pointer or key input. */
  firstInputMs: number | null;
  /** Latest input or tracked event. */
  lastActiveMs: number;
  startMs: number | null;
  endMs: number | null;
  starts: number;
  ends: number;
  wins: number;
  best: number | null;
  lastScore: number | null;
  outOf: number | null;
  lastLabel: string;
  mode: string;
  lastStep: string;
  steps: number;
  taps: number;
  keys: number;
  camera: string;
  errors: number;
  /** Time the page was visible. */
  visibleMs: number;
  /** Time since the session opened, at this post. */
  lastMs: number;
  close: CloseReason;
}

export interface PlayDevice {
  fp: string;
  kind: "phone" | "tablet" | "desktop";
  os: string;
  browser: string;
  lang: string;
  screen: string;
  viewport: string;
  cores: number;
  memory: number;
  touch: number;
  gpu: string;
  tz: string;
  net: string;
  returning: boolean;
}

export interface PlayPayload {
  /** Device id (localStorage). */
  d: string;
  /** UTC hour the session opened in, yyyymmddhh: picks the document. */
  b: string;
  /** Session id: "s" + letters and digits, so it works as a Firestore field name. */
  s: string;
  sum: PlaySummary;
  dev?: PlayDevice;
  e: PlayEvent[];
}

export const PLAY_MAX_EVENTS_PER_POST = 60;
export const PLAY_MAX_EVENTS_PER_SESSION = 240;

export function hourBucket(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}`;
}

/* ── Checking what comes in ───────────────────────────────────────── */

const DEVICE_ID = /^[a-z0-9]{8,32}$/;
const SESSION_ID = /^s[a-z0-9]{8,32}$/;
const BUCKET = /^20\d{8}$/;
const PAGES = new Set(PLAY_PAGES);
const KINDS = new Set<string>(PLAY_EVENT_KINDS);
const CLOSES = new Set<string>(["", "next-player", "idle", "left", "away"]);

const ms = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), 86_400_000) : null);
const int = (v: unknown, max: number) => Math.min(ms(v) ?? 0, max);
const score = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-1e7, Math.min(1e7, Math.round(v * 100) / 100)) : null);
const word = (v: unknown, max = 40) => (typeof v === "string" ? v.replace(/[^\w .,:+/@×()'%-]/g, "").slice(0, max) : "");

/** Tidies a POST to /api/play, or null when it isn't one. */
export function parsePlay(body: unknown): PlayPayload | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (typeof raw.d !== "string" || !DEVICE_ID.test(raw.d)) return null;
  if (typeof raw.s !== "string" || !SESSION_ID.test(raw.s)) return null;
  if (typeof raw.b !== "string" || !BUCKET.test(raw.b)) return null;
  const s = (raw.sum ?? {}) as Record<string, unknown>;
  if (typeof s.page !== "string" || !PAGES.has(s.page)) return null;

  const sum: PlaySummary = {
    page: s.page,
    via: s.via === "next" ? "next" : "load",
    firstInputMs: ms(s.firstInputMs),
    lastActiveMs: ms(s.lastActiveMs) ?? 0,
    startMs: ms(s.startMs),
    endMs: ms(s.endMs),
    starts: int(s.starts, 999),
    ends: int(s.ends, 999),
    wins: int(s.wins, 999),
    best: score(s.best),
    lastScore: score(s.lastScore),
    outOf: score(s.outOf),
    lastLabel: word(s.lastLabel),
    mode: word(s.mode, 24),
    lastStep: word(s.lastStep),
    steps: int(s.steps, 99_999),
    taps: int(s.taps, 99_999),
    keys: int(s.keys, 99_999),
    camera: word(s.camera, 32),
    errors: int(s.errors, 999),
    visibleMs: ms(s.visibleMs) ?? 0,
    lastMs: ms(s.lastMs) ?? 0,
    close: typeof s.close === "string" && CLOSES.has(s.close) ? (s.close as CloseReason) : "",
  };

  let dev: PlayDevice | undefined;
  if (raw.dev && typeof raw.dev === "object") {
    const d = raw.dev as Record<string, unknown>;
    dev = {
      fp: typeof d.fp === "string" && /^[a-f0-9]{8,64}$/.test(d.fp) ? d.fp : "",
      kind: d.kind === "phone" || d.kind === "tablet" ? d.kind : "desktop",
      os: word(d.os, 24),
      browser: word(d.browser, 24),
      lang: word(d.lang, 16),
      screen: word(d.screen, 24),
      viewport: word(d.viewport, 24),
      cores: int(d.cores, 512),
      memory: int(d.memory, 1024),
      touch: int(d.touch, 32),
      gpu: word(d.gpu, 80),
      tz: word(d.tz, 40),
      net: word(d.net, 12),
      returning: d.returning === true,
    };
  }

  const events: PlayEvent[] = (Array.isArray(raw.e) ? raw.e : [])
    .slice(0, PLAY_MAX_EVENTS_PER_POST)
    .flatMap((item): PlayEvent[] => {
      if (!item || typeof item !== "object") return [];
      const ev = item as Record<string, unknown>;
      const t = ms(ev.t);
      if (typeof ev.k !== "string" || !KINDS.has(ev.k) || t === null) return [];
      const out: PlayEvent = { k: ev.k as PlayEventKind, t };
      const x = word(ev.x, 60);
      if (x) out.x = x;
      const v = typeof ev.v === "number" ? score(ev.v) : typeof ev.v === "string" ? word(ev.v, 40) : null;
      if (v !== null && v !== "") out.v = v;
      return [out];
    });

  return { d: raw.d, b: raw.b, s: raw.s, sum, dev, e: events };
}

/* ── Reading it back (dashboard) ──────────────────────────────────── */

export interface PlayNet {
  ip: string;
  country: string;
  region: string;
  city: string;
  ua: string;
}

export interface PlaySession extends PlaySummary {
  id: string;
  deviceId: string;
  device: PlayDevice;
  net: PlayNet;
  /** ISO, server clock. */
  openedAt: string;
  lastAt: string;
  events: PlayEvent[];
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function toDevice(d: Record<string, unknown>): PlayDevice {
  return {
    fp: str(d.fp),
    kind: d.kind === "phone" || d.kind === "tablet" ? d.kind : "desktop",
    os: str(d.os),
    browser: str(d.browser),
    lang: str(d.lang),
    screen: str(d.screen),
    viewport: str(d.viewport),
    cores: num(d.cores) ?? 0,
    memory: num(d.memory) ?? 0,
    touch: num(d.touch) ?? 0,
    gpu: str(d.gpu),
    tz: str(d.tz),
    net: str(d.net),
    returning: d.returning === true,
  };
}

/** Every session inside one `plays` document. */
export function sessionsFromDoc(docId: string, f: Record<string, unknown>, createTime: string): PlaySession[] {
  const deviceId = docId.split("_")[0] ?? docId;
  const docDevice = toDevice(obj(f.dev));
  return Object.entries(obj(f.s)).map(([id, raw]) => {
    const s = obj(raw);
    const sum = obj(s.sum);
    const net = obj(s.net);
    const events = (Array.isArray(s.ev) ? s.ev : [])
      .map(obj)
      .map((e) => {
        const out: PlayEvent = { k: str(e.k) as PlayEventKind, t: num(e.t) ?? 0 };
        if (typeof e.x === "string") out.x = e.x;
        if (typeof e.v === "string" || typeof e.v === "number") out.v = e.v;
        return out;
      })
      .sort((a, b) => a.t - b.t);
    const openedAt = str(s.at) || createTime;
    return {
      id,
      deviceId,
      device: Object.keys(obj(s.dev)).length ? toDevice(obj(s.dev)) : docDevice,
      net: { ip: str(net.ip), country: str(net.country), region: str(net.region), city: str(net.city), ua: str(net.ua) },
      openedAt,
      lastAt: str(s.last) || openedAt,
      events,
      page: str(sum.page),
      via: sum.via === "next" ? "next" : "load",
      firstInputMs: num(sum.firstInputMs),
      lastActiveMs: num(sum.lastActiveMs) ?? 0,
      startMs: num(sum.startMs),
      endMs: num(sum.endMs),
      starts: num(sum.starts) ?? 0,
      ends: num(sum.ends) ?? 0,
      wins: num(sum.wins) ?? 0,
      best: num(sum.best),
      lastScore: num(sum.lastScore),
      outOf: num(sum.outOf),
      lastLabel: str(sum.lastLabel),
      mode: str(sum.mode),
      lastStep: str(sum.lastStep),
      steps: num(sum.steps) ?? 0,
      taps: num(sum.taps) ?? 0,
      keys: num(sum.keys) ?? 0,
      camera: str(sum.camera),
      errors: num(sum.errors) ?? 0,
      visibleMs: num(sum.visibleMs) ?? 0,
      lastMs: num(sum.lastMs) ?? 0,
      close: (str(sum.close) as CloseReason) || "",
    };
  });
}

/** Where a session got to. "here" = heard from in the last two minutes and not closed. */
export type PlayStage = "finished" | "playing" | "here" | "left-mid-game" | "left-before-start" | "looked-only";

export function playStage(s: PlaySession, now: string): PlayStage {
  if (s.ends > 0) return "finished";
  const recent = Date.parse(now) - Date.parse(s.lastAt) < 120_000 && !s.close;
  if (recent) return s.starts > 0 ? "playing" : "here";
  if (s.starts > 0) return "left-mid-game";
  if (s.firstInputMs !== null) return "left-before-start";
  return "looked-only";
}

/**
 * How long this person really spent: from their first input (or the session
 * opening, for a fresh page load) to the last thing they did. A booth laptop
 * sitting on the intro until the next visitor doesn't count.
 */
export function engagedMs(s: PlaySession): number {
  const from = s.via === "load" ? 0 : (s.firstInputMs ?? s.startMs ?? s.lastActiveMs);
  return Math.max(0, s.lastActiveMs - from);
}
