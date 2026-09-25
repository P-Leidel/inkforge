import {
  b2Body_ApplyLinearImpulse,
  b2Body_ApplyMassFromShapes,
  b2Body_GetAngularVelocity,
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
  b2MakePolygon,
  b2MakeRot,
  b2Rot_GetAngle,
  b2Shape_GetBody,
  b2Shape_GetContactData,
  b2Shape_GetRestitution,
  b2Shape_SetDensity,
  b2Vec2,
  b2World_GetContactEvents,
  b2World_SetGravity,
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
  ObjectBodyDef,
  PhysicsWorld,
  PhysicsWorldOptions,
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
  frozen: boolean;
  /** An Object's convex parts in body coordinates, to rebuild it on Release. */
  readonly parts: readonly Polygon[];
  /** The surface of its shapes, kept when it is rebuilt. */
  readonly surface: Surface;
  /** Mass per m², the same over all shapes; kept when it is rebuilt. */
  density: number;
  readonly unit: UnitMass;
}

/** Mass properties of a body taking part in a collision, in metres. */
interface Inertial {
  readonly invMass: number;
  readonly invInertia: number;
  /** Centre of mass in world coordinates. */
  readonly centre: b2Vec2;
}

/*
 * Phaser Box2D 1.1.0 never frees a destroyed world's slot, so a process can
 * only ever create 32 worlds. We recycle worlds instead: a destroyed
 * PhysicsWorld removes its bodies and hands its Box2D world back here.
 */
const idleWorlds: b2WorldId[] = [];

function acquireWorld(options: PhysicsWorldOptions): b2WorldId {
  const recycled = idleWorlds.pop();
  if (recycled) {
    b2World_SetGravity(recycled, toB2(options.gravity));
    b2World_SetRestitutionThreshold(recycled, toM(options.minBounceSpeed));
    return recycled;
  }
  b2CreateWorldArray(); // no-op after the first call
  const def = b2DefaultWorldDef();
  def.gravity = toB2(options.gravity);
  def.hitEventThreshold = toM(HIT_EVENT_THRESHOLD_PX);
  def.restitutionThreshold = toM(options.minBounceSpeed);
  def.enableContinuous = true;
  return b2CreateWorld(def);
}

