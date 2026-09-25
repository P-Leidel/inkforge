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
  /** Contacts approaching slower than this (px/s) don't bounce, whatever their restitution. */
  readonly minBounceSpeed: number;
}

/**
 * How a shape's surface meets others. A contact bounces with the larger
 * restitution of its two surfaces and grips with the geometric mean of their
 * frictions, so anything bouncy bounces off anything.
 */
export interface Surface {
  /** Coulomb friction coefficient. */
  readonly friction: number;
  /** Bounciness, 0 to below 1. */
  readonly restitution: number;
}

export interface ObjectBodyDef {
  /** World position of the body's origin. */
  readonly position: Vec2;
  /** Convex parts relative to the origin, together forming one rigid body. */
  readonly parts: readonly Polygon[];
  /** Whether the Object starts Frozen: it collides but ignores gravity and doesn't move. */
  readonly frozen: boolean;
  /** The surface of every part. It stays with the Object when it unfreezes. */
  readonly surface: Surface;
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
  addTerrain(polygons: readonly Polygon[], surface: Surface): BodyId;
  /** Adds a fixed Line: one capsule of the given thickness per segment, colliding from both sides. */
  addLine(segments: readonly Segment[], thickness: number, surface: Surface): BodyId;
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
  /**
   * Unfreezes an Object by sliding it `displacement` px in a straight line at
   * `speed` px/s, passing through fixed bodies (Terrain, Lines) but pushing
   * moving ones, then lets it move freely from rest.
   */
  slideOut(id: BodyId, displacement: Vec2, speed: number): void;

  getTransform(id: BodyId): Transform;
  getVelocity(id: BodyId): Vec2;
  setVelocity(id: BodyId, velocity: Vec2): void;

  /** Frees the world. It must not be used afterwards. */
  destroy(): void;
}

export type PhysicsWorldFactory = (options: PhysicsWorldOptions) => PhysicsWorld;
