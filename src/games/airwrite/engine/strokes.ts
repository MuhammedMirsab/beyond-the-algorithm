/** Stroke model. Points are normalised to the writing surface (0..1 on each axis). */

export interface PenPoint {
  x: number;
  y: number;
  t: number;
}

export type StrokeSource = "air" | "pointer";

export interface Stroke {
  id: number;
  points: PenPoint[];
  source: StrokeSource;
}

export interface EndOptions {
  /** Drop points recorded after this timestamp (removes the pinch "hook"). */
  trimAfter?: number;
}

export interface StrokeSink {
  begin(p: PenPoint, source?: StrokeSource): void;
  add(p: PenPoint): void;
  end(opts?: EndOptions): void;
  eraseBegin(): void;
  /**
   * Erase everything within `radius` of the segment a→b.
   * Radius is in canvas-height units; `aspect` is canvas width / height.
   */
  eraseSegment(a: { x: number; y: number }, b: { x: number; y: number }, radius: number, aspect: number): void;
  eraseEnd(): void;
}

function pathLength(points: PenPoint[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/** Squared distance from p to segment ab (all in the same isotropic units). */
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

const MAX_HISTORY = 60;

export class StrokeStore implements StrokeSink {
  strokes: Stroke[] = [];
  current: Stroke | null = null;
  /** Increments whenever committed strokes change. */
  version = 0;
  private nextId = 1;
  private listeners = new Set<() => void>();
  private history: Stroke[][] = [];
  private eraseSnapshot: Stroke[] | null = null;
  private erasedThisSession = false;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  private remember(snapshot: Stroke[]) {
    this.history.push(snapshot);
    if (this.history.length > MAX_HISTORY) this.history.shift();
  }

  get isEmpty(): boolean {
    return this.strokes.length === 0 && !this.current;
  }

  get count(): number {
    return this.strokes.length;
  }

  get canUndo(): boolean {
    return !!this.current || this.history.length > 0;
  }

  begin(p: PenPoint, source: StrokeSource = "air") {
    if (this.current) this.end();
    this.current = { id: this.nextId++, points: [p], source };
    this.emit();
  }

  add(p: PenPoint) {
    this.current?.points.push(p);
  }

  end(opts: EndOptions = {}) {
    const stroke = this.current;
    if (!stroke) return;
    this.current = null;
    const { trimAfter } = opts;
    if (trimAfter !== undefined) {
      const kept = stroke.points.filter((p) => p.t <= trimAfter);
      stroke.points = kept.length ? kept : stroke.points.slice(0, 1);
    }
    // Air strokes that barely moved are accidental (a twitch while acquiring or pinching).
    const accidental = stroke.source === "air" && stroke.points.length < 4 && pathLength(stroke.points) < 0.008;
    if (!accidental) {
      this.remember(this.strokes);
      this.strokes = [...this.strokes, stroke];
    }
    this.emit();
  }

  undo() {
    if (this.current) this.current = null;
    else {
      const previous = this.history.pop();
      if (previous) this.strokes = previous;
    }
    this.emit();
  }

  clear() {
    this.current = null;
    if (this.strokes.length) this.remember(this.strokes);
    this.strokes = [];
    this.emit();
  }

  /** Clear without an undo step (next visitor). */
  reset() {
    this.current = null;
    this.strokes = [];
    this.history = [];
    this.emit();
  }

  eraseBegin() {
    if (this.current) this.end();
    this.eraseSnapshot = this.strokes;
    this.erasedThisSession = false;
  }

  eraseSegment(a: { x: number; y: number }, b: { x: number; y: number }, radius: number, aspect: number) {
    // Work in canvas-height units so the eraser is round on screen.
    const ax = a.x * aspect;
    const bx = b.x * aspect;
    const r2 = radius * radius;
    const minX = Math.min(ax, bx) - radius;
    const maxX = Math.max(ax, bx) + radius;
    const minY = Math.min(a.y, b.y) - radius;
    const maxY = Math.max(a.y, b.y) + radius;
    const step = radius / 3;

    let changed = false;
    const next: Stroke[] = [];
    for (const s of this.strokes) {
      let hit = false;
      for (const p of s.points) {
        const px = p.x * aspect;
        if (px >= minX && px <= maxX && p.y >= minY && p.y <= maxY) {
          hit = true;
          break;
        }
      }
      if (!hit) {
        next.push(s);
        continue;
      }
      // Densify so the cut is clean even across long straight segments.
      const dense: PenPoint[] = [s.points[0]];
      for (let i = 1; i < s.points.length; i++) {
        const p0 = s.points[i - 1];
        const p1 = s.points[i];
        const n = Math.ceil(Math.hypot((p1.x - p0.x) * aspect, p1.y - p0.y) / step);
        for (let k = 1; k < n; k++) {
          const f = k / n;
          dense.push({ x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f, t: p0.t + (p1.t - p0.t) * f });
        }
        dense.push(p1);
      }
      const runs: PenPoint[][] = [];
      let run: PenPoint[] = [];
      let removed = false;
      for (const p of dense) {
        if (segDist2(p.x * aspect, p.y, ax, a.y, bx, b.y) <= r2) {
          removed = true;
          if (run.length) runs.push(run);
          run = [];
        } else run.push(p);
      }
      if (run.length) runs.push(run);
      if (!removed) {
        next.push(s);
        continue;
      }
      changed = true;
      for (const r of runs) {
        if (r.length >= 2 || s.points.length === 1) next.push({ id: this.nextId++, points: r, source: s.source });
      }
    }

    if (!changed) return;
    if (!this.erasedThisSession) {
      this.remember(this.eraseSnapshot ?? this.strokes);
      this.erasedThisSession = true;
    }
    this.strokes = next;
    this.emit();
  }

  eraseEnd() {
    this.eraseSnapshot = null;
    this.erasedThisSession = false;
  }

  /** Everything drawn, including the stroke in progress. */
  all(): Stroke[] {
    return this.current ? [...this.strokes, this.current] : this.strokes;
  }
}
