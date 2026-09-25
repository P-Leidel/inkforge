import type { ObjectView } from '../sandbox/sandbox-world';

/** Below this speed (px/s) a body counts as still. */
const STILL_SPEED = 2;
/** Bodies must stay still this long (s) to count as settled. */
const STILL_FOR = 0.25;

export function speedOf(object: ObjectView): number {
  return Math.hypot(object.velocity.x, object.velocity.y);
}

/** Watches a group of bodies and notes when they first come to rest together. */
export class SettleWatch {
  private stillSince: number | null = null;
  /** Simulated time at which the bodies settled, or null. */
  settledAt: number | null = null;

  update(objects: readonly ObjectView[], time: number): void {
    if (this.settledAt !== null) return;
    if (!objects.every((o) => speedOf(o) < STILL_SPEED)) {
      this.stillSince = null;
      return;
    }
    this.stillSince ??= time;
    if (time - this.stillSince >= STILL_FOR) this.settledAt = this.stillSince;
  }
}
