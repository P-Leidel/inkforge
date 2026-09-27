import {
  b2AABB,
  b2Body_ApplyAngularImpulse,
  b2Body_ApplyForceToCenter,
  b2Body_ApplyLinearImpulse,
  b2Body_ApplyLinearImpulseToCenter,
  b2Body_ApplyMassFromShapes,
  b2Body_GetAngularDamping,
  b2Body_GetAngularVelocity,
  b2Body_GetContactData,
  b2Body_GetInertiaTensor,
  b2Body_GetJointCount,
  b2Body_GetLinearVelocity,
  b2Body_GetMass,
  b2Body_GetPosition,
  b2Body_GetRotation,
  b2Body_GetShapes,
  b2Body_GetType,
  b2Body_GetUserData,
  b2Body_GetWorldCenterOfMass,
  b2Body_IsBullet,
  b2Body_IsFixedRotation,
  b2Body_SetAngularVelocity,
  b2Body_SetLinearVelocity,
  b2BodyType,
  b2Capsule,
  b2Circle,
  b2ComputeHull,
  b2ComputePolygonMass,
  b2ContactData,
  b2CreateBody,
  b2CreateCapsuleShape,
  b2CreateCircleShape,
  b2CreatePolygonShape,
  b2CreateWeldJoint,
  b2CreateWorld,
  b2CreateWorldArray,
  b2DefaultBodyDef,
  b2DefaultQueryFilter,
  b2DefaultShapeDef,
  b2DefaultWeldJointDef,
  b2DefaultWorldDef,
  b2DestroyBody,
  b2DestroyJoint,
  b2DestroyShape,
  b2DestroyWorld,
  b2MakePolygon,
  b2MakeRot,
  b2Rot_GetAngle,
  b2Shape_AreHitEventsEnabled,
  b2Shape_GetBody,
  b2Shape_GetContactData,
  b2Shape_GetDensity,
  b2Shape_GetFilter,
  b2Shape_GetFriction,
  b2Shape_GetRestitution,
  b2Shape_GetUserData,
  b2Shape_SetDensity,
  b2Shape_SetFriction,
  b2Shape_SetRestitution,
  b2Vec2,
  b2World_GetContactEvents,
  b2World_IsValid,
  b2World_OverlapAABB,
  b2World_SetRestitutionThreshold,
  b2World_Step,
  type b2BodyId,
  type b2JointId,
  type b2Polygon,
  type b2Rot,
  type b2ShapeId,
  type b2WorldId,
} from 'phaser-box2d/dist/PhaserBox2D.js';
import { polygonContainsPoint, type Polygon } from '../../geometry/polygon';
import { closestParameterOnSegment, type Segment } from '../../geometry/segment';
import type { Transform } from '../../geometry/transform';
import type { Vec2 } from '../../geometry/vec2';
import type {
  BodyDef,
  BodyId,
  BodyShape,
  BodyShapes,
  BondAnchors,
  BondId,
  ContactHit,
  ContactPair,
  NearBody,
  PhysicsWorld,
  PhysicsWorldOptions,
  ShapeId,
  Surface,
  TouchingPair,
} from '../physics-world';

/**
 * Box2D works in metres and is tuned for moving bodies of 0.1–10 m. At 50 px
 * per metre the Arena is 38.4 × 21.6 m and a 20 px Object is 0.4 m.
 */
const PX_PER_METRE = 50;
const SUB_STEPS = 4;
/**
 * Stiffness of contacts (Hz). At Box2D's default, 30, things that land
 * hard stay sunk into each other for several frames: 41 pairs of the 100
 * Pebbles more than 2 px deep at once. At 45 it is 25, and a tower of
 * boxes still settles as fast; stiffer still, the tower rocks for seconds.
 */
const CONTACT_HERTZ = 45;
/** Hit events are reported above this speed; we decide about waking ourselves. */
const HIT_EVENT_THRESHOLD_PX = 5;
/**
 * Angular damping (1/s) of circles. Box2D has no rolling resistance, so
 * without it a circle on flat ground would roll for ever; damping its spin
 * slows the roll through friction, and a pebble comes to rest.
 */
const CIRCLE_ANGULAR_DAMPING = 3;

const toM = (px: number) => px / PX_PER_METRE;
const toPx = (m: number) => m * PX_PER_METRE;
const toB2 = (p: Vec2) => new b2Vec2(toM(p.x), toM(p.y));

/** The mass of a body's shapes at density 1, in metres: what its density scales. */
interface UnitMass {
  readonly area: number;
  /** Centre of mass in body coordinates. */
  readonly centre: b2Vec2;
  /** Rotational inertia about the centre of mass. */
  readonly inertia: number;
}

const NO_MASS: UnitMass = { area: 0, centre: new b2Vec2(0, 0), inertia: 0 };

/** A capsule `addCapsule` added to a body: no mass, its own surface. */
interface AddedCapsule {
  readonly segment: Segment;
  readonly radius: number;
  surface: Surface;
}

/**
 * Everything a body carries, apart from its pose and motion, which the
 * engine holds. Box2D can't unfreeze a fixed body, so Release, a wake and
 * the start and end of a slide replace the engine's body with a new one:
 * creating a body and rebuilding it both build it from this, and
 * `setSurface`, `setShapeSurface` and `setMass` change it here as they
 * change the engine. Nothing is carried over from the old body by hand.
 */
interface BodyDescription {
  readonly own: BodyShapes;
  /** Its own shapes' ids, one per polygon, capsule or circle; they stay through rebuilds. */
  readonly shapes: readonly ShapeId[];
  /** The surface of its own shapes: a copy, so editing the one it was given changes nothing. */
  surface: Surface;
  /** Mass per m², the same over its own shapes; 1 on fixed bodies, which have no mass. */
  density: number;
  /** Whether it moves; a fixed body never does. */
  readonly moves: boolean;
  /** Whether its shapes, its own and added, report hits. */
  readonly reportsHits: boolean;
  /** Whether its hits can wake a Frozen body. */
  readonly wakes: boolean;
  /** Whether it never rotates. */
  readonly upright: boolean;
  /** Whether `applyForce` can push it. */
  readonly driven: boolean;
  /** Angular damping, 1/s. */
  readonly angularDamping: number;
  /** Continuous collision against moving bodies too, not only fixed ones. */
  readonly bullet: boolean;
  /** Its own shapes' collision group: bodies of the same group never touch. 0 for none. */
  readonly group: number;
  /** The capsules `addCapsule` added to it, oldest first, each with its own surface. */
  readonly added: Map<ShapeId, AddedCapsule>;
  /** Its bonds, oldest first. */
  readonly bonds: Set<BondId>;
}

/** A body: its description, and the engine's body built from it. */
interface BodyRecord extends BodyDescription {
  b2Id: b2BodyId;
  frozen: boolean;
  /** The mass of its own shapes at density 1. */
  readonly unit: UnitMass;
  /** What a moving body was created with, to read back exactly while the engine still holds it. */
  placed?: Placement;
}

