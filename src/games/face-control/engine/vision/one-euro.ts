/**
 * 1€ filter (Casiez, Roussel & Vogel, CHI 2012).
 *
 * An adaptive low-pass filter: heavy smoothing while the signal is still
 * (removes landmark jitter), almost no lag while it moves quickly. A fixed
 * moving average can only trade jitter for lag; the 1€ filter gets both,
 * which is what makes head steering feel calm *and* responsive.
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
    public minCutoff = 1.2,
    public beta = 0.05,
    private readonly dCutoff = 1.5,
  ) {}

  /** @param tSec timestamp in seconds */
  filter(value: number, tSec: number): number {
    if (this.x === null || this.raw === null || this.lastT < 0) {
      this.x = value;
      this.raw = value;
      this.dx = 0;
      this.lastT = tSec;
      return value;
    }
    const dt = Math.min(0.2, Math.max(1e-3, tSec - this.lastT));
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
