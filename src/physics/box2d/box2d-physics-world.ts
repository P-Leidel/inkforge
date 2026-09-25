import {
  b2Body_ApplyLinearImpulse,
  b2Body_ApplyMassFromShapes,
  b2Body_GetAngularVelocity,
  b2Body_GetContactData,
  b2Body_GetInertiaTensor,
  b2Body_GetLinearVelocity,
  b2Body_GetMass,
  b2Body_GetPosition,
  b2Body_GetRotation,
  b2Body_GetShapes,
  b2Body_GetType,
  b2Body_GetUserData,
  b2Body_GetWorldCenterOfMass,
  b2Body_SetAngularVelocity,
  b2Body_SetLinearVelocity,
  b2BodyType,
  b2Capsule,
  b2ComputeHull,
  b2ComputePolygonMass,
  b2ContactData,
  b2CreateBody,
  b2CreateCapsuleShape,
  b2CreatePolygonShape,
  b2CreateWorld,
  b2CreateWorldArray,
  b2DefaultBodyDef,
  b2DefaultShapeDef,
  b2DefaultWorldDef,
  b2DestroyBody,
  b2DestroyWorld,
  b2MakePolygon,
  b2MakeRot,
  b2Rot_GetAngle,
  b2Shape_GetBody,
  b2Shape_GetContactData,
  b2Shape_GetRestitution,
  b2Shape_GetUserData,
  b2Shape_SetDensity,
  b2Shape_SetFriction,
  b2Shape_SetRestitution,
  b2Vec2,
  b2World_GetContactEvents,
  b2World_IsValid,
  b2World_SetRestitutionThreshold,
  b2World_Step,
  type b2BodyId,
  type b2Polygon,
  type b2Rot,
  type b2ShapeId,
  type b2WorldId,
} from 'phaser-box2d/dist/PhaserBox2D.js';
import type { Polygon } from '../../geometry/polygon';
import type { Segment } from '../../geometry/segment';
import type { Transform } from '../../geometry/transform';
import type { Vec2 } from '../../geometry/vec2';
import type {
  BodyId,
  ContactHit,
  ContactPair,
  ObjectBodyDef,
  PhysicsWorld,
  PhysicsWorldOptions,
  ShapeId,
  Surface,
} from '../physics-world';

/**
 * Box2D works in metres and is tuned for moving bodies of 0.1–10 m. At 50 px
 * per metre the Arena is 38.4 × 21.6 m and a 20 px Object is 0.4 m.
 */
const PX_PER_METRE = 50;
const SUB_STEPS = 4;
/** Hit events are reported above this speed; we decide about waking ourselves. */
const HIT_EVENT_THRESHOLD_PX = 5;

const toM = (px: number) => px / PX_PER_METRE;
const toPx = (m: number) => m * PX_PER_METRE;
const toB2 = (p: Vec2) => new b2Vec2(toM(p.x), toM(p.y));

type BodyKind = 'terrain' | 'line' | 'object';

/** The mass of a body's shapes at density 1, in metres: what its density scales. */
interface UnitMass {
  readonly area: number;
  /** Centre of mass in body coordinates. */
  readonly centre: b2Vec2;
  /** Rotational inertia about the centre of mass. */
  readonly inertia: number;
}

const NO_MASS: UnitMass = { area: 0, centre: new b2Vec2(0, 0), inertia: 0 };

interface BodyRecord {
  b2Id: b2BodyId;
  readonly kind: BodyKind;
  /** Its shapes' ids: an Object's by part, kept when it is rebuilt. */
  readonly shapes: readonly ShapeId[];
  frozen: boolean;
  /** An Object's convex parts in body coordinates, to rebuild it on Release. */
  readonly parts: readonly Polygon[];
  /** The surface of its shapes, kept when it is rebuilt. */
  surface: Surface;
  /** Mass per m², the same over all shapes; kept when it is rebuilt. */
  density: number;
  readonly unit: UnitMass;
  /** What an Object was created with, to read back exactly while the engine still holds it. */
  placed?: Placement;
}

/**
 * An Object's transform and velocity in px as it was created, and the
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

/** A slide in progress: an Object moving off a Line at a set velocity. */
interface Slide {
  /** Seconds of sliding left. */
  remaining: number;
  /** m/s. */
  readonly velocity: b2Vec2;
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
  /** Contacts ended between steps (a body removed), for the next report. */
  let pendingEnds: ContactPair[] = [];
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

