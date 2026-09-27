import { between, type Transform } from '../../geometry/transform';
import { STEP_SECONDS, type Entry, type Poses } from '../../sandbox/sandbox-world';

/**
 * One kind of Arena contents as the World renderer draws it. It makes,
 * bakes again and frees its own drawings from the world's list of what
 * happened, and draws its things from their views each frame. The World
 * renderer hands it every entry and has it draw in a fixed order, the way
 * the Sandbox world runs its kinds.
 */
export interface DrawnKind {
  /**
   * Makes, bakes again or frees what one entry of the list says, if it is
   * about this kind; `now` is the world's time. Start over is not handed
   * on: the renderer drops every kind's drawings itself.
   */
  follow(entry: Entry, now: number): void;
  /**
   * Draws its things as the world has them now, `fraction` of the way from
   * their poses as the latest step began to their poses now.
   */
  draw(fraction: number, now: number): void;
  /** Frees every drawing it holds: start over, and when the renderer is destroyed. */
  dropAll(): void;
}

/** Where a body is drawn: `fraction` of the way from its previous pose to its pose now. */
export function drawn({ previousTransform, transform }: Poses, fraction: number): Transform {
  return between(previousTransform, transform, fraction);
}

/** Whole steps from `time` to `now`. */
export function stepsSince(time: number, now: number): number {
  return Math.max(0, Math.round((now - time) / STEP_SECONDS));
}
