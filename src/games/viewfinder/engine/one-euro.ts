/**
 * 1€ filter (Casiez, Roussel & Vogel, CHI 2012).
 *
 * An adaptive low-pass: heavy smoothing when the hand is still (kills
 * landmark jitter), near-zero lag when it moves fast. This is the key to a
 * frame that feels glued to the fingers instead of floaty — a fixed EMA can
 * only trade jitter for lag, the 1€ filter gets both.
 */
const alpha = (dt: number, cutoff: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private raw: number | null = null;
  private lastT = -1;

  constructor(
    private readonly minCutoff = 1.2,
    private readonly beta = 0.012,
    private readonly dCutoff = 2.0,
  ) {}

  filter(value: number, tSec: number): number {
    if (this.x === null || this.raw === null || this.lastT < 0) {
      this.x = value;
      this.raw = value;
      this.dx = 0;
      this.lastT = tSec;
      return value;
    }
    const dt = Math.min(0.1, Math.max(1e-3, tSec - this.lastT));
    this.lastT = tSec;
    const rawDx = (value - this.raw) / dt;
    this.raw = value;
    this.dx += alpha(dt, this.dCutoff) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(dt, cutoff) * (value - this.x);
    return this.x;
  }

  reset() {
    this.x = null;
    this.raw = null;
    this.dx = 0;
    this.lastT = -1;
  }
}

export class OneEuroFilter2D {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;

  constructor(minCutoff?: number, beta?: number, dCutoff?: number) {
    this.fx = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  filter(x: number, y: number, tSec: number) {
    return { x: this.fx.filter(x, tSec), y: this.fy.filter(y, tSec) };
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
  }
}
