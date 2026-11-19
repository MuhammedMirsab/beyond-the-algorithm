import { ISSUES, RATINGS } from "@/content/feedback";
import { GAMES } from "@/content/games";

/**
 * Anonymous tracking of the feedback form, one Firestore doc per page load:
 * `visits/<session>`. No names, no IP addresses, nothing typed is stored
 * (only how long a comment was). The browser posts to /api/track, which
 * writes with the service account; the security rules keep `visits` closed
 * to the site.
 *
 * Shared by the browser (what it sends), the API route (what it accepts)
 * and the /responses dashboard (what it reads back).
 */

export const EVENT_KINDS = [
  "open", // page shown
  "rate", // tapped a rating (x = 1..5)
  "game", // ticked or unticked a game (x = slug)
  "issue", // ticked or unticked a problem (x = id)
  "type", // stopped typing a comment (x = length)
  "invalid", // pressed send with something missing
  "send", // pressed send (x = feedback doc id)
  "sent", // Firestore confirmed it
  "fail", // it didn't send
  "hide", // tab hidden, phone locked or app switched
  "show", // back again
  "again", // "Try the other games" on the thank-you screen
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export interface VisitEvent {
  k: EventKind;
  /** Milliseconds since the page opened. */
  t: number;
  x?: string | number;
}

/** What the browser knows about this visit so far; sent whole on every flush. */
export interface VisitSummary {
  from: string;
  rating: number | null;
  firstTapMs: number | null;
  ratedMs: number | null;
  games: string[];
  issues: string[];
  commentLen: number;
  sendMs: number | null;
  sentMs: number | null;
  feedbackId: string;
  fails: number;
  /** Time on the page at this flush. */
  lastMs: number;
}

/** Sent once, with the first flush. */
export interface VisitDevice {
  /** Hash of stable browser and screen traits: groups visits when storage was cleared. */
  fp: string;
  kind: "phone" | "tablet" | "desktop";
  os: string;
  browser: string;
  lang: string;
  /** This browser opened the form before (it has a visitor id already). */
  returning: boolean;
  /** 1 for the first time this browser opened the form, 2 for the second... */
  visitNo: number;
  /** Feedback this browser already sent before this visit. */
  sentBefore: number;
}

export interface TrackPayload {
  v: string;
  s: string;
  sum: VisitSummary;
  dev?: VisitDevice;
  e: VisitEvent[];
}

export const MAX_EVENTS_PER_POST = 40;
export const MAX_EVENTS_PER_VISIT = 120;

/* ── Checking what comes in ───────────────────────────────────────── */

const ID = /^[a-z0-9]{8,32}$/;
const FEEDBACK_ID = /^[A-Za-z0-9]{10,40}$/;
const SLUGS = new Set<string>(GAMES.map((g) => g.slug));
const ISSUE_IDS = new Set<string>(ISSUES.map((i) => i.id));
const KINDS = new Set<string>(EVENT_KINDS);

const ms = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), 86_400_000) : null);
const word = (v: unknown, max = 40) => (typeof v === "string" ? v.replace(/[^\w .+/-]/g, "").slice(0, max) : "");
const slugList = (v: unknown, ok: Set<string>) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && ok.has(x)))].slice(0, 12) : [];

