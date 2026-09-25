import {
  b2Body_ApplyLinearImpulse,
  b2Body_GetAngularVelocity,
  b2Body_GetInertiaTensor,
  b2Body_GetLinearVelocity,
  b2Body_GetMass,
  b2Body_GetPosition,
  b2Body_GetRotation,
  b2Body_GetType,
  b2Body_GetUserData,
  b2Body_GetWorldCenterOfMass,
  b2Body_SetAngularVelocity,
  b2Body_SetLinearVelocity,
  b2BodyType,
  b2Capsule,
  b2ComputeHull,
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
  b2Rot_GetAngle,
  b2Shape_GetBody,
  b2Vec2,
  b2World_GetContactEvents,
  b2World_SetGravity,
  b2World_Step,
  type b2BodyId,
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
} from '../physics-world';

/**
 * Box2D works in metres and is tuned for moving bodies of 0.1–10 m. At 50 px
 * per metre the Arena is 38.4 × 21.6 m and a 20 px Object is 0.4 m.
 */
const PX_PER_METRE = 50;
const SUB_STEPS = 4;
/** Hit events are reported above this speed; we filter by `wakeSpeed` ourselves. */
const HIT_EVENT_THRESHOLD_PX = 5;
/** Uniform density of the neutral material, kg/m². */
const DENSITY = 1;
const FRICTION = 0.6;
const RESTITUTION = 0;

const toM = (px: number) => px / PX_PER_METRE;
const toPx = (m: number) => m * PX_PER_METRE;
const toB2 = (p: Vec2) => new b2Vec2(toM(p.x), toM(p.y));

type BodyKind = 'terrain' | 'line' | 'object';

interface BodyRecord {
  b2Id: b2BodyId;
  readonly kind: BodyKind;
  frozen: boolean;
  /** An Object's convex parts in body coordinates, to rebuild it on Release. */
  readonly parts: readonly Polygon[];
}

/*
 * Phaser Box2D 1.1.0 never frees a destroyed world's slot, so a process can
 * only ever create 32 worlds. We recycle worlds instead: a destroyed
 * PhysicsWorld removes its bodies and hands its Box2D world back here.
 */
const idleWorlds: b2WorldId[] = [];

function acquireWorld(gravity: Vec2): b2WorldId {
  const recycled = idleWorlds.pop();
  if (recycled) {
    b2World_SetGravity(recycled, toB2(gravity));
    return recycled;
  }
  b2CreateWorldArray(); // no-op after the first call
  const def = b2DefaultWorldDef();
  def.gravity = toB2(gravity);
  def.hitEventThreshold = toM(HIT_EVENT_THRESHOLD_PX);
  def.enableContinuous = true;
  return b2CreateWorld(def);
}

