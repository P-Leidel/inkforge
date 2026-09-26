/**
 * Frame times since a scene started, for the Demolition scene's exit
 * criterion (60 fps on average, no frame over 33 ms): the average fps and
 * the longest frame. The first frame after each start is left out, since it
 * carries the work of building or rebuilding the scene, not of playing it.
 */
export class FrameTimes {
  private count = 0;
  private totalMs = 0;
  private longest = 0;
  private skipNext = true;

  /** Forgets every frame so far and starts counting again. */
  restart(): void {
    this.count = 0;
    this.totalMs = 0;
    this.longest = 0;
    this.skipNext = true;
  }

  /** Counts one frame that took `ms` milliseconds. */
  frame(ms: number): void {
    if (this.skipNext) {
      this.skipNext = false;
      return;
    }
    this.count++;
    this.totalMs += ms;
    this.longest = Math.max(this.longest, ms);
  }

  /** Frames counted since the start. */
  get frames(): number {
    return this.count;
  }

  /** Frames counted ÷ the seconds they took; null before the first. */
  get averageFps(): number | null {
    return this.count > 0 && this.totalMs > 0 ? (this.count * 1000) / this.totalMs : null;
  }

  /** The longest frame counted, ms; null before the first. */
  get longestMs(): number | null {
    return this.count > 0 ? this.longest : null;
  }
}
