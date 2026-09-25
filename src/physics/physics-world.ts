import type { Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import type { Transform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';

/**
 * The engine-neutral physics interface (ADR 0001). All units are Arena units:
 * pixels, y pointing down, seconds and radians. Engine adapters convert.
 */

/** Opaque handle to a body in a PhysicsWorld. */
export type BodyId = number & { readonly __brand: 'BodyId' };

export interface PhysicsWorldOptions {
  /** Gravity in px/s². */
  readonly gravity: Vec2;
  /** Fixed step length in seconds. */
  readonly timeStep: number;
  /** Approach speed (px/s) above which a moving body wakes a Frozen Object it hits. */
  readonly wakeSpeed: number;
}

export interface ObjectBodyDef {
  /** World position of the body's origin. */
  readonly position: Vec2;
  /** Convex pieces relative to the origin, together forming one rigid body. */
  readonly pieces: readonly Polygon[];
  /** Whether the Object starts Frozen: it collides but ignores gravity and doesn't move. */
  readonly frozen: boolean;
}

/** A contact reported by a step, with its impact strength. */
export interface ContactHit {
  readonly bodyA: BodyId;
  readonly bodyB: BodyId;
  readonly point: Vec2;
  /** Approach speed along the contact normal, px/s. */
  readonly speed: number;
}

export interface PhysicsWorld {
  readonly bodyCount: number;

  /** Adds fixed Terrain made of convex polygons in world coordinates. */
  addTerrain(polygons: readonly Polygon[]): BodyId;
  /** Adds a fixed Line: one capsule of the given thickness per segment, colliding from both sides. */
  addLine(segments: readonly Segment[], thickness: number): BodyId;
  /** Adds a movable Object. */
  addObject(def: ObjectBodyDef): BodyId;
  removeBody(id: BodyId): void;

  /**
   * Advances the simulation by one fixed step. A Frozen Object hit by a moving
   * body faster than `wakeSpeed` wakes, and the hit plays out as if it had
   * been free. Returns the step's contacts involving Objects.
   */
  step(): readonly ContactHit[];

  isFrozen(id: BodyId): boolean;
  /** Unfreezes an Object so it falls and moves freely. */
  release(id: BodyId): void;

  getTransform(id: BodyId): Transform;
  getVelocity(id: BodyId): Vec2;
  setVelocity(id: BodyId, velocity: Vec2): void;

  /** Frees the world. It must not be used afterwards. */
  destroy(): void;
}

export type PhysicsWorldFactory = (options: PhysicsWorldOptions) => PhysicsWorld;