/** A shape `addCapsule` added: the body it is on, and the engine's shape. */
interface AddedShape {
  readonly body: BodyId;
  b2Id: b2ShapeId;
}

/** A copy of a surface: the material table's are edited in place. */
const copySurface = (surface: Surface): Surface => ({
  friction: surface.friction,
  restitution: surface.restitution,
});

/**
 * A moving body's transform and velocity in px as it was created, and the
 * engine's copy of them. Converting to the engine and back isn't exact to
 * the last bit (an angle becomes a cosine and sine), so while the engine
 * still holds exactly what it was given, the body reports what it was
 * given: a world rebuilt from a snapshot then snapshots the same again,
 * and R, Space replays exactly.
 */
interface Placement {
  readonly transform: Transform;
  readonly velocity: Vec2;
  /** The engine's position, rotation and velocity: x, y, cos, sin, vx, vy. */
  readonly engine: readonly number[];
}

/** Mass properties of a body taking part in a collision, in metres. */
interface Inertial {
  readonly invMass: number;
  readonly invInertia: number;
  /** Centre of mass in world coordinates. */
  readonly centre: b2Vec2;
}

function createB2World(options: PhysicsWorldOptions): b2WorldId {
  b2CreateWorldArray(); // no-op after the first call
  const def = b2DefaultWorldDef();
  def.gravity = toB2(options.gravity);
  def.hitEventThreshold = toM(HIT_EVENT_THRESHOLD_PX);
  def.restitutionThreshold = toM(options.minBounceSpeed);
  def.enableContinuous = true;
  def.contactHertz = CONTACT_HERTZ;
  return b2CreateWorld(def);
}

/*
 * Phaser Box2D 1.1.0's b2DestroyWorld never frees the world's slot, so a
 * process could only ever create 32 worlds. scripts/patch-phaser-box2d.mjs
 * fixes that on install; without it, Reset would soon run out of worlds.
 */
function destroyB2World(worldId: b2WorldId): void {
  b2DestroyWorld(worldId);
  if (b2World_IsValid(worldId)) {
    throw new Error(
      'phaser-box2d is not patched: run `npm install` (scripts/patch-phaser-box2d.mjs)',
    );
  }
}

/** Two bodies held together by a weld joint. */
interface BondRecord {
  readonly a: BodyId;
  readonly b: BodyId;
  anchors: BondAnchors;
  joint: b2JointId;
}

/** An angle in -π..π, as the engine measures one body's angle relative to another's. */
function unwind(angle: number): number {
  if (angle > Math.PI) return angle - 2 * Math.PI;
  if (angle < -Math.PI) return angle + 2 * Math.PI;
  return angle;
}

/** A slide in progress: an Object moving off a Line at a set velocity. */
interface Slide {
  /** Seconds of sliding left. */
  remaining: number;
  /** m/s. */
  readonly velocity: b2Vec2;
}

/** What the engine holds for a body, read back. */
export interface EngineBody {
  readonly type: 'fixed' | 'kinematic' | 'moving';
  /** Its origin, px, and its angle. */
  readonly transform: Transform;
  readonly bullet: boolean;
  readonly angularDamping: number;
  /** Whether it never rotates. */
  readonly upright: boolean;
  /** Its shapes, its own and those `addCapsule` added, by id. */
  readonly shapes: readonly EngineShape[];
  /** How many joints (bonds) hold it. */
  readonly joints: number;
}

export interface EngineShape {
  readonly id: ShapeId;
  readonly friction: number;
  readonly restitution: number;
  readonly density: number;
  readonly groupIndex: number;
  readonly hitEvents: boolean;
}

const engineReaders = new WeakMap<PhysicsWorld, (id: BodyId) => EngineBody>();

/**
 * Reads back what the engine holds for a body of a world this adapter made,
 * for tests: that a rebuild loses nothing, that a surface is the body's own.
 */
export function readEngineBody(world: PhysicsWorld, id: BodyId): EngineBody {
  const read = engineReaders.get(world);
  if (!read) throw new Error('Not a Box2D physics world');
  return read(id);
}