  function makeB2Body(id: BodyId, type: number, position: b2Vec2, rotation?: b2Rot): b2BodyId {
    const def = b2DefaultBodyDef();
    def.type = type;
    def.position = position;
    if (rotation) def.rotation = rotation;
    def.userData = id;
    return b2CreateBody(worldId, def);
  }

  /** New ids for `count` shapes. */
  function newShapeIds(count: number): ShapeId[] {
    return Array.from({ length: count }, () => nextShapeId++ as ShapeId);
  }

  function createFixedBody(kind: BodyKind, shapeCount: number, surface: Surface) {
    const id = nextId++ as BodyId;
    const b2Id = makeB2Body(id, b2BodyType.b2_staticBody, new b2Vec2(0, 0));
    const shapes = newShapeIds(shapeCount);
    bodies.set(id, {
      b2Id,
      kind,
      shapes,
      frozen: false,
      parts: [],
      surface,
      unit: NO_MASS,
      density: 1,
    });
    return { b2Id, id, shapes };
  }

  function shapeDef(shape: ShapeId, surface: Surface, hitEvents: boolean, density = 1) {
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

  function addPolygon(
    bodyId: b2BodyId,
    shape: ShapeId,
    polygon: Polygon,
    surface: Surface,
    hitEvents: boolean,
    density = 1,
  ) {
    const b2Polygon = makePolygon(polygon);
    if (b2Polygon) {
      b2CreatePolygonShape(bodyId, shapeDef(shape, surface, hitEvents, density), b2Polygon);
    }
  }

  /** Creates an Object's shapes on its (new) body. */
  function addParts(rec: BodyRecord): void {
    rec.parts.forEach((part, k) =>
      addPolygon(rec.b2Id, rec.shapes[k]!, part, rec.surface, true, rec.density),
    );
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
    for (const event of events.endEvents) {
      const pair = pairOf(event.shapeIdA, event.shapeIdB);
      const key = pairKey(pair.shapeA, pair.shapeB);
      if (touching.delete(key)) ends.push(pair);
    }
    for (const event of events.beginEvents) {
      const pair = pairOf(event.shapeIdA, event.shapeIdB);
      const key = pairKey(pair.shapeA, pair.shapeB);
      if (touching.has(key)) continue;
      touching.set(key, pair);
      begins.push(pair);
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
        touching.delete(key);
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

  /** Velocities of moving Objects before the step, to replay a waking hit. */
  function snapshotMotion(): Map<BodyId, Motion> {
    const motion = new Map<BodyId, Motion>();
    for (const [id, rec] of bodies) {
      if (rec.kind === 'object' && !rec.frozen) {
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
    b2DestroyBody(rec.b2Id);
    rec.b2Id = makeB2Body(id, type, position, rotation);
    addParts(rec);
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
    return {
      invMass: 1 / b2Body_GetMass(rec.b2Id),
      invInertia: 1 / b2Body_GetInertiaTensor(rec.b2Id),
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
      invInertia: 1 / (rec.density * rec.unit.inertia),
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
    if (rec.kind !== 'object' || rec.frozen) return null;
    if (b2Body_GetType(rec.b2Id) !== b2BodyType.b2_dynamicBody) return null; // sliding
    return movingInertial(rec);
  }

  /**
   * Where the collision between two shapes acted as a whole: their contact
   * points weighted by the impulse each took. A box hitting another face-on
   * touches at two corners and acts at the middle of the face, not at one
   * corner.
   */
  function contactCentre(shapeA: b2ShapeId, shapeB: b2ShapeId, fallback: b2Vec2): b2Vec2 {
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

  function bodyIdOf(b2Id: b2BodyId): BodyId {
    return b2Body_GetUserData(b2Id) as BodyId;
  }

  function clearContacts(): void {
    touching.clear();
    rebuilt.clear();
    pendingEnds = [];
  }

  const world: PhysicsWorld = {
    get bodyCount() {
      return bodies.size;
    },

    addTerrain(polygons, surface) {
      const { b2Id, shapes } = createFixedBody('terrain', polygons.length, surface);
      polygons.forEach((polygon, k) => addPolygon(b2Id, shapes[k]!, polygon, surface, false));
      return bodyIdOf(b2Id);
    },

    addLine(segments: readonly Segment[], thickness: number, surface: Surface) {
      const { b2Id, shapes } = createFixedBody('line', segments.length, surface);
      segments.forEach((segment, k) => {
        const capsule = new b2Capsule();
        capsule.center1 = toB2(segment.a);
        capsule.center2 = toB2(segment.b);
        capsule.radius = toM(thickness / 2);
        b2CreateCapsuleShape(b2Id, shapeDef(shapes[k]!, surface, false), capsule);
      });
      return bodyIdOf(b2Id);
    },

    addObject(def: ObjectBodyDef) {
      // A Frozen Object is a fixed body: it collides but never moves, and
      // fixed bodies don't touch each other, so Frozen Objects never wake
      // each other and Lines or Terrain never wake them.
      const type = def.frozen ? b2BodyType.b2_staticBody : b2BodyType.b2_dynamicBody;
      const unit = unitMassOf(def.parts);
      const density = unit.area > 0 ? def.mass / unit.area : 0;
      const id = nextId++ as BodyId;
      const b2Id = makeB2Body(id, type, toB2(def.position), b2MakeRot(def.angle ?? 0));
      const rec: BodyRecord = {
        b2Id,
        kind: 'object',
        shapes: newShapeIds(def.parts.length),
        frozen: def.frozen,
        parts: def.parts,
        surface: def.surface,
        unit,
        density,
      };
      bodies.set(id, rec);
      addParts(rec);
      if (!def.frozen) {
        if (def.velocity) b2Body_SetLinearVelocity(b2Id, toB2(def.velocity));
        if (def.angularVelocity) b2Body_SetAngularVelocity(b2Id, def.angularVelocity);
      }
      rec.placed = {
        transform: { x: def.position.x, y: def.position.y, angle: def.angle ?? 0 },
        velocity: def.frozen || !def.velocity ? { x: 0, y: 0 } : def.velocity,
        engine: engineState(b2Id),
      };
      return id;
    },

    removeBody(id) {
      const rec = record(id);
      b2DestroyBody(rec.b2Id);
      bodies.delete(id);
      sliding.delete(id);
      rebuilt.delete(id);
      // The engine's end events for these are lost at the next step's start.
      for (const [key, pair] of touching) {
        if (pair.bodyA !== id && pair.bodyB !== id) continue;
        touching.delete(key);
        pendingEnds.push(pair);
      }
    },

    step() {
      const hasFrozen = [...bodies.values()].some((rec) => rec.frozen);
      const before = hasFrozen ? snapshotMotion() : new Map<BodyId, Motion>();

      advanceSlides();
      b2World_Step(worldId, options.timeStep, SUB_STEPS);
      const { begins, ends } = trackContacts();

      const hits: ContactHit[] = [];
      const wakes = new Map<BodyId, Wake>();
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
          if (!frozen?.frozen || !hitter) continue;
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
          const push = j * target.invMass;
          if (toPx(push) <= options.wakeSpeed) continue;
          const current = wakes.get(frozenId);
          if (current && current.push >= push) continue;
          wakes.set(frozenId, { hitter: hitterId, motion, point, normal: towards, j, push });
        }
      }
      for (const [frozenId, wake] of wakes) {
        wakeByHit(frozenId, wake);
        // The hit that woke it played out between two free bodies.
        const k = hits.findIndex(
          (hit) =>
            (hit.bodyA === frozenId && hit.bodyB === wake.hitter) ||
            (hit.bodyB === frozenId && hit.bodyA === wake.hitter),
        );
        if (k >= 0) hits[k] = { ...hits[k]!, impulse: toPx(wake.j) };
      }
      return { hits, begins, ends };
    },

    touchingPairs() {
      return [...touching.values()];
    },

    isFrozen(id) {
      return record(id).frozen;
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
      rec.surface = surface;
      const shapes: b2ShapeId[] = [];
      const count = b2Body_GetShapes(rec.b2Id, shapes);
      for (let i = 0; i < count; i++) {
        b2Shape_SetFriction(shapes[i]!, surface.friction);
        b2Shape_SetRestitution(shapes[i]!, surface.restitution);
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
      const shapes: b2ShapeId[] = [];
      const count = b2Body_GetShapes(rec.b2Id, shapes);
      for (let i = 0; i < count; i++) b2Shape_SetDensity(shapes[i]!, rec.density);
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
  return world;
}