export function createBox2dPhysicsWorld(options: PhysicsWorldOptions): PhysicsWorld {
  const worldId = acquireWorld(options.gravity);
  const bodies = new Map<BodyId, BodyRecord>();
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
    frozen = false,
    parts: readonly Polygon[] = [],
  ) {
    const id = nextId++ as BodyId;
    const b2Id = makeB2Body(id, type, toB2(position));
    bodies.set(id, { b2Id, kind, frozen, parts });
    return { id, b2Id };
  }

  function shapeDef(hitEvents: boolean) {
    const def = b2DefaultShapeDef();
    def.density = DENSITY;
    def.friction = FRICTION;
    def.restitution = RESTITUTION;
    def.enableHitEvents = hitEvents;
    return def;
  }

  function addPolygon(bodyId: b2BodyId, polygon: Polygon, hitEvents: boolean): void {
    const points = polygon.map(toB2);
    const hull = b2ComputeHull(points, points.length);
    const shape = hull.count >= 3 ? b2MakePolygon(hull, 0) : null;
    // Parts too thin or small for Box2D to represent are skipped; the
    // Stroke pipeline keeps them rare.
    if (shape) b2CreatePolygonShape(bodyId, shapeDef(hitEvents), shape);
  }

  function bodyIdOfShape(shapeId: b2ShapeId): BodyId {
    return b2Body_GetUserData(b2Shape_GetBody(shapeId)) as BodyId;
  }

  interface Motion {
    readonly v: b2Vec2;
    readonly w: number;
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
  function unfreeze(id: BodyId, rec: BodyRecord): void {
    rec.frozen = false;
    const position = b2Body_GetPosition(rec.b2Id);
    const rotation = b2Body_GetRotation(rec.b2Id);
    b2DestroyBody(rec.b2Id);
    rec.b2Id = makeB2Body(id, b2BodyType.b2_dynamicBody, position, rotation);
    for (const part of rec.parts) addPolygon(rec.b2Id, part, true);
  }

  /**
   * Wakes a Frozen Object and replays the hit as a collision between two free
   * bodies. During the step the Frozen Object acted like a wall, so the
   * hitter was stopped; we restore the hitter's velocity from before the step
   * and apply the impulse a free collision would have produced instead.
   */
  function wakeByHit(
    frozenId: BodyId,
    hitter: BodyRecord,
    before: Motion | undefined,
    point: b2Vec2,
    normal: b2Vec2, // from hitter towards the Frozen Object
  ): void {
    const frozen = record(frozenId);
    unfreeze(frozenId, frozen);
    if (!before) return;
    b2Body_SetLinearVelocity(hitter.b2Id, before.v);
    b2Body_SetAngularVelocity(hitter.b2Id, before.w);

    const hc = b2Body_GetWorldCenterOfMass(hitter.b2Id);
    const fc = b2Body_GetWorldCenterOfMass(frozen.b2Id);
    const rh = { x: point.x - hc.x, y: point.y - hc.y };
    const rf = { x: point.x - fc.x, y: point.y - fc.y };
    // Velocity of the hitter at the contact point (the Frozen Object is at rest).
    const vx = before.v.x - before.w * rh.y;
    const vy = before.v.y + before.w * rh.x;
    const approach = vx * normal.x + vy * normal.y;
    if (approach <= 0) return;

    const invMassH = 1 / b2Body_GetMass(hitter.b2Id);
    const invMassF = 1 / b2Body_GetMass(frozen.b2Id);
    const invInertiaH = 1 / b2Body_GetInertiaTensor(hitter.b2Id);
    const invInertiaF = 1 / b2Body_GetInertiaTensor(frozen.b2Id);
    const rhn = rh.x * normal.y - rh.y * normal.x;
    const rfn = rf.x * normal.y - rf.y * normal.x;
    const k = invMassH + invMassF + invInertiaH * rhn * rhn + invInertiaF * rfn * rfn;
    const j = ((1 + RESTITUTION) * approach) / k;

    b2Body_ApplyLinearImpulse(hitter.b2Id, new b2Vec2(-j * normal.x, -j * normal.y), point, true);
    b2Body_ApplyLinearImpulse(frozen.b2Id, new b2Vec2(j * normal.x, j * normal.y), point, true);
  }

  const world: PhysicsWorld = {
    get bodyCount() {
      return bodies.size;
    },

    addTerrain(polygons) {
      const { id, b2Id } = createBody('terrain', b2BodyType.b2_staticBody, { x: 0, y: 0 });
      for (const polygon of polygons) addPolygon(b2Id, polygon, false);
      return id;
    },

    addLine(segments: readonly Segment[], thickness: number) {
      const { id, b2Id } = createBody('line', b2BodyType.b2_staticBody, { x: 0, y: 0 });
      for (const segment of segments) {
        const capsule = new b2Capsule();
        capsule.center1 = toB2(segment.a);
        capsule.center2 = toB2(segment.b);
        capsule.radius = toM(thickness / 2);
        b2CreateCapsuleShape(b2Id, shapeDef(false), capsule);
      }
      return id;
    },

    addObject(def: ObjectBodyDef) {
      // A Frozen Object is a fixed body: it collides but never moves, and
      // fixed bodies don't touch each other, so Frozen Objects never wake
      // each other and Lines or Terrain never wake them.
      const type = def.frozen ? b2BodyType.b2_staticBody : b2BodyType.b2_dynamicBody;
      const { id, b2Id } = createBody('object', type, def.position, def.frozen, def.parts);
      for (const part of def.parts) addPolygon(b2Id, part, true);
      return id;
    },

    removeBody(id) {
      b2DestroyBody(record(id).b2Id);
      bodies.delete(id);
    },

    step() {
      const hasFrozen = [...bodies.values()].some((rec) => rec.frozen);
      const before = hasFrozen ? snapshotMotion() : new Map<BodyId, Motion>();

      b2World_Step(worldId, options.timeStep, SUB_STEPS);

      const hits: ContactHit[] = [];
      const wakes = new Map<
        BodyId,
        { hitter: BodyId; point: b2Vec2; normal: b2Vec2; speed: number }
      >();
      for (const event of b2World_GetContactEvents(worldId).hitEvents) {
        const a = bodyIdOfShape(event.shapeIdA);
        const b = bodyIdOfShape(event.shapeIdB);
        const speed = toPx(event.approachSpeed);
        const point = new b2Vec2(event.pointX, event.pointY);
        hits.push({ bodyA: a, bodyB: b, point: { x: toPx(point.x), y: toPx(point.y) }, speed });
        if (speed < options.wakeSpeed) continue;

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
          const current = wakes.get(frozenId);
          if (current && current.speed >= speed) continue;
          const normal = new b2Vec2(sign * event.normalX, sign * event.normalY);
          wakes.set(frozenId, { hitter: hitterId, point, normal, speed });
        }
      }
      for (const [frozenId, wake] of wakes) {
        wakeByHit(frozenId, record(wake.hitter), before.get(wake.hitter), wake.point, wake.normal);
      }
      return hits;
    },

    isFrozen(id) {
      return record(id).frozen;
    },

    release(id) {
      const rec = record(id);
      if (rec.frozen) unfreeze(id, rec);
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
