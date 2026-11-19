import { MAX_EVENTS_PER_POST, MAX_EVENTS_PER_VISIT, type EventKind, type TrackPayload, type VisitDevice, type VisitEvent, type VisitSummary } from "@/content/visits";
import { readJSON, storageKey, writeJSON } from "@/lib/storage";

/**
 * Browser side of the feedback form's anonymous tracking (see
 * src/content/visits.ts). One tracker per page load. Every call is
 * fire-and-forget: if tracking fails, the form never notices.
 */

const VISITOR_KEY = storageKey("feedback", "visitor");
const VISITS_KEY = storageKey("feedback", "visits");
const SENT_KEY = storageKey("feedback", "sent");
const ENDPOINT = "/api/track";
const FLUSH_DELAY_MS = 1500;

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

const count = (key: string) => {
  const n = readJSON<unknown>(key, 0);
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

/** The id this browser keeps in localStorage. Private windows get a new one each time. */
function visitorId(): { id: string; returning: boolean } {
  const saved = readJSON<string | null>(VISITOR_KEY, null);
  if (typeof saved === "string" && /^[a-z0-9]{8,32}$/.test(saved)) return { id: saved, returning: true };
  const id = randomId();
  writeJSON(VISITOR_KEY, id);
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

/**
 * A hash of traits that stay the same in one browser on one device: lets the
 * dashboard spot the same phone when storage was cleared or a private window
 * was used. Many phones of the same model share it, so it groups, never names.
 */
async function fingerprint(): Promise<string> {
  const n = navigator as Navigator & { deviceMemory?: number };
  const traits = [
    navigator.userAgent,
    navigator.language,
    (navigator.languages ?? []).join(","),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${screen.width}x${screen.height}x${screen.colorDepth}@${window.devicePixelRatio}`,
    navigator.hardwareConcurrency ?? "",
    n.deviceMemory ?? "",
    navigator.maxTouchPoints ?? 0,
  ].join("|");
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(traits));
    return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return fnv(traits) + fnv(traits.split("").reverse().join(""));
  }
}

function describeDevice(): Pick<VisitDevice, "kind" | "os" | "browser" | "lang"> {
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

export class VisitTracker {
  private readonly start = performance.now();
  private readonly visitor: string;
  private readonly session = randomId();
  private readonly returning: boolean;
  private readonly visitNo: number;
  private readonly sentBefore: number;
  private queue: VisitEvent[] = [];
  private sentEvents = 0;
  private deviceSent = false;
  private device: VisitDevice | null = null;
  private timer: number | null = null;
  private inFlight = false;
  private again = false;
  private hidden = false;
  private stopped = false;
  readonly summary: VisitSummary;

  constructor(from: string) {
    const { id, returning } = visitorId();
    this.visitor = id;
    this.returning = returning;
    this.visitNo = count(VISITS_KEY) + 1;
    writeJSON(VISITS_KEY, this.visitNo);
    this.sentBefore = count(SENT_KEY);
    this.summary = {
      from,
      rating: null,
      firstTapMs: null,
      ratedMs: null,
      games: from ? [from] : [],
      issues: [],
      commentLen: 0,
      sendMs: null,
      sentMs: null,
      feedbackId: "",
      fails: 0,
      lastMs: 0,
    };
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pagehide", this.onPageHide);
    void fingerprint().then((fp) => {
      this.device = {
        fp,
        ...describeDevice(),
        returning: this.returning,
        visitNo: this.visitNo,
        sentBefore: this.sentBefore,
      };
      this.event("open", from || undefined, true);
    });
  }

  /** Milliseconds since the page opened. */
  now(): number {
    return Math.round(performance.now() - this.start);
  }

  /** Records something the visitor did. Interactions also set `firstTapMs`. */
  event(k: EventKind, x?: string | number, urgent = false) {
    if (this.stopped) return;
    const t = this.now();
    if (this.summary.firstTapMs === null && (k === "rate" || k === "game" || k === "issue" || k === "type")) {
      this.summary.firstTapMs = t;
    }
    if (this.sentEvents + this.queue.length < MAX_EVENTS_PER_VISIT) this.queue.push(x === undefined ? { k, t } : { k, t, x });
    if (urgent) this.flush();
    else this.schedule();
  }

  /** Merges what the form knows now (rating, games, issues...). */
  update(patch: Partial<VisitSummary>) {
    Object.assign(this.summary, patch);
  }

  /** The answer reached Firestore. */
  sent(feedbackId: string) {
    this.update({ sentMs: this.now(), feedbackId });
    writeJSON(SENT_KEY, this.sentBefore + 1);
    this.event("sent", feedbackId, true);
  }

  stop() {
    if (this.stopped) return;
    this.flush(true);
    this.stopped = true;
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pagehide", this.onPageHide);
    if (this.timer !== null) window.clearTimeout(this.timer);
  }

  private schedule() {
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, FLUSH_DELAY_MS);
  }

  private payload(): TrackPayload | null {
    // Nothing goes out before the device line: the first post has to carry it.
    if (!this.device) return null;
    this.summary.lastMs = this.now();
    const e = this.queue.splice(0, MAX_EVENTS_PER_POST);
    this.sentEvents += e.length;
    const body: TrackPayload = { v: this.visitor, s: this.session, sum: { ...this.summary }, e };
    if (!this.deviceSent) {
      body.dev = this.device;
      this.deviceSent = true;
    }
    return body;
  }

  /** `leaving`: the page may be gone in a moment, so hand it to sendBeacon. */
  private flush(leaving = false) {
    if (this.stopped) return;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    if (!leaving && this.inFlight) {
      this.again = true;
      return;
    }
    const body = this.payload();
    if (!body) return;
    const json = JSON.stringify(body);
    try {
      if (leaving && navigator.sendBeacon?.(ENDPOINT, new Blob([json], { type: "text/plain" }))) return;
    } catch {
      // fall through to fetch
    }
    this.inFlight = true;
    fetch(ENDPOINT, { method: "POST", body: json, keepalive: true, headers: { "Content-Type": "text/plain" } })
      .catch(() => {})
      .finally(() => {
        this.inFlight = false;
        if (this.again || this.queue.length) {
          this.again = false;
          this.flush();
        }
      });
  }

  private onVisibility = () => {
    if (document.visibilityState === "hidden") {
      if (this.hidden) return;
      this.hidden = true;
      this.queue.push({ k: "hide", t: this.now() });
      this.flush(true);
    } else if (this.hidden) {
      this.hidden = false;
      this.event("show", undefined, true);
    }
  };

  private onPageHide = () => {
    if (this.hidden) return;
    this.hidden = true;
    this.queue.push({ k: "hide", t: this.now() });
    this.flush(true);
  };
}