export function createBox2dPhysicsWorld(initialOptions: PhysicsWorldOptions): PhysicsWorld {
  /** The options, some of which can be changed while the world runs. */
  const options: { -readonly [K in keyof PhysicsWorldOptions]: PhysicsWorldOptions[K] } = {
    ...initialOptions,
  };
  let worldId = createB2World(options);
  const bodies = new Map<BodyId, BodyRecord>();
  /** Objects sliding out of Lines. */
  const sliding = new Map<BodyId, Slide>();
  /** Shape pairs touching now, by `pairKey`. */
  const touching = new Map<string, ContactPair>();
  /**
   * The normal of each pair in `touching`, from its A towards its B, as it
   * was last seen: the engine forgets a rebuilt body's contacts until the
   * next step, while they still touch.
   */
  const lastNormals = new Map<string, Vec2>();
  /** Contacts ended between steps (a body removed), for the next report. */
  let pendingEnds: ContactPair[] = [];
  /** Where each shape pair that began touching in the last step touched, by `pairKey`. */
  const beginPoints = new Map<string, Vec2>();
  const bonds = new Map<BondId, BondRecord>();
  let nextBondId = 1;
  /** Every shape `addCapsule` added, on bodies still there; their descriptions are their bodies'. */
  const added = new Map<ShapeId, AddedShape>();
  /**
   * Bodies rebuilt since the last step. The engine forgets their contacts
   * without an end event and reports them beginning again, so their pairs
   * are checked against the engine after the next step.
   */
  const rebuilt = new Set<BodyId>();
  let nextId = 1;
  let nextShapeId = 1;
  let destroyed = false;

  function record(id: BodyId): BodyRecord {
    const rec = bodies.get(id);
    if (!rec) throw new Error(`Unknown body ${id}`);
    return rec;
  }

  function makeB2Body(
    id: BodyId,
    description: BodyDescription,
    type: number,
    position: b2Vec2,
    rotation?: b2Rot,
  ): b2BodyId {
    const def = b2DefaultBodyDef();
    def.type = type;
    def.position = position;
    if (rotation) def.rotation = rotation;
    def.angularDamping = description.angularDamping;
    def.isBullet = description.bullet;
    def.fixedRotation = description.upright;
    def.userData = id;
    return b2CreateBody(worldId, def);
  }

  /** New ids for `count` shapes. */
  function newShapeIds(count: number): ShapeId[] {
    return Array.from({ length: count }, () => nextShapeId++ as ShapeId);
  }

  /** A new body's description, from its definition: its own shapes with new ids. */
  function describe(def: BodyDef, unit: UnitMass): BodyDescription {
    const { shapes: own, motion } = def;
    const count =
      own.kind === 'polygons'
        ? own.polygons.length
        : own.kind === 'capsules'
          ? own.segments.length
          : 1;
    return {
      own,
      shapes: newShapeIds(count),
      surface: copySurface(def.surface),
      density: motion ? (unit.area > 0 ? motion.mass / unit.area : 0) : 1,
      moves: motion !== undefined,
      reportsHits: def.reportsHits ?? false,
      wakes: motion?.wakes ?? false,
      upright: motion?.upright ?? false,
      driven: motion?.driven ?? false,
      angularDamping: own.kind === 'circle' ? CIRCLE_ANGULAR_DAMPING : 0,
      bullet: motion?.bullet ?? false,
      group: def.group ?? 0,
      added: new Map(),
      bonds: new Set(),
    };
  }

  /** The mass of a body's own shapes at density 1; none for a fixed body. */
  function unitMassOfDef(def: BodyDef): UnitMass {
    if (!def.motion) return NO_MASS;
    const { shapes } = def;
    switch (shapes.kind) {
      case 'polygons':
        return unitMassOf(shapes.polygons);
      case 'circle':
        return unitMassOfCircle(shapes.radius);
      case 'capsules':
        throw new Error('A moving body of capsules is not supported');
    }
  }

  /** Creates a body from its description, of `type`, at `position` and `rotation`. */
  function createBody(
    description: BodyDescription,
    unit: UnitMass,
    type: number,
    position: b2Vec2,
    rotation?: b2Rot,
  ): { id: BodyId; rec: BodyRecord } {
    const id = nextId++ as BodyId;
    const rec: BodyRecord = {
      ...description,
      b2Id: makeB2Body(id, description, type, position, rotation),
      frozen: description.moves && type === b2BodyType.b2_staticBody,
      unit,
    };
    bodies.set(id, rec);
    attach(rec);
    return { id, rec };
  }

  /**
   * Gives a (new) engine body all that its description attaches to it: its
   * own shapes, the capsules added to it, then its bonds. The order is part
   * of replay order.
   */
  function attach(rec: BodyRecord): void {
    addOwnShapes(rec);
    for (const [id, capsule] of rec.added) added.get(id)!.b2Id = createAddedShape(rec, id, capsule);
    for (const bond of rec.bonds) reweld(bonds.get(bond)!);
  }

  function shapeDef(shape: ShapeId, surface: Surface, hitEvents: boolean, density: number) {
    const def = b2DefaultShapeDef();
    def.userData = shape;
    def.density = density;
    def.friction = surface.friction;
    def.restitution = surface.restitution;
    def.enableHitEvents = hitEvents;
    return def;
  }

  /**
   * A convex part as a Box2D polygon, or null if it is too thin or small for
   * Box2D to represent; the Stroke pipeline keeps those rare.
   */
  function makePolygon(polygon: Polygon): b2Polygon | null {
    const points = polygon.map(toB2);
    const hull = b2ComputeHull(points, points.length);
    return hull.count >= 3 ? b2MakePolygon(hull, 0) : null;
  }

  function makeCapsule(segment: Segment, radius: number): b2Capsule {
    const capsule = new b2Capsule();
    capsule.center1 = toB2(segment.a);
    capsule.center2 = toB2(segment.b);
    capsule.radius = toM(radius);
    return capsule;
  }

  /** Creates a body's own shapes on its (new) engine body. */
  function addOwnShapes(rec: BodyRecord): void {
    const def = (k: number) => {
      const def = shapeDef(rec.shapes[k]!, rec.surface, rec.reportsHits, rec.density);
      if (rec.group) def.filter.groupIndex = -rec.group;
      return def;
    };
    const { own } = rec;
    switch (own.kind) {
      case 'polygons':
        own.polygons.forEach((polygon, k) => {
          const b2Polygon = makePolygon(polygon);
          if (b2Polygon) b2CreatePolygonShape(rec.b2Id, def(k), b2Polygon);
        });
        return;
      case 'capsules':
        own.segments.forEach((segment, k) =>
          b2CreateCapsuleShape(rec.b2Id, def(k), makeCapsule(segment, own.radius)),
        );
        return;
      case 'circle':
        b2CreateCircleShape(rec.b2Id, def(0), new b2Circle(new b2Vec2(0, 0), toM(own.radius)));
    }
  }

  /**
   * Creates a capsule `addCapsule` added on its body's (new) engine body. It
   * has no density, so the body's mass stays as it is, and it reports hits
   * as the body's own shapes do. On a fixed body it finds what already
   * overlaps it at once.
   */
  function createAddedShape(rec: BodyRecord, id: ShapeId, capsule: AddedCapsule): b2ShapeId {
    const def = shapeDef(id, capsule.surface, rec.reportsHits, 0);
    def.forceContactCreation = true;
    return b2CreateCapsuleShape(rec.b2Id, def, makeCapsule(capsule.segment, capsule.radius));
  }

  /** A body's own shapes in the engine, leaving out those `addCapsule` added. */
  function ownShapes(rec: BodyRecord): b2ShapeId[] {
    const shapes: b2ShapeId[] = [];
    const count = b2Body_GetShapes(rec.b2Id, shapes);
    return shapes
      .slice(0, count)
      .filter((shape) => !rec.added.has(b2Shape_GetUserData(shape) as ShapeId));
  }

  /** A circle's mass at density 1, about its centre. */
  function unitMassOfCircle(radius: number): UnitMass {
    const r = toM(radius);
    const area = Math.PI * r * r;
    return { area, centre: new b2Vec2(0, 0), inertia: 0.5 * area * r * r };
  }

  function unitMassOf(parts: readonly Polygon[]): UnitMass {
    let area = 0;
    let cx = 0;
    let cy = 0;
    let inertiaAboutOrigin = 0;
    for (const part of parts) {
      const shape = makePolygon(part);
      if (!shape) continue;
      const mass = b2ComputePolygonMass(shape, 1);
      area += mass.mass;
      cx += mass.mass * mass.center.x;
      cy += mass.mass * mass.center.y;
      inertiaAboutOrigin += mass.rotationalInertia;
    }
    if (area === 0) return NO_MASS;
    cx /= area;
    cy /= area;
    const inertia = inertiaAboutOrigin - area * (cx * cx + cy * cy);
    return { area, centre: new b2Vec2(cx, cy), inertia };
  }

  function bodyIdOfShape(shapeId: b2ShapeId): BodyId {
    return b2Body_GetUserData(b2Shape_GetBody(shapeId)) as BodyId;
  }

  const pairKey = (a: ShapeId, b: ShapeId) => (a < b ? `${a} ${b}` : `${b} ${a}`);

  /** The pair two engine shapes make, ordered as the engine gives them. */
  function pairOf(shapeIdA: b2ShapeId, shapeIdB: b2ShapeId): ContactPair {
    return {
      bodyA: bodyIdOfShape(shapeIdA),
      bodyB: bodyIdOfShape(shapeIdB),
      shapeA: b2Shape_GetUserData(shapeIdA) as ShapeId,
      shapeB: b2Shape_GetUserData(shapeIdB) as ShapeId,
    };
  }

  const contactBuffer = Array.from({ length: 64 }, () => new b2ContactData());

  /**
   * Brings `touching` up to date with the step's begin and end events.
   * Returns the pairs that really began and ended: a rebuilt body's contacts
   * begin again in the engine without having ended.
   */
  function trackContacts(): { begins: ContactPair[]; ends: ContactPair[] } {
    const events = b2World_GetContactEvents(worldId);
    const begins: ContactPair[] = [];
    const ends = pendingEnds;
    pendingEnds = [];
    beginPoints.clear();
    for (const event of events.endEvents) {
      const pair = pairOf(event.shapeIdA, event.shapeIdB);
      const key = pairKey(pair.shapeA, pair.shapeB);
      if (untouch(key)) ends.push(pair);
    }
    for (const event of events.beginEvents) {
      const pair = pairOf(event.shapeIdA, event.shapeIdB);
      const key = pairKey(pair.shapeA, pair.shapeB);
      const { manifold } = event;
      const seen = touching.get(key);
      if (seen) {
        // A rebuilt body's contact beginning again.
        const flip = seen.shapeA === pair.shapeA ? 1 : -1;
        lastNormals.set(key, { x: flip * manifold.normalX, y: flip * manifold.normalY });
        continue;
      }
      touching.set(key, pair);
      lastNormals.set(key, { x: manifold.normalX, y: manifold.normalY });
      begins.push(pair);
      if (manifold.pointCount === 0) continue;
      let x = 0;
      let y = 0;
      for (let k = 0; k < manifold.pointCount; k++) {
        x += manifold.points[k]!.pointX;
        y += manifold.points[k]!.pointY;
      }
      beginPoints.set(key, { x: toPx(x / manifold.pointCount), y: toPx(y / manifold.pointCount) });
    }
    if (rebuilt.size > 0) {
      const still = new Set<string>();
      for (const id of rebuilt) {
        const rec = bodies.get(id);
        if (!rec) continue;
        const count = b2Body_GetContactData(rec.b2Id, contactBuffer, contactBuffer.length);
        for (let i = 0; i < count; i++) {
          const { shapeIdA, shapeIdB } = contactBuffer[i]!;
          still.add(
            pairKey(
              b2Shape_GetUserData(shapeIdA) as ShapeId,
              b2Shape_GetUserData(shapeIdB) as ShapeId,
            ),
          );
        }
      }
      for (const [key, pair] of touching) {
        if (!rebuilt.has(pair.bodyA) && !rebuilt.has(pair.bodyB)) continue;
        if (still.has(key)) continue;
        untouch(key);
        ends.push(pair);
      }
      rebuilt.clear();
    }
    return { begins, ends };
  }

  interface Motion {
    readonly v: b2Vec2;
    readonly w: number;
  }

  /** A hit that wakes a Frozen Object, to be replayed after the step. */
  interface Wake {
    readonly hitter: BodyId;
    /** The hitter's motion before the step. */
    readonly motion: Motion;
    readonly point: b2Vec2;
    /** From the hitter towards the Frozen Object. */
    readonly normal: b2Vec2;
    /** Impulse of the free collision. */
    readonly j: number;
    /** Speed (m/s) the collision sets the Frozen Object moving at. */
    readonly push: number;
  }

  /** Whether a body can move: a moving body that isn't Frozen. */
  function movable(rec: BodyRecord): boolean {
    return rec.moves && !rec.frozen;
  }

  /** Velocities of moving bodies before the step, to replay a waking hit. */
  function snapshotMotion(): Map<BodyId, Motion> {
    const motion = new Map<BodyId, Motion>();
    for (const [id, rec] of bodies) {
      if (movable(rec)) {
        motion.set(id, {
          v: b2Body_GetLinearVelocity(rec.b2Id),
          w: b2Body_GetAngularVelocity(rec.b2Id),
        });
      }
    }
    return motion;
  }

  /*
   * Phaser Box2D 1.1.0's b2Body_SetType never moves a fixed body into the
   * simulated set (it tests b2BodyType.staticBody, which doesn't exist), so a
   * Frozen Object is unfrozen by replacing its fixed body with a dynamic one
   * of the same shape and pose. A slide replaces an Object's body with a
   * kinematic one the same way, and the new body starts at rest.
   */
  function rebuild(id: BodyId, rec: BodyRecord, type: number = b2BodyType.b2_dynamicBody): void {
    rec.frozen = false;
    rebuilt.add(id);
    // The getters return the body's live transform, which destroying the body
    // may reset, so copy the pose first.
    const p = b2Body_GetPosition(rec.b2Id);
    const position = new b2Vec2(p.x, p.y);
    const rotation = b2MakeRot(b2Rot_GetAngle(b2Body_GetRotation(rec.b2Id)));
    // Destroying the body destroys its shapes and joints too.
    b2DestroyBody(rec.b2Id);
    rec.b2Id = makeB2Body(id, rec, type, position, rotation);
    attach(rec);
  }

  /**
   * Welds a bond's two bodies together at its anchors. The engine destroys
   * the contacts between them, and the end events it makes for them are
   * lost at the next step's start, so they are reported with the next step.
   */
  function weld(a: BodyId, b: BodyId, anchors: BondAnchors): b2JointId {
    const def = b2DefaultWeldJointDef();
    def.bodyIdA = record(a).b2Id;
    def.bodyIdB = record(b).b2Id;
    def.localAnchorA = toB2(anchors.onA);
    def.localAnchorB = toB2(anchors.onB);
    def.referenceAngle = unwind(anchors.angle);
    def.collideConnected = false;
    const joint = b2CreateWeldJoint(worldId, def);
    for (const [key, pair] of touching) {
      const between =
        (pair.bodyA === a && pair.bodyB === b) || (pair.bodyA === b && pair.bodyB === a);
      if (!between) continue;
      untouch(key);
      pendingEnds.push(pair);
    }
    return joint;
  }

  /**
   * Welds a bond's bodies again after one was rebuilt, holding them as they
   * are now: its point stays where it is on A, and moves on B, as a slide
   * carries one body away from the other.
   */
  function reweld(bond: BondRecord): void {
    const a = record(bond.a).b2Id;
    const b = record(bond.b).b2Id;
    const pa = b2Body_GetPosition(a);
    const qa = b2Body_GetRotation(a);
    const pb = b2Body_GetPosition(b);
    const qb = b2Body_GetRotation(b);
    const ox = toM(bond.anchors.onA.x);
    const oy = toM(bond.anchors.onA.y);
    const dx = pa.x + qa.c * ox - qa.s * oy - pb.x;
    const dy = pa.y + qa.s * ox + qa.c * oy - pb.y;
    bond.anchors = {
      onA: bond.anchors.onA,
      onB: { x: toPx(qb.c * dx + qb.s * dy), y: toPx(-qb.s * dx + qb.c * dy) },
      angle: Math.atan2(qb.s * qa.c - qb.c * qa.s, qb.c * qa.c + qb.s * qa.s),
    };
    bond.joint = weld(bond.a, bond.b, bond.anchors);
  }

  /** Advances sliding Objects; one that has arrived becomes dynamic, at rest. */
  function advanceSlides(): void {
    for (const [id, slide] of sliding) {
      const rec = record(id);
      const { remaining } = slide;
      if (remaining > 1e-9) {
        if (remaining < options.timeStep) {
          // Shorten the last step so the slide ends exactly where it should.
          const k = remaining / options.timeStep;
          b2Body_SetLinearVelocity(
            rec.b2Id,
            new b2Vec2(slide.velocity.x * k, slide.velocity.y * k),
          );
        }
        slide.remaining = remaining - options.timeStep;
        continue;
      }
      sliding.delete(id);
      rebuild(id, rec, b2BodyType.b2_dynamicBody);
    }
  }

  function massOf(rec: BodyRecord): number {
    return rec.density * rec.unit.area;
  }

  /** A moving body's mass properties, from the engine. */
  function movingInertial(rec: BodyRecord): Inertial {
    // An upright body has no rotational inertia in the engine: it can't turn.
    const inertia = b2Body_GetInertiaTensor(rec.b2Id);
    return {
      invMass: 1 / b2Body_GetMass(rec.b2Id),
      invInertia: inertia > 0 ? 1 / inertia : 0,
      centre: b2Body_GetWorldCenterOfMass(rec.b2Id),
    };
  }

  /**
   * A Frozen Object's mass properties as a free body. The engine gives a fixed
   * body none, so they come from its shapes and density.
   */
  function frozenInertial(rec: BodyRecord): Inertial {
    const p = b2Body_GetPosition(rec.b2Id);
    const q = b2Body_GetRotation(rec.b2Id);
    const c = rec.unit.centre;
    return {
      invMass: 1 / massOf(rec),
      invInertia: rec.upright ? 0 : 1 / (rec.density * rec.unit.inertia),
      centre: new b2Vec2(p.x + q.c * c.x - q.s * c.y, p.y + q.s * c.x + q.c * c.y),
    };
  }

  /**
   * The impulse (along `normal`) of a collision between a moving body and a
   * body at rest, both free, bouncing with `restitution` as the engine would.
   */
  function collisionImpulse(
    hitter: Inertial,
    motion: Motion,
    target: Inertial,
    point: b2Vec2,
    normal: b2Vec2, // from the hitter towards the target
    restitution: number,
  ): number {
    const rh = { x: point.x - hitter.centre.x, y: point.y - hitter.centre.y };
    // Velocity of the hitter at the contact point.
    const vx = motion.v.x - motion.w * rh.y;
    const vy = motion.v.y + motion.w * rh.x;
    const approach = vx * normal.x + vy * normal.y;
    return impactImpulse(approach, [hitter, target], point, normal, restitution);
  }

  /**
   * The impulse that stops two bodies approaching at `approach` m/s along
   * `normal` at `point` and bounces them apart with `restitution`: the
   * approach over the pair's effective inverse mass there. A null side is
   * immovable.
   */
  function impactImpulse(
    approach: number,
    sides: readonly (Inertial | null)[],
    point: b2Vec2,
    normal: b2Vec2,
    restitution: number,
  ): number {
    if (approach <= 0) return 0;
    let k = 0;
    for (const side of sides) {
      if (!side) continue;
      const rn = (point.x - side.centre.x) * normal.y - (point.y - side.centre.y) * normal.x;
      k += side.invMass + side.invInertia * rn * rn;
    }
    if (k === 0) return 0;
    const bounce = approach >= toM(options.minBounceSpeed) ? restitution : 0;
    return ((1 + bounce) * approach) / k;
  }

  /** A body's mass properties in a hit, or null if it can't be moved by one. */
  function hitInertial(rec: BodyRecord): Inertial | null {
    if (!movable(rec)) return null;
    if (b2Body_GetType(rec.b2Id) !== b2BodyType.b2_dynamicBody) return null; // sliding
    return movingInertial(rec);
  }

  /**
   * Where the collision between two shapes acted as a whole: their contact
   * points weighted by the impulse each took. A box hitting another face-on
   * touches at two corners and acts at the middle of the face, not at one
   * corner. The contacts are read from the moving side's shape: a fixed
   * shape, such as the ground under a Rubble pile, can have more than the
   * buffer holds.
   */
  function contactCentre(first: b2ShapeId, second: b2ShapeId, fallback: b2Vec2): b2Vec2 {
    const fixed = b2Body_GetType(b2Shape_GetBody(first)) === b2BodyType.b2_staticBody;
    const [shapeA, shapeB] = fixed ? [second, first] : [first, second];
    const count = b2Shape_GetContactData(shapeA, contactBuffer, contactBuffer.length);
    for (let i = 0; i < count; i++) {
      const { shapeIdA, shapeIdB, manifold } = contactBuffer[i]!;
      const other = shapeIdA.index1 === shapeA.index1 ? shapeIdB : shapeIdA;
      if (other.index1 !== shapeB.index1) continue;
      let x = 0;
      let y = 0;
      let total = 0;
      for (let k = 0; k < manifold.pointCount; k++) {
        const point = manifold.points[k]!;
        x += point.maxNormalImpulse * point.pointX;
        y += point.maxNormalImpulse * point.pointY;
        total += point.maxNormalImpulse;
      }
      return total > 0 ? new b2Vec2(x / total, y / total) : fallback;
    }
    return fallback;
  }

  /**
   * Wakes a Frozen Object and replays the hit as a collision between two free
   * bodies. During the step the Frozen Object acted like a wall, so the
   * hitter was stopped; we restore the hitter's velocity from before the step
   * and apply the impulse `j` a free collision produces instead.
   */
  function wakeByHit(frozenId: BodyId, wake: Wake): void {
    const frozen = record(frozenId);
    const hitter = record(wake.hitter);
    rebuild(frozenId, frozen);
    b2Body_SetLinearVelocity(hitter.b2Id, wake.motion.v);
    b2Body_SetAngularVelocity(hitter.b2Id, wake.motion.w);
    const { point, normal, j } = wake;
    b2Body_ApplyLinearImpulse(hitter.b2Id, new b2Vec2(-j * normal.x, -j * normal.y), point, true);
    b2Body_ApplyLinearImpulse(frozen.b2Id, new b2Vec2(j * normal.x, j * normal.y), point, true);
  }

  /**
   * The point of one of a body's own shapes nearest `target`, px: `target`
   * itself if it is inside. Measured on the shape as it was described, not
   * by the engine's `b2Shape_GetClosestPoint`, whose port gives wrong points
   * where the nearest part of a shape is the middle of an edge.
   */
  function closestPoint(rec: BodyRecord, shape: ShapeId, target: Vec2): Vec2 | null {
    const k = rec.shapes.indexOf(shape);
    if (k < 0) return null;
    const p = b2Body_GetPosition(rec.b2Id);
    const q = b2Body_GetRotation(rec.b2Id);
    const place = ({ x, y }: Vec2): Vec2 => ({
      x: toPx(p.x) + q.c * x - q.s * y,
      y: toPx(p.y) + q.s * x + q.c * y,
    });
    const { own } = rec;
    switch (own.kind) {
      case 'polygons':
        return closestOnPolygon(own.polygons[k]!.map(place), target);
      case 'capsules': {
        const { a, b } = own.segments[k]!;
        return closestOnRound(closestOnSegment(place(a), place(b), target), own.radius, target);
      }
      case 'circle':
        return closestOnRound(place({ x: 0, y: 0 }), own.radius, target);
    }
  }

  function engineState(b2Id: b2BodyId): number[] {
    const p = b2Body_GetPosition(b2Id);
    const q = b2Body_GetRotation(b2Id);
    const v = b2Body_GetLinearVelocity(b2Id);
    return [p.x, p.y, q.c, q.s, v.x, v.y];
  }

  /** Whether the engine still holds exactly what a body was placed with, in `engine[from..to)`. */
  function stillPlaced(rec: BodyRecord, placed: Placement, from: number, to: number): boolean {
    const now = engineState(rec.b2Id);
    for (let k = from; k < to; k++) if (now[k] !== placed.engine[k]) return false;
    return true;
  }

  /**
   * Sets a new body moving and records its Placement: the pose it was made
   * with and, if it moves, its velocity.
   */
  function place(
    rec: BodyRecord,
    pose: { readonly position: Vec2; readonly angle?: number },
    motion: { readonly velocity?: Vec2; readonly angularVelocity?: number },
  ): void {
    if (motion.velocity) b2Body_SetLinearVelocity(rec.b2Id, toB2(motion.velocity));
    if (motion.angularVelocity) b2Body_SetAngularVelocity(rec.b2Id, motion.angularVelocity);
    rec.placed = {
      transform: { x: pose.position.x, y: pose.position.y, angle: pose.angle ?? 0 },
      velocity: motion.velocity ?? { x: 0, y: 0 },
      engine: engineState(rec.b2Id),
    };
  }

  /** Forgets a bond, on both its bodies. */
  function forgetBond(id: BondId): void {
    const bond = bonds.get(id);
    if (!bond) return;
    bonds.delete(id);
    bodies.get(bond.a)?.bonds.delete(id);
    bodies.get(bond.b)?.bonds.delete(id);
  }

  /** The engine's shape for one of a body's shapes, its own or added; null if it has none. */
  function engineShape(rec: BodyRecord, shape: ShapeId): b2ShapeId | null {
    const addedShape = added.get(shape);
    if (addedShape) return addedShape.b2Id;
    const shapes: b2ShapeId[] = [];
    const count = b2Body_GetShapes(rec.b2Id, shapes);
    for (let k = 0; k < count; k++) {
      if (b2Shape_GetUserData(shapes[k]!) === shape) return shapes[k]!;
    }
    return null;
  }

  /** Stops tracking a pair as touching; true if it was. */
  function untouch(key: string): boolean {
    lastNormals.delete(key);
    return touching.delete(key);
  }

  /**
   * The contact normal of two shapes touching now, from A towards B: the
   * engine's, or the last seen while the engine has forgotten a rebuilt
   * body's contact. The contacts are read from a moving side's shape: a
   * fixed shape, such as the ground under a Rubble pile, can have more than
   * the buffer holds.
   */
  function touchNormal(pair: ContactPair): Vec2 | null {
    const key = pairKey(pair.shapeA, pair.shapeB);
    const tracked = touching.get(key);
    if (!tracked) return null;
    const flip = tracked.shapeA === pair.shapeA ? 1 : -1;
    const live = engineNormal(tracked);
    if (live) lastNormals.set(key, live);
    const normal = live ?? lastNormals.get(key);
    return normal ? { x: flip * normal.x, y: flip * normal.y } : null;
  }

  /** The engine's normal of a pair touching now, from A towards B; null if it has none. */
  function engineNormal(pair: ContactPair): Vec2 | null {
    const recA = bodies.get(pair.bodyA);
    const recB = bodies.get(pair.bodyB);
    if (!recA || !recB) return null;
    const fixedA = b2Body_GetType(recA.b2Id) === b2BodyType.b2_staticBody;
    const [rec, shape] = fixedA ? [recB, pair.shapeB] : [recA, pair.shapeA];
    const b2Shape = engineShape(rec, shape);
    if (!b2Shape) return null;
    const count = b2Shape_GetContactData(b2Shape, contactBuffer, contactBuffer.length);
    for (let i = 0; i < count; i++) {
      const { shapeIdA, shapeIdB, manifold } = contactBuffer[i]!;
      if (manifold.pointCount === 0) continue;
      const idA = b2Shape_GetUserData(shapeIdA) as ShapeId;
      const idB = b2Shape_GetUserData(shapeIdB) as ShapeId;
      // The manifold normal points from the contact's A to its B.
      if (idA === pair.shapeA && idB === pair.shapeB) {
        return { x: manifold.normalX, y: manifold.normalY };
      }
      if (idA === pair.shapeB && idB === pair.shapeA) {
        return { x: -manifold.normalX, y: -manifold.normalY };
      }
    }
    return null;
  }

  function clearContacts(): void {
    touching.clear();
    lastNormals.clear();
    rebuilt.clear();
    pendingEnds = [];
    beginPoints.clear();
    bonds.clear();
    nextBondId = 1;
    added.clear();
  }

  const world: PhysicsWorld = {
    get bodyCount() {
      return bodies.size;
    },

    addBody(def) {
      // A Frozen body is a fixed body: it collides but never moves, and
      // fixed bodies don't touch each other, so Frozen bodies never wake
      // each other and Lines or Terrain never wake them.
      const { motion } = def;
      const type = !motion || motion.frozen ? b2BodyType.b2_staticBody : b2BodyType.b2_dynamicBody;
      const unit = unitMassOfDef(def);
      const position = def.position ?? { x: 0, y: 0 };
      const { id, rec } = createBody(
        describe(def, unit),
        unit,
        type,
        toB2(position),
        b2MakeRot(def.angle ?? 0),
      );
      if (motion) place(rec, { position, angle: def.angle }, motion.frozen ? {} : motion);
      return id;
    },

    removeBody(id) {
      const rec = record(id);
      b2DestroyBody(rec.b2Id);
      bodies.delete(id);
      sliding.delete(id);
      rebuilt.delete(id);
      for (const shape of rec.added.keys()) added.delete(shape);
      // Its joints went with it.
      for (const bondId of rec.bonds) forgetBond(bondId);
      // The engine's end events for these are lost at the next step's start.
      for (const [key, pair] of touching) {
        if (pair.bodyA !== id && pair.bodyB !== id) continue;
        untouch(key);
        pendingEnds.push(pair);
      }
    },

    addCapsule(body, segment, radius, surface) {
      const rec = record(body);
      const id = nextShapeId++ as ShapeId;
      const capsule = { segment, radius, surface: copySurface(surface) };
      rec.added.set(id, capsule);
      added.set(id, { body, b2Id: createAddedShape(rec, id, capsule) });
      return id;
    },

    removeShape(id) {
      const shape = added.get(id);
      if (!shape) return;
      added.delete(id);
      record(shape.body).added.delete(id);
      b2DestroyShape(shape.b2Id);
      // The engine's end events for these are lost at the next step's start.
      for (const [key, pair] of touching) {
        if (pair.shapeA !== id && pair.shapeB !== id) continue;
        untouch(key);
        pendingEnds.push(pair);
      }
    },

    setShapeSurface(id, surface) {
      const shape = added.get(id);
      if (!shape) return;
      const capsule = record(shape.body).added.get(id)!;
      capsule.surface = copySurface(surface);
      b2Shape_SetFriction(shape.b2Id, capsule.surface.friction);
      b2Shape_SetRestitution(shape.b2Id, capsule.surface.restitution);
    },

    step() {
      const hasFrozen = [...bodies.values()].some((rec) => rec.frozen);
      const before = hasFrozen ? snapshotMotion() : new Map<BodyId, Motion>();

      advanceSlides();
      b2World_Step(worldId, options.timeStep, SUB_STEPS);
      const { begins, ends } = trackContacts();

      const hits: ContactHit[] = [];
      const wakes = new Map<BodyId, Wake>();
      // Each hit on a Frozen Object, with the impulse it has between two free bodies.
      const onFrozen: { k: number; frozen: BodyId; hitter: BodyId; j: number }[] = [];
      for (const event of b2World_GetContactEvents(worldId).hitEvents) {
        const pair = pairOf(event.shapeIdA, event.shapeIdB);
        const a = pair.bodyA;
        const b = pair.bodyB;
        const recA = record(a);
        const recB = record(b);
        const hitPoint = new b2Vec2(event.pointX, event.pointY);
        const point = contactCentre(event.shapeIdA, event.shapeIdB, hitPoint);
        // The manifold normal points from A to B.
        const normal = new b2Vec2(event.normalX, event.normalY);
        const restitution = Math.max(
          b2Shape_GetRestitution(event.shapeIdA),
          b2Shape_GetRestitution(event.shapeIdB),
        );
        const impulse = impactImpulse(
          event.approachSpeed,
          [hitInertial(recA), hitInertial(recB)],
          point,
          normal,
          restitution,
        );
        hits.push({
          ...pair,
          point: { x: toPx(point.x), y: toPx(point.y) },
          normal: { x: normal.x, y: normal.y },
          speed: toPx(event.approachSpeed),
          impulse: toPx(impulse),
        });

        const sides: [BodyId, BodyId, number][] = [
          [b, a, 1],
          [a, b, -1],
        ];
        for (const [frozenId, hitterId, sign] of sides) {
          const frozen = bodies.get(frozenId);
          const hitter = bodies.get(hitterId);
          if (!frozen?.frozen || !hitter?.wakes) continue;
          if (b2Body_GetType(hitter.b2Id) !== b2BodyType.b2_dynamicBody) continue;
          const motion = before.get(hitterId);
          if (!motion) continue;
          const towards = new b2Vec2(sign * normal.x, sign * normal.y);
          const target = frozenInertial(frozen);
          const j = collisionImpulse(
            movingInertial(hitter),
            motion,
            target,
            point,
            towards,
            restitution,
          );
          onFrozen.push({ k: hits.length - 1, frozen: frozenId, hitter: hitterId, j });
          const push = j * target.invMass;
          if (toPx(push) <= options.wakeSpeed) continue;
          const current = wakes.get(frozenId);
          if (current && current.push >= push) continue;
          wakes.set(frozenId, { hitter: hitterId, motion, point, normal: towards, j, push });
        }
      }
      for (const [frozenId, wake] of wakes) wakeByHit(frozenId, wake);
      // A woken Object's hits with its hitter played out between two free
      // bodies, on every pair of their shapes that hit.
      for (const { k, frozen, hitter, j } of onFrozen) {
        if (wakes.get(frozen)?.hitter === hitter) hits[k] = { ...hits[k]!, impulse: toPx(j) };
      }
      return { hits, begins, ends };
    },

    touchingPairs() {
      const pairs: TouchingPair[] = [];
      for (const pair of touching.values()) {
        const normal = touchNormal(pair);
        if (normal) pairs.push({ ...pair, normal });
      }
      return pairs;
    },

    touchNormal,

    bodiesWithin(centre, radius) {
      const c = toB2(centre);
      const r = toM(radius);
      const nearest = new Map<BodyId, NearBody>();
      // The query tests fat bounding boxes only; the distance is measured
      // to each shape.
      const box = new b2AABB(c.x - r, c.y - r, c.x + r, c.y + r);
      b2World_OverlapAABB(
        worldId,
        box,
        b2DefaultQueryFilter(),
        (shape) => {
          const id = b2Shape_GetUserData(shape) as ShapeId;
          if (added.has(id)) return true;
          const body = bodyIdOfShape(shape);
          const point = closestPoint(record(body), id, centre);
          if (!point) return true;
          const distance = Math.hypot(point.x - centre.x, point.y - centre.y);
          if (distance > radius) return true;
          const current = nearest.get(body);
          if (!current || distance < current.distance) {
            nearest.set(body, { body, point, distance });
          }
          return true;
        },
        null,
      );
      return [...nearest.values()];
    },

    shapesNear({ minX, minY, maxX, maxY }) {
      const found: BodyShape[] = [];
      const box = new b2AABB(toM(minX), toM(minY), toM(maxX), toM(maxY));
      b2World_OverlapAABB(
        worldId,
        box,
        b2DefaultQueryFilter(),
        (shape) => {
          found.push({ body: bodyIdOfShape(shape), shape: b2Shape_GetUserData(shape) as ShapeId });
          return true;
        },
        null,
      );
      return found;
    },

    touchPoint(pair) {
      return beginPoints.get(pairKey(pair.shapeA, pair.shapeB)) ?? null;
    },

    isFrozen(id) {
      return record(id).frozen;
    },

    isFree(id) {
      return movable(record(id)) && !sliding.has(id);
    },

    release(id) {
      const rec = record(id);
      if (rec.frozen) rebuild(id, rec);
    },

    slideOut(id, displacement, speed) {
      const rec = record(id);
      const distance = Math.hypot(displacement.x, displacement.y);
      sliding.delete(id);
      if (distance === 0 || speed <= 0) {
        rebuild(id, rec);
        return;
      }
      // A kinematic body moves at a set velocity and passes through fixed bodies.
      rebuild(id, rec, b2BodyType.b2_kinematicBody);
      const k = speed / distance;
      const velocity = toB2({ x: displacement.x * k, y: displacement.y * k });
      b2Body_SetLinearVelocity(rec.b2Id, velocity);
      sliding.set(id, { remaining: distance / speed, velocity });
    },

    getSlide(id) {
      const slide = sliding.get(id);
      if (!slide) return null;
      const t = Math.max(0, slide.remaining);
      return { x: toPx(slide.velocity.x * t), y: toPx(slide.velocity.y * t) };
    },

    setSurface(id, surface) {
      const rec = record(id);
      rec.surface = copySurface(surface);
      for (const shape of ownShapes(rec)) {
        b2Shape_SetFriction(shape, rec.surface.friction);
        b2Shape_SetRestitution(shape, rec.surface.restitution);
      }
    },

    setWakeSpeed(speed) {
      options.wakeSpeed = speed;
    },

    setMinBounceSpeed(speed) {
      options.minBounceSpeed = speed;
      b2World_SetRestitutionThreshold(worldId, toM(speed));
    },

    getMass(id) {
      return massOf(record(id));
    },

    setMass(id, mass) {
      const rec = record(id);
      rec.density = rec.unit.area > 0 ? mass / rec.unit.area : 0;
      // A fixed body has no mass; a Frozen Object gets its density when it unfreezes.
      if (rec.frozen) return;
      for (const shape of ownShapes(rec)) b2Shape_SetDensity(shape, rec.density);
      b2Body_ApplyMassFromShapes(rec.b2Id);
    },

    getTransform(id): Transform {
      const rec = record(id);
      if (rec.placed && stillPlaced(rec, rec.placed, 0, 4)) return rec.placed.transform;
      const p = b2Body_GetPosition(rec.b2Id);
      return { x: toPx(p.x), y: toPx(p.y), angle: b2Rot_GetAngle(b2Body_GetRotation(rec.b2Id)) };
    },

    getVelocity(id) {
      const rec = record(id);
      if (rec.placed && stillPlaced(rec, rec.placed, 4, 6)) return rec.placed.velocity;
      const v = b2Body_GetLinearVelocity(rec.b2Id);
      return { x: toPx(v.x), y: toPx(v.y) };
    },

    getAngularVelocity(id) {
      return b2Body_GetAngularVelocity(record(id).b2Id);
    },

    getInertia(id) {
      const rec = record(id);
      return rec.density * rec.unit.inertia * PX_PER_METRE ** 2;
    },

    applyImpulse(id, impulse) {
      if (!world.isFree(id)) return;
      b2Body_ApplyLinearImpulseToCenter(record(id).b2Id, toB2(impulse), true);
    },

    applyAngularImpulse(id, impulse) {
      if (!world.isFree(id)) return;
      b2Body_ApplyAngularImpulse(record(id).b2Id, impulse / PX_PER_METRE ** 2, true);
    },

    applyForce(id, force) {
      if (!record(id).driven) throw new Error(`Body ${id} is not driven`);
      if (!world.isFree(id)) return;
      b2Body_ApplyForceToCenter(record(id).b2Id, toB2(force), true);
    },

    addBond(a, b, anchors) {
      const id = nextBondId++ as BondId;
      bonds.set(id, { a, b, anchors, joint: weld(a, b, anchors) });
      record(a).bonds.add(id);
      record(b).bonds.add(id);
      return id;
    },

    getBond(id) {
      return bonds.get(id)?.anchors ?? null;
    },

    removeBond(id) {
      const bond = bonds.get(id);
      if (!bond) return;
      forgetBond(id);
      b2DestroyJoint(bond.joint);
    },

    setVelocity(id, velocity) {
      b2Body_SetLinearVelocity(record(id).b2Id, toB2(velocity));
    },

    reset() {
      destroyB2World(worldId);
      worldId = createB2World(options);
      bodies.clear();
      sliding.clear();
      clearContacts();
      nextId = 1;
      nextShapeId = 1;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      bodies.clear();
      sliding.clear();
      clearContacts();
      destroyB2World(worldId);
    },
  };

  engineReaders.set(world, (id) => {
    const { b2Id } = record(id);
    const type = b2Body_GetType(b2Id);
    const p = b2Body_GetPosition(b2Id);
    const found: b2ShapeId[] = [];
    const count = b2Body_GetShapes(b2Id, found);
    const shapes = found.slice(0, count).map((shape) => ({
      id: b2Shape_GetUserData(shape) as ShapeId,
      friction: b2Shape_GetFriction(shape),
      restitution: b2Shape_GetRestitution(shape),
      density: b2Shape_GetDensity(shape),
      groupIndex: b2Shape_GetFilter(shape).groupIndex,
      hitEvents: b2Shape_AreHitEventsEnabled(shape),
    }));
    return {
      type:
        type === b2BodyType.b2_staticBody
          ? 'fixed'
          : type === b2BodyType.b2_kinematicBody
            ? 'kinematic'
            : 'moving',
      transform: { x: toPx(p.x), y: toPx(p.y), angle: b2Rot_GetAngle(b2Body_GetRotation(b2Id)) },
      bullet: b2Body_IsBullet(b2Id),
      angularDamping: b2Body_GetAngularDamping(b2Id),
      upright: b2Body_IsFixedRotation(b2Id),
      shapes: shapes.sort((a, b) => a.id - b.id),
      joints: b2Body_GetJointCount(b2Id),
    };
  });
  return world;
}

/** The point of segment ab nearest `target`. */
function closestOnSegment(a: Vec2, b: Vec2, target: Vec2): Vec2 {
  const t = closestParameterOnSegment(target, a, b);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** The point of a convex polygon nearest `target`: `target` itself if it is inside. */
function closestOnPolygon(polygon: Polygon, target: Vec2): Vec2 {
  if (polygonContainsPoint(polygon, target)) return { ...target };
  let best = polygon[0]!;
  let bestDistance = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const point = closestOnSegment(polygon[i]!, polygon[(i + 1) % polygon.length]!, target);
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

/** The point of a disc of `radius` about `centre` nearest `target`: `target` itself if it is inside. */
function closestOnRound(centre: Vec2, radius: number, target: Vec2): Vec2 {
  const distance = Math.hypot(target.x - centre.x, target.y - centre.y);
  if (distance <= radius) return { ...target };
  const t = radius / distance;
  return { x: centre.x + (target.x - centre.x) * t, y: centre.y + (target.y - centre.y) * t };
}
