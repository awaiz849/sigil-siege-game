// One Euro filter (Casiez, Roussel & Vogel, 2012): smooths jitter when the hand is still,
// but follows quickly when it moves fast. One instance per coordinate.
//   minCutoff: lower = smoother when slow (more lag)
//   beta:      higher = less lag when fast

export class OneEuroFilter {
  private prevValue: number | null = null;
  private prevDeriv = 0;
  private prevTime = 0;

  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  constructor(minCutoff: number, beta: number, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  /** Filter one value. t is the time in seconds. */
  filter(value: number, t: number): number {
    if (this.prevValue === null) {
      this.prevValue = value;
      this.prevTime = t;
      return value;
    }
    const dt = Math.max(t - this.prevTime, 1e-3);
    this.prevTime = t;

    // Smoothed speed of the signal.
    const deriv = (value - this.prevValue) / dt;
    this.prevDeriv = lerp(this.prevDeriv, deriv, alpha(this.dCutoff, dt));

    // Faster movement -> higher cutoff -> less smoothing.
    const cutoff = this.minCutoff + this.beta * Math.abs(this.prevDeriv);
    this.prevValue = lerp(this.prevValue, value, alpha(cutoff, dt));
    return this.prevValue;
  }

  reset(): void {
    this.prevValue = null;
    this.prevDeriv = 0;
  }
}

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