/** Tidies a POST to /api/track, or null when it isn't one. */
export function parseTrack(body: unknown): TrackPayload | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (typeof raw.v !== "string" || !ID.test(raw.v) || typeof raw.s !== "string" || !ID.test(raw.s)) return null;
  const s = (raw.sum ?? {}) as Record<string, unknown>;
  const rating = typeof s.rating === "number" && RATINGS.some((r) => r.value === s.rating) ? s.rating : null;
  const sum: VisitSummary = {
    from: typeof s.from === "string" && SLUGS.has(s.from) ? s.from : "",
    rating,
    firstTapMs: ms(s.firstTapMs),
    ratedMs: ms(s.ratedMs),
    games: slugList(s.games, SLUGS),
    issues: slugList(s.issues, ISSUE_IDS),
    commentLen: Math.min(ms(s.commentLen) ?? 0, 2000),
    sendMs: ms(s.sendMs),
    sentMs: ms(s.sentMs),
    feedbackId: typeof s.feedbackId === "string" && FEEDBACK_ID.test(s.feedbackId) ? s.feedbackId : "",
    fails: Math.min(ms(s.fails) ?? 0, 50),
    lastMs: ms(s.lastMs) ?? 0,
  };

  let dev: VisitDevice | undefined;
  if (raw.dev && typeof raw.dev === "object") {
    const d = raw.dev as Record<string, unknown>;
    dev = {
      fp: typeof d.fp === "string" && /^[a-f0-9]{8,64}$/.test(d.fp) ? d.fp : "",
      kind: d.kind === "phone" || d.kind === "tablet" ? d.kind : "desktop",
      os: word(d.os, 24),
      browser: word(d.browser, 24),
      lang: word(d.lang, 16),
      returning: d.returning === true,
      visitNo: Math.min(ms(d.visitNo) ?? 1, 999),
      sentBefore: Math.min(ms(d.sentBefore) ?? 0, 999),
    };
  }

  const events: VisitEvent[] = (Array.isArray(raw.e) ? raw.e : [])
    .slice(0, MAX_EVENTS_PER_POST)
    .flatMap((item): VisitEvent[] => {
      if (!item || typeof item !== "object") return [];
      const ev = item as Record<string, unknown>;
      const t = ms(ev.t);
      if (typeof ev.k !== "string" || !KINDS.has(ev.k) || t === null) return [];
      const x = typeof ev.x === "number" && Number.isFinite(ev.x) ? Math.round(ev.x) : typeof ev.x === "string" ? word(ev.x, 40) : undefined;
      return [x === undefined || x === "" ? { k: ev.k as EventKind, t } : { k: ev.k as EventKind, t, x }];
    });

  return { v: raw.v, s: raw.s, sum, dev, e: events };
}

/* ── Reading it back (dashboard) ──────────────────────────────────── */

export interface Visit extends VisitSummary {
  id: string;
  visitor: string;
  fp: string;
  device: { kind: string; os: string; browser: string; lang: string };
  country: string;
  returning: boolean;
  visitNo: number;
  sentBefore: number;
  /** ISO, server clock. */
  openedAt: string;
  lastAt: string;
  events: VisitEvent[];
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function toVisit(id: string, f: Record<string, unknown>, createTime: string): Visit {
  const dev = (f.device ?? {}) as Record<string, unknown>;
  const events = (Array.isArray(f.events) ? f.events : [])
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .map((e) => ({ k: str(e.k) as EventKind, t: num(e.t) ?? 0, ...(e.x !== undefined && e.x !== null ? { x: e.x as string | number } : {}) }))
    .sort((a, b) => a.t - b.t);
  const openedAt = str(f.openedAt) || createTime;
  return {
    id,
    visitor: str(f.visitor),
    fp: str(f.fp),
    device: { kind: str(dev.kind) || "unknown", os: str(dev.os), browser: str(dev.browser), lang: str(dev.lang) },
    country: str(f.country),
    returning: f.returning === true,
    visitNo: num(f.visitNo) ?? 1,
    sentBefore: num(f.sentBefore) ?? 0,
    openedAt,
    lastAt: str(f.lastAt) || openedAt,
    from: str(f.from),
    rating: num(f.rating),
    firstTapMs: num(f.firstTapMs),
    ratedMs: num(f.ratedMs),
    games: list(f.games),
    issues: list(f.issues),
    commentLen: num(f.commentLen) ?? 0,
    sendMs: num(f.sendMs),
    sentMs: num(f.sentMs),
    feedbackId: str(f.feedbackId),
    fails: num(f.fails) ?? 0,
    lastMs: num(f.lastMs) ?? 0,
    events,
  };
}

/** Where a visit got to. "here" = no word from it for under two minutes and not sent. */
export type VisitStage = "sent" | "here" | "left-before-tapping" | "left-after-rating" | "left-after-tapping" | "send-failed";

export function visitStage(v: Visit, now: string): VisitStage {
  if (v.sentMs !== null) return "sent";
  const lastKind = v.events[v.events.length - 1]?.k;
  if (Date.parse(now) - Date.parse(v.lastAt) < 120_000 && lastKind !== "hide") return "here";
  if (v.fails > 0) return "send-failed";
  if (v.rating !== null) return "left-after-rating";
  if (v.firstTapMs !== null) return "left-after-tapping";
  return "left-before-tapping";
}
