/**
 * One Euro filter (Casiez, Roussel & Vogel, CHI 2012).
 * Heavy smoothing when the finger is slow (kills jitter), light smoothing when
 * it moves fast (kills lag). Exactly the trade-off air-writing needs.
 */
function alpha(dtSeconds: number, cutoffHz: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSeconds);
}

export class OneEuroFilter {
  minCutoff: number;
  beta: number;
  dCutoff: number;
  private x: number | null = null;
  private dx = 0;
  private lastT: number | null = null;

  constructor(minCutoff = 1, beta = 0, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  reset() {
    this.x = null;
    this.dx = 0;
    this.lastT = null;
  }

  filter(value: number, tMs: number): number {
    if (this.x === null || this.lastT === null) {
      this.x = value;
      this.lastT = tMs;
      return value;
    }
    const dt = Math.max((tMs - this.lastT) / 1000, 1 / 240);
    this.lastT = tMs;
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(dt, this.dCutoff) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(dt, cutoff) * (value - this.x);
    return this.x;
  }
}

export class PointFilter {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;

  constructor(minCutoff: number, beta: number) {
    this.fx = new OneEuroFilter(minCutoff, beta);
    this.fy = new OneEuroFilter(minCutoff, beta);
  }

  configure(minCutoff: number, beta: number) {
    this.fx.minCutoff = this.fy.minCutoff = minCutoff;
    this.fx.beta = this.fy.beta = beta;
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
  }

  filter(x: number, y: number, tMs: number) {
    return { x: this.fx.filter(x, tMs), y: this.fy.filter(y, tMs) };
  }
}