export function createBox2dPhysicsWorld(options: PhysicsWorldOptions): PhysicsWorld {
  const worldId = acquireWorld(options);
  const bodies = new Map<BodyId, BodyRecord>();
  /** Objects sliding out of Lines: seconds of sliding left. */
  const sliding = new Map<BodyId, number>();
  let nextId = 1;
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

  function createBody(
    kind: BodyKind,
    type: number,
    position: Vec2,
    surface: Surface,
    frozen = false,
    parts: readonly Polygon[] = [],
    unit: UnitMass = NO_MASS,
    density = 1,
  ) {
    const id = nextId++ as BodyId;
    const b2Id = makeB2Body(id, type, toB2(position));
    bodies.set(id, { b2Id, kind, frozen, parts, surface, unit, density });
    return { id, b2Id };
  }

  function shapeDef(surface: Surface, hitEvents: boolean, density = 1) {
    const def = b2DefaultShapeDef();
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
    polygon: Polygon,
    surface: Surface,
    hitEvents: boolean,
    density = 1,
  ) {
    const shape = makePolygon(polygon);
    if (shape) b2CreatePolygonShape(bodyId, shapeDef(surface, hitEvents, density), shape);
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
   * of the same shape and pose.
   */
  function unfreeze(id: BodyId, rec: BodyRecord, type: number = b2BodyType.b2_dynamicBody): void {
    rec.frozen = false;
    // The getters return the body's live transform, which destroying the body
    // may reset, so copy the pose first.
    const p = b2Body_GetPosition(rec.b2Id);
    const position = new b2Vec2(p.x, p.y);
    const rotation = b2MakeRot(b2Rot_GetAngle(b2Body_GetRotation(rec.b2Id)));
    b2DestroyBody(rec.b2Id);
    rec.b2Id = makeB2Body(id, type, position, rotation);
    for (const part of rec.parts) addPolygon(rec.b2Id, part, rec.surface, true, rec.density);
  }

  /** Advances sliding Objects; one that has arrived becomes dynamic, at rest. */
  function advanceSlides(): void {
    for (const [id, remaining] of sliding) {
      const rec = record(id);
      if (remaining > 1e-9) {
        if (remaining < options.timeStep) {
          // Shorten the last step so the slide ends exactly where it should.
          const v = b2Body_GetLinearVelocity(rec.b2Id);
          const k = remaining / options.timeStep;
          b2Body_SetLinearVelocity(rec.b2Id, new b2Vec2(v.x * k, v.y * k));
        }
        sliding.set(id, remaining - options.timeStep);
        continue;
      }
      sliding.delete(id);
      unfreeze(id, rec, b2BodyType.b2_dynamicBody);
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
    const rt = { x: point.x - target.centre.x, y: point.y - target.centre.y };
    // Velocity of the hitter at the contact point.
    const vx = motion.v.x - motion.w * rh.y;
    const vy = motion.v.y + motion.w * rh.x;
    const approach = vx * normal.x + vy * normal.y;
    if (approach <= 0) return 0;
    const rhn = rh.x * normal.y - rh.y * normal.x;
    const rtn = rt.x * normal.y - rt.y * normal.x;
    const k =
      hitter.invMass +
      target.invMass +
      hitter.invInertia * rhn * rhn +
      target.invInertia * rtn * rtn;
    const bounce = approach >= toM(options.minBounceSpeed) ? restitution : 0;
    return ((1 + bounce) * approach) / k;
  }

  const contactBuffer = Array.from({ length: 64 }, () => new b2ContactData());

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
    unfreeze(frozenId, frozen);
    b2Body_SetLinearVelocity(hitter.b2Id, wake.motion.v);
    b2Body_SetAngularVelocity(hitter.b2Id, wake.motion.w);
    const { point, normal, j } = wake;
    b2Body_ApplyLinearImpulse(hitter.b2Id, new b2Vec2(-j * normal.x, -j * normal.y), point, true);
    b2Body_ApplyLinearImpulse(frozen.b2Id, new b2Vec2(j * normal.x, j * normal.y), point, true);
  }

  const world: PhysicsWorld = {
    get bodyCount() {
      return bodies.size;
    },

    addTerrain(polygons, surface) {
      const { id, b2Id } = createBody('terrain', b2BodyType.b2_staticBody, { x: 0, y: 0 }, surface);
      for (const polygon of polygons) addPolygon(b2Id, polygon, surface, false);
      return id;
    },

    addLine(segments: readonly Segment[], thickness: number, surface: Surface) {
      const { id, b2Id } = createBody('line', b2BodyType.b2_staticBody, { x: 0, y: 0 }, surface);
      for (const segment of segments) {
        const capsule = new b2Capsule();
        capsule.center1 = toB2(segment.a);
        capsule.center2 = toB2(segment.b);
        capsule.radius = toM(thickness / 2);
        b2CreateCapsuleShape(b2Id, shapeDef(surface, false), capsule);
      }
      return id;
    },

    addObject(def: ObjectBodyDef) {
      // A Frozen Object is a fixed body: it collides but never moves, and
      // fixed bodies don't touch each other, so Frozen Objects never wake
      // each other and Lines or Terrain never wake them.
      const type = def.frozen ? b2BodyType.b2_staticBody : b2BodyType.b2_dynamicBody;
      const unit = unitMassOf(def.parts);
      const density = unit.area > 0 ? def.mass / unit.area : 0;
      const { id, b2Id } = createBody(
        'object',
        type,
        def.position,
        def.surface,
        def.frozen,
        def.parts,
        unit,
        density,
      );
      for (const part of def.parts) addPolygon(b2Id, part, def.surface, true, density);
      return id;
    },

    removeBody(id) {
      b2DestroyBody(record(id).b2Id);
      bodies.delete(id);
      sliding.delete(id);
    },

    step() {
      const hasFrozen = [...bodies.values()].some((rec) => rec.frozen);
      const before = hasFrozen ? snapshotMotion() : new Map<BodyId, Motion>();

      advanceSlides();
      b2World_Step(worldId, options.timeStep, SUB_STEPS);

      const hits: ContactHit[] = [];
      const wakes = new Map<BodyId, Wake>();
      for (const event of b2World_GetContactEvents(worldId).hitEvents) {
        const a = bodyIdOfShape(event.shapeIdA);
        const b = bodyIdOfShape(event.shapeIdB);
        const speed = toPx(event.approachSpeed);
        const hitPoint = new b2Vec2(event.pointX, event.pointY);
        hits.push({
          bodyA: a,
          bodyB: b,
          point: { x: toPx(hitPoint.x), y: toPx(hitPoint.y) },
          speed,
        });

        // The manifold normal points from A to B.
        const pairs: [BodyId, BodyId, number][] = [
          [b, a, 1],
          [a, b, -1],
        ];
        for (const [frozenId, hitterId, sign] of pairs) {
          const frozen = bodies.get(frozenId);
          const hitter = bodies.get(hitterId);
          if (!frozen?.frozen || !hitter) continue;
          if (b2Body_GetType(hitter.b2Id) !== b2BodyType.b2_dynamicBody) continue;
          const motion = before.get(hitterId);
          if (!motion) continue;
          const point = contactCentre(event.shapeIdA, event.shapeIdB, hitPoint);
          const normal = new b2Vec2(sign * event.normalX, sign * event.normalY);
          const restitution = Math.max(
            b2Shape_GetRestitution(event.shapeIdA),
            b2Shape_GetRestitution(event.shapeIdB),
          );
          const target = frozenInertial(frozen);
          const j = collisionImpulse(
            movingInertial(hitter),
            motion,
            target,
            point,
            normal,
            restitution,
          );
          const push = j * target.invMass;
          if (toPx(push) <= options.wakeSpeed) continue;
          const current = wakes.get(frozenId);
          if (current && current.push >= push) continue;
          wakes.set(frozenId, { hitter: hitterId, motion, point, normal, j, push });
        }
      }
      for (const [frozenId, wake] of wakes) wakeByHit(frozenId, wake);
      return hits;
    },

    isFrozen(id) {
      return record(id).frozen;
    },

    release(id) {
      const rec = record(id);
      if (rec.frozen) unfreeze(id, rec);
    },

    slideOut(id, displacement, speed) {
      const rec = record(id);
      if (!rec.frozen) return;
      const distance = Math.hypot(displacement.x, displacement.y);
      if (distance === 0 || speed <= 0) {
        unfreeze(id, rec);
        return;
      }
      // A kinematic body moves at a set velocity and passes through fixed bodies.
      unfreeze(id, rec, b2BodyType.b2_kinematicBody);
      const k = speed / distance;
      b2Body_SetLinearVelocity(rec.b2Id, toB2({ x: displacement.x * k, y: displacement.y * k }));
      sliding.set(id, distance / speed);
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
      const b2Id = record(id).b2Id;
      const p = b2Body_GetPosition(b2Id);
      return { x: toPx(p.x), y: toPx(p.y), angle: b2Rot_GetAngle(b2Body_GetRotation(b2Id)) };
    },

    getVelocity(id) {
      const v = b2Body_GetLinearVelocity(record(id).b2Id);
      return { x: toPx(v.x), y: toPx(v.y) };
    },

    setVelocity(id, velocity) {
      b2Body_SetLinearVelocity(record(id).b2Id, toB2(velocity));
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const rec of bodies.values()) b2DestroyBody(rec.b2Id);
      bodies.clear();
      idleWorlds.push(worldId);
    },
  };
  return world;
}
