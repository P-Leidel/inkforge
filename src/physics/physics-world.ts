import type { Bounds, Polygon } from '../geometry/polygon';
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

/**
 * A body's own shapes, in its own coordinates (px, relative to its origin,
 * unrotated).
 */
export type BodyShapes =
  /** Convex polygons, together forming one rigid body. */
  | { readonly kind: 'polygons'; readonly polygons: readonly Polygon[] }
  /**
   * One capsule of `radius` around each segment, colliding from both sides:
   * a fixed Line's Piece, or a moving Line that isn't Grounded.
   */
  | { readonly kind: 'capsules'; readonly segments: readonly Segment[]; readonly radius: number }
  /**
   * A circle about the origin. On flat ground it rolls to a stop, as a
   * pebble does, rather than rolling for ever.
   */
  | { readonly kind: 'circle'; readonly radius: number };

/**
 * How a moving body moves. A body without one is fixed (the Terrain, a
 * Line): it never moves and has no mass.
 */
export interface BodyMotion {
  /** Its mass, spread evenly over its own shapes. It stays when it unfreezes. */
  readonly mass: number;
  /** Linear velocity, px/s, if it starts moving (not Frozen). */
  readonly velocity?: Vec2;
  /** Angular velocity, rad/s, if it starts moving (not Frozen). */
  readonly angularVelocity?: number;
  /**
   * True if it starts Frozen (an Object): it collides but ignores gravity and
   * doesn't move until a hit wakes it, `release` or `slideOut`. False by
   * default.
   */
  readonly frozen?: boolean;
  /** True if its hits can wake a Frozen body (Objects, Rubble). False by default. */
  readonly wakes?: boolean;
  /** True if it never rotates, however it is hit (an Enemy). False by default. */
  readonly upright?: boolean;
  /** True if it can be pushed along by `applyForce` (an Enemy). False by default. */
  readonly driven?: boolean;
  /**
   * True for continuous collision against moving bodies too, not only fixed
   * ones, so a small fast body can't pass through a moving Object. False by
   * default.
   */
  readonly bullet?: boolean;
}

/** A body, described once: its shapes, and what it does. */
export interface BodyDef {
  readonly shapes: BodyShapes;
  /** The surface of every shape. It stays with the body when it unfreezes. */
  readonly surface: Surface;
  /** World position of the body's origin; the world origin by default. */
  readonly position?: Vec2;
  /** Rotation about `position`, radians; 0 by default. */
  readonly angle?: number;
  /** How it moves; none for a fixed body. */
  readonly motion?: BodyMotion;
  /**
   * True if its shapes, and those `addCapsule` adds to it, report hits
   * (Objects, Rubble, Droplets, Enemies). A hit is reported when either
   * shape reports them. False by default.
   */
  readonly reportsHits?: boolean;
  /** Bodies of the same group (a positive number) never touch each other. None by default. */
  readonly group?: number;
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

/** Two shapes touching now, and which way they face each other. */
export interface TouchingPair extends ContactPair {
  /** Unit contact normal, from A towards B. */
  readonly normal: Vec2;
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

/** A body near a point, measured to the nearest of its own shapes. */
export interface NearBody {
  readonly body: BodyId;
  /** Its point nearest the query's centre, px; the centre itself if that is inside it. */
  readonly point: Vec2;
  /** How far `point` is from the centre, px: 0 if the centre is inside it. */
  readonly distance: number;
}

/** One of a body's own shapes near a point, measured to its nearest point. */
export interface NearShape extends NearBody {
  readonly shape: ShapeId;
}

/** A shape, and the body it belongs to. */
export interface BodyShape {
  readonly body: BodyId;
  readonly shape: ShapeId;
}

/** What one step did to contacts. */
export interface StepReport {
  /** Every hit between shapes of which at least one reports hits. */
  readonly hits: readonly ContactHit[];
  /** Pairs of shapes that started touching. */
  readonly begins: readonly ContactPair[];
  /** Pairs of shapes that stopped touching, also because a body was removed. */
  readonly ends: readonly ContactPair[];
}

export interface PhysicsWorld {
  readonly bodyCount: number;

  /**
   * Adds a body as `def` describes it. A moving body falls and hits; a
   * Frozen one is held until a hit wakes it (see `wakeSpeed`), `release`
   * or `slideOut`.
   */
  addBody(def: BodyDef): BodyId;
  removeBody(id: BodyId): void;

  /** A body's own shapes' ids, one per polygon, capsule or circle, in order. */
  shapesOf(id: BodyId): readonly ShapeId[];
  /**
   * Removes some of a body's own shapes for good (a Piece breaking off a
   * moving Line); at least one must stay. A moving body keeps its density,
   * so its mass drops with them. Their contacts end with the next step.
   */
  removeOwnShapes(id: BodyId, shapes: readonly ShapeId[]): void;

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
   * Advances the simulation by one fixed step. A Frozen body hit hard
   * enough by a moving body that wakes (see `wakeSpeed`) wakes, and the hit plays out as
   * if it had been free. Reports the step's hits and the contacts that
   * began and ended.
   */
  step(): StepReport;

  /** Every pair of shapes touching now, with its normal. */
  touchingPairs(): readonly TouchingPair[];
  /**
   * The unit contact normal of two shapes touching now, from `pair.shapeA`
   * towards `pair.shapeB`; null if they don't touch now. It changes as
   * they move: read it when it is needed.
   */
  touchNormal(pair: ContactPair): Vec2 | null;
  /**
   * Every body, of any kind, with one of its own shapes (not those
   * `addCapsule` added) within `radius` px of `centre`, measured to that
   * shape's nearest point. In no particular order.
   */
  bodiesWithin(centre: Vec2, radius: number): NearBody[];
  /**
   * Every body's own shape (not one `addCapsule` added) within `radius` px
   * of `centre`, measured to its nearest point: like `bodiesWithin`, but
   * one entry per shape. In no particular order.
   */
  shapesWithin(centre: Vec2, radius: number): NearShape[];
  /**
   * Every shape, a body's own or one `addCapsule` added, whose box may
   * overlap `bounds` (px): the engine's broadphase. Its boxes are a little
   * larger than the shapes, so it names every shape whose bounds overlap
   * `bounds`, and maybe some that only come near. In no particular order.
   */
  shapesNear(bounds: Bounds): BodyShape[];
  /**
   * Where two shapes that began touching in the last step touched as it
   * ended: the middle of their contact points. Null for any other pair.
   */
  touchPoint(pair: ContactPair): Vec2 | null;

  isFrozen(id: BodyId): boolean;
  /**
   * Whether a body moves freely: a moving body that isn't Frozen or sliding
   * off a Line. Fixed bodies (Terrain, Lines) don't.
   */
  isFree(id: BodyId): boolean;
  /** Unfreezes a Frozen body so it falls and moves freely. */
  release(id: BodyId): void;
  /**
   * Slides a moving body (an Object), Frozen or not, `displacement` px in a straight line
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

  /** A moving body's mass. */
  getMass(id: BodyId): number;
  /**
   * Sets a moving body's mass, spread evenly over its own shapes
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
  /**
   * A moving body's rotational inertia about its centre of mass (mass × px²),
   * as if it could rotate: an upright body never does.
   */
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
   * Pushes a driven body with `force` (mass × px/s²) at its centre of mass
   * through the next step, and wakes it if it sleeps. Forces added before a
   * step add up; the step uses them up. Does nothing to a driven body that
   * isn't free; throws for a body that isn't driven.
   */
  applyForce(id: BodyId, force: Vec2): void;

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
