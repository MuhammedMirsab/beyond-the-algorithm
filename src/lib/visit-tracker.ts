import { MAX_EVENTS_PER_POST, MAX_EVENTS_PER_VISIT, type EventKind, type TrackPayload, type VisitDevice, type VisitEvent, type VisitSummary } from "@/content/visits";
import { describeDevice, deviceId, fingerprint, randomId } from "@/lib/device";
import { readJSON, storageKey, writeJSON } from "@/lib/storage";

/**
 * Browser side of the feedback form's anonymous tracking (see
 * src/content/visits.ts). One tracker per page load. Every call is
 * fire-and-forget: if tracking fails, the form never notices.
 */

const VISITS_KEY = storageKey("feedback", "visits");
const SENT_KEY = storageKey("feedback", "sent");
const ENDPOINT = "/api/track";
const FLUSH_DELAY_MS = 1500;

const count = (key: string) => {
  const n = readJSON<unknown>(key, 0);
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

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
    const { id, returning } = deviceId();
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
