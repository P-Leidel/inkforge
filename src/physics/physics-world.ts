import type { Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import type { Transform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';

/**
 * The engine-neutral physics interface (ADR 0001). All units are Arena units:
 * pixels, y pointing down, seconds and radians; masses are in the material
 * table's mass unit. Engine adapters convert.
 */

/** Opaque handle to a body in a PhysicsWorld. */
export type BodyId = number & { readonly __brand: 'BodyId' };

export interface PhysicsWorldOptions {
  /** Gravity in px/s². */
  readonly gravity: Vec2;
  /** Fixed step length in seconds. */
  readonly timeStep: number;
  /**
   * A hit wakes a Frozen Object when the collision, played out as if the
   * Object had been free, would set it moving faster than this (px/s): the
   * impulse it receives divided by its mass.
   */
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
  /** Its mass, spread evenly over the parts. It stays with the Object when it unfreezes. */
  readonly mass: number;
  /** Rotation about `position`, radians; 0 by default. */
  readonly angle?: number;
  /** Linear velocity, px/s, if it starts moving (not Frozen). */
  readonly velocity?: Vec2;
  /** Angular velocity, rad/s, if it starts moving (not Frozen). */
  readonly angularVelocity?: number;
}

/**
 * A movable circle (Rubble, Droplets). It never starts Frozen, and like an
 * Object it reports its hits.
 */
export interface CircleBodyDef {
  /** World position of its centre. */
  readonly position: Vec2;
  /** px. */
  readonly radius: number;
  readonly surface: Surface;
  readonly mass: number;
  /** Rotation, radians; 0 by default. */
  readonly angle?: number;
  /** Linear velocity, px/s. */
  readonly velocity?: Vec2;
  /** Angular velocity, rad/s. */
  readonly angularVelocity?: number;
  /** Circles of the same group (a positive number) never touch each other. None by default. */
  readonly group?: number;
  /** False if its hits never wake a Frozen Object (Droplets). True by default. */
  readonly wakes?: boolean;
  /**
   * True for continuous collision against moving bodies too, not only fixed
   * ones, so a small fast circle can't pass through a moving Object.
   */
  readonly bullet?: boolean;
}

/**
 * Opaque handle to one shape of a body: a part of an Object, a capsule of a
 * Line, a polygon of the Terrain. It stays the same when an Object's body is
 * rebuilt (Release, waking, slide-out).
 */
export type ShapeId = number & { readonly __brand: 'ShapeId' };

/** Opaque handle to a bond between two bodies. */
export type BondId = number & { readonly __brand: 'BondId' };

/**
 * Where a bond holds two bodies together: the bond's point on each, in the
 * body's own coordinates (px, relative to its origin, unrotated), and the
 * angle between them (B's angle minus A's) it keeps.
 */
export interface BondAnchors {
  readonly onA: Vec2;
  readonly onB: Vec2;
  readonly angle: number;
}

/** Two shapes touching, and the bodies they belong to. */
export interface ContactPair {
  readonly bodyA: BodyId;
  readonly bodyB: BodyId;
  readonly shapeA: ShapeId;
  readonly shapeB: ShapeId;
}

/** A hit reported by a step: two shapes meeting at speed. */
export interface ContactHit extends ContactPair {
  /** Where the collision acted as a whole. */
  readonly point: Vec2;
  /** Unit contact normal, from A towards B. */
  readonly normal: Vec2;
  /** Approach speed along the normal, px/s. */
  readonly speed: number;
  /**
   * The impact impulse (mass × px/s): the collision played out between the
   * two bodies at `point`, with their bounce, as the Frozen wake plays it.
   * Fixed and sliding bodies, and Frozen Objects the hit doesn't wake, count
   * as immovable; a Frozen Object it wakes counts with its mass. Moving
   * Objects and circles count with their mass.
   */
  readonly impulse: number;
}

/** What one step did to contacts. */
export interface StepReport {
  /** Every hit between shapes of which at least one belongs to an Object or a circle. */
  readonly hits: readonly ContactHit[];
  /** Pairs of shapes that started touching. */
  readonly begins: readonly ContactPair[];
  /** Pairs of shapes that stopped touching, also because a body was removed. */
  readonly ends: readonly ContactPair[];
}

export interface PhysicsWorld {
  readonly bodyCount: number;

  /** Adds fixed Terrain made of convex polygons in world coordinates. */
  addTerrain(polygons: readonly Polygon[], surface: Surface): BodyId;
  /** Adds a fixed Line: one capsule of the given thickness per segment, colliding from both sides. */
  addLine(segments: readonly Segment[], thickness: number, surface: Surface): BodyId;
  /** Adds a movable Object. */
  addObject(def: ObjectBodyDef): BodyId;
  /**
   * Adds a moving circle. It moves and hits like a moving Object, and its
   * hits can wake a Frozen Object. On flat ground it rolls to a stop, as a
   * pebble does, rather than rolling for ever.
   */
  addCircle(def: CircleBodyDef): BodyId;
  removeBody(id: BodyId): void;

  /**
   * Adds a capsule of `radius` around `segment`, given in the body's own
   * coordinates (px, relative to its origin, unrotated), to an existing body
   * (a Patch). It has no mass, so the body's mass stays as it is. It moves
   * with the body, stays through the body being rebuilt (Release, waking, a
   * slide), and goes with the body. Hits and contacts name it by its own id.
   */
  addCapsule(body: BodyId, segment: Segment, radius: number, surface: Surface): ShapeId;
  /**
   * Removes a shape `addCapsule` added; its contacts end with the next step.
   * Does nothing to one already gone with its body.
   */
  removeShape(id: ShapeId): void;
  /** Changes the surface of a shape `addCapsule` added, from the next step. */
  setShapeSurface(id: ShapeId, surface: Surface): void;

  /**
   * Advances the simulation by one fixed step. A Frozen Object hit hard
   * enough by a moving body (see `wakeSpeed`) wakes, and the hit plays out as
   * if it had been free. Reports the step's hits and the contacts that
   * began and ended.
   */
  step(): StepReport;

  /** Every pair of shapes touching now. */
  touchingPairs(): readonly ContactPair[];
  /**
   * Where two shapes that began touching in the last step touched as it
   * ended: the middle of their contact points. Null for any other pair.
   */
  touchPoint(pair: ContactPair): Vec2 | null;

  isFrozen(id: BodyId): boolean;
  /**
   * Whether a body moves freely: a moving Object or a circle. Terrain,
   * Lines, Frozen Objects and Objects sliding off a Line don't.
   */
  isFree(id: BodyId): boolean;
  /** Unfreezes an Object so it falls and moves freely. */
  release(id: BodyId): void;
  /**
   * Slides an Object, Frozen or moving, `displacement` px in a straight line
   * at `speed` px/s, passing through fixed bodies (Terrain, Lines) but
   * pushing moving ones, then lets it move freely from rest. A Frozen Object
   * is unfrozen.
   */
  slideOut(id: BodyId, displacement: Vec2, speed: number): void;

  /**
   * Changes the surface of a body's own shapes from the next step, not those
   * `addCapsule` added. It stays through rebuilds.
   */
  setSurface(id: BodyId, surface: Surface): void;
  /** Changes `wakeSpeed` from the next step. */
  setWakeSpeed(speed: number): void;
  /** Changes `minBounceSpeed` from the next step. */
  setMinBounceSpeed(speed: number): void;

  /** An Object's or a circle's mass. */
  getMass(id: BodyId): number;
  /**
   * Sets an Object's or a circle's mass, spread evenly over its own shapes
   * (not those `addCapsule` added). Never wakes a Frozen Object.
   */
  setMass(id: BodyId, mass: number): void;

  getTransform(id: BodyId): Transform;
  getVelocity(id: BodyId): Vec2;
  setVelocity(id: BodyId, velocity: Vec2): void;

  /**
   * The displacement (px) a sliding Object still has to go, or null if it
   * isn't sliding. Handing it to `slideOut` on a rebuilt world resumes the
   * slide.
   */
  getSlide(id: BodyId): Vec2 | null;

  /** Angular velocity, rad/s. */
  getAngularVelocity(id: BodyId): number;
  /** An Object's or a circle's rotational inertia about its centre of mass (mass × px²). */
  getInertia(id: BodyId): number;

  /**
   * Changes a free body's momentum by `impulse` (mass × px/s), applied at
   * its centre of mass, and wakes it if it sleeps. Does nothing to a body
   * that isn't free.
   */
  applyImpulse(id: BodyId, impulse: Vec2): void;
  /** Changes a free body's angular momentum by `impulse` (mass × px² / s), like `applyImpulse`. */
  applyAngularImpulse(id: BodyId, impulse: number): void;

  /**
   * Holds two bodies together as they are, with a rigid joint at `anchors`
   * (green sticking, the one runtime joint of ADR 0003). The two stop
   * touching each other. The bond lasts through either body being rebuilt
   * (Release, waking, a slide), and a slide carries it along: when either
   * body is rebuilt, the bond holds the two as they are then. It goes when
   * either body is removed.
   */
  addBond(a: BodyId, b: BodyId, anchors: BondAnchors): BondId;
  /** Where a bond holds its bodies now; null once it is gone. */
  getBond(id: BondId): BondAnchors | null;
  /** Lets two bodies go. Does nothing to a bond already gone. */
  removeBond(id: BondId): void;

  /**
   * Removes every body and starts again from a fresh engine state, as if the
   * world had just been created. A world rebuilt after a reset plays out the
   * same as one built the same way after any other reset.
   */
  reset(): void;

  /** Frees the world. It must not be used afterwards. */
  destroy(): void;
}

export type PhysicsWorldFactory = (options: PhysicsWorldOptions) => PhysicsWorld;
