/**
 * Seeded pseudo-random generator (mulberry32). All randomness in the
 * simulation comes from here, so runs with the same seed are repeatable.
 */
export class Random {
  private current: number;

  constructor(seed: number) {
    this.current = seed >>> 0;
  }

  /** A float in [0, 1). */
  next(): number {
    this.current = (this.current + 0x6d2b79f5) >>> 0;
    let t = this.current;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** The generator's position in its sequence, to come back to later. */
  get state(): number {
    return this.current;
  }

  set state(state: number) {
    this.current = state >>> 0;
  }

  /** A float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
}
