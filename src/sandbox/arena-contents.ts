import type { Circle } from '../geometry/overlap';
import type { Polygon } from '../geometry/polygon';
import type { Transform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';
import type { BodyId, PhysicsWorld } from '../physics';

/**
 * Arena contents: everything the simulation tracks and Reset brings back.
 * Each kind of it (Strokes, Rubble, ...) is a module of its own behind the
 * shape below, and the Sandbox world runs the snapshot, rebuilding, Clear
 * and each step once over every kind, in one fixed order. Kinds never call
 * each other: a kind reports what happened, and the world passes it on.
 * Debris is visual only and is not a kind.
 */

/** Shapes a new Object may not overlap, in world coordinates. */
export interface Solids {
  /** Solid bodies, each as its convex parts. */
  readonly polygons: readonly (readonly Polygon[])[];
  readonly circles: readonly Circle[];
}

/**
 * One kind of Arena contents. It owns its records and their ids, which are
 * never reused, and keeps nothing for what is gone. It registers each of its
 * bodies' Parties with the Contact ledger as it adds the body, also on
 * restore, and unregisters it as it removes the body.
 */
export interface Kind<Name extends string, Saved, Views> {
  /** Its key in `world.contents` and in the snapshot. */
  readonly name: Name;
  /** What the renderer and the tests read. Only Arena contents: nothing visual only. */
  readonly views: Views;
  /** Its part of the snapshot. */
  save(): Saved;
  /** Adds its bodies again from its part of a snapshot, after `physics.reset()`, in a fixed order. */
  restore(saved: Saved): void;
  /** Drops whatever of it is visual only, as R does with Debris. */
  dropVisuals(): void;
  /** Removes all of it. */
  clear(): void;
  /** What of it new Objects may not overlap. */
  solids(): Solids;
  /** Re-applies its surfaces after a material table edit. */
  applySurfaces(): void;
  /** Its turn in each step, after the Material rules and breaking. */
  step(seconds: number): void;
}

/** A body's pose and motion. */
export interface Motion {
  readonly transform: Transform;
  readonly velocity: Vec2;
  readonly angularVelocity: number;
}

export function motionOf(physics: PhysicsWorld, body: BodyId): Motion {
  return {
    transform: physics.getTransform(body),
    velocity: physics.getVelocity(body),
    angularVelocity: physics.getAngularVelocity(body),
  };
}
