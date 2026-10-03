import type { Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import type { Transform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';
import type { BodyId, PhysicsWorld } from '../physics';
import type { PartyId } from './contact-ledger';

/**
 * Arena contents: everything the simulation tracks and Reset brings back.
 * Each kind of it (Strokes, Rubble, ...) is a module of its own behind the
 * shape below, and the Sandbox world runs the snapshot, rebuilding, Clear
 * and each step once over every kind, in one fixed order. Kinds never call
 * each other, and never decide a Material rule: a kind reports what
 * happened, the Material rules decide what follows, and the world wires
 * their decisions back to the kinds. What is visual only (Debris, Rubble
 * fading out, a Patch's puff) is the renderer's, drawn from the list of
 * what happened; it is not a kind. What is where is the Arena query's to
 * answer, from what Arena bodies holds: a kind never scans itself for it.
 */

/**
 * A body's surface in its own coordinates (px, relative to its origin,
 * unrotated): where a Patch can be laid on it.
 */
export type HostSurface =
  /** Polygon edges: an Object's Outline, or the Terrain's polygons. */
  | { readonly kind: 'polygons'; readonly polygons: readonly Polygon[] }
  /** The sides of connected capsules: a Piece. */
  | { readonly kind: 'capsules'; readonly segments: readonly Segment[]; readonly radius: number }
  /** A circle about the origin: Rubble. */
  | { readonly kind: 'circle'; readonly radius: number };

/**
 * One kind of Arena contents. It owns its records and their ids, which are
 * never reused, and keeps nothing for what is gone. It adds, slides and
 * removes its bodies, and the shapes it adds on others' bodies, only through
 * Arena bodies, also on restore.
 */
export interface Kind<Name extends string, Saved, Views> {
  /** Its key in `world.contents` and in the snapshot. */
  readonly name: Name;
  /**
   * What the renderer and the tests read. Only Arena contents, nothing visual
   * only, apart from each body's pose as the latest step began (`Poses`),
   * which R and Clear forget.
   */
  readonly views: Views;
  /** Its part of the snapshot. */
  save(): Saved;
  /** Adds its bodies again from its part of a snapshot, after `physics.reset()`, in a fixed order. */
  restore(saved: Saved): void;
  /** Forgets all of it: Clear, after Arena bodies has removed every body and shape. */
  clear(): void;
  /**
   * Hears which Parties went (broken, undone, removed, erased, capped or
   * vanished), its own too: whatever of it was attached to them goes. A
   * Party rebuilt on a new body under its id (a Line changing form) never
   * went, and it hears nothing of it. Arena
   * bodies tells every kind, in kind order, as each body goes, before the
   * removal returns, so it may hear this during any kind's turn, its own
   * included. It only forgets its own records and lets go of what they held,
   * and never calls back into anything. Clear tells none: every kind clears
   * itself.
   */
  gone(parties: ReadonlySet<PartyId>): void;
  /** Its turn in each step, after the Material rules and breaking. */
  step(seconds: number): void;
}

/**
 * A body's pose after the latest step, and as that step began: the renderer
 * draws it between the two. The two are the same for a body added since,
 * and for every body after a rebuild (a start or R) or Clear.
 */
export interface Poses {
  readonly transform: Transform;
  readonly previousTransform: Transform;
}

/** A body's pose and motion. */
export interface Motion {
  readonly transform: Transform;
  readonly velocity: Vec2;
  readonly angularVelocity: number;
}

export function motionOf(
  physics: Pick<PhysicsWorld, 'getTransform' | 'getVelocity' | 'getAngularVelocity'>,
  body: BodyId,
): Motion {
  return {
    transform: physics.getTransform(body),
    velocity: physics.getVelocity(body),
    angularVelocity: physics.getAngularVelocity(body),
  };
}
