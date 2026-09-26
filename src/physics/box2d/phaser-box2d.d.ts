/**
 * Hand-written types for the part of Phaser Box2D (a JavaScript port of Box2D
 * v3) that the Box2D adapter uses. The package ships no type declarations,
 * and its `main` entry is missing, so it is imported from its dist bundle.
 */
declare module 'phaser-box2d/dist/PhaserBox2D.js' {
  export class b2Vec2 {
    constructor(x?: number, y?: number);
    x: number;
    y: number;
  }

  export class b2Rot {
    c: number;
    s: number;
  }

  export class b2WorldId {
    index1: number;
    revision: number;
  }

  export class b2BodyId {
    index1: number;
    world0: number;
    revision: number;
  }

  export class b2ShapeId {
    index1: number;
    world0: number;
    revision: number;
  }

  export interface b2WorldDef {
    gravity: b2Vec2;
    restitutionThreshold: number;
    contactPushoutVelocity: number;
    hitEventThreshold: number;
    contactHertz: number;
    contactDampingRatio: number;
    maximumLinearVelocity: number;
    enableSleep: boolean;
    enableContinuous: boolean;
    workerCount: number;
  }

  export interface b2BodyDef {
    type: number;
    position: b2Vec2;
    rotation: b2Rot;
    linearVelocity: b2Vec2;
    angularVelocity: number;
    angularDamping: number;
    gravityScale: number;
    userData: unknown;
    enableSleep: boolean;
    isAwake: boolean;
    isBullet: boolean;
  }

  export class b2JointId {
    index1: number;
    world0: number;
    revision: number;
  }

  export class b2WeldJointDef {
    bodyIdA: b2BodyId | null;
    bodyIdB: b2BodyId | null;
    /** In each body's own coordinates, metres. */
    localAnchorA: b2Vec2;
    localAnchorB: b2Vec2;
    /** B's angle minus A's, radians. */
    referenceAngle: number;
    /** 0 for a rigid joint. */
    linearHertz: number;
    angularHertz: number;
    linearDampingRatio: number;
    angularDampingRatio: number;
    collideConnected: boolean;
    userData: unknown;
  }

  export interface b2ShapeDef {
    userData: unknown;
    friction: number;
    restitution: number;
    density: number;
    isSensor: boolean;
    enableContactEvents: boolean;
    enableHitEvents: boolean;
  }

  export class b2Hull {
    points: b2Vec2[];
    count: number;
  }

  export class b2Polygon {
    vertices: b2Vec2[];
    count: number;
    radius: number;
  }

  export class b2MassData {
    mass: number;
    /** Centre of mass relative to the body origin. */
    center: b2Vec2;
    /** Rotational inertia about the body origin. */
    rotationalInertia: number;
  }

  export class b2ManifoldPoint {
    /** World coordinates. */
    pointX: number;
    pointY: number;
    /** The largest normal impulse applied at this point during the step. */
    maxNormalImpulse: number;
  }

  export class b2Manifold {
    points: b2ManifoldPoint[];
    pointCount: number;
  }

  export class b2ContactData {
    shapeIdA: b2ShapeId;
    shapeIdB: b2ShapeId;
    manifold: b2Manifold;
  }

  export class b2Circle {
    constructor(center?: b2Vec2 | null, radius?: number);
    center: b2Vec2;
    radius: number;
  }

  export class b2Capsule {
    center1: b2Vec2 | null;
    center2: b2Vec2 | null;
    radius: number;
  }

  export class b2ContactHitEvent {
    shapeIdA: b2ShapeId;
    shapeIdB: b2ShapeId;
    pointX: number;
    pointY: number;
    /** Manifold normal, pointing from shape A to shape B. */
    normalX: number;
    normalY: number;
    approachSpeed: number;
  }

  export class b2ContactBeginTouchEvent {
    shapeIdA: b2ShapeId;
    shapeIdB: b2ShapeId;
    manifold: b2Manifold;
  }

  export class b2ContactEndTouchEvent {
    shapeIdA: b2ShapeId;
    shapeIdB: b2ShapeId;
  }

  /** The last step's events; the arrays are emptied at the start of every step. */
  export class b2ContactEvents {
    beginEvents: b2ContactBeginTouchEvent[];
    endEvents: b2ContactEndTouchEvent[];
    hitEvents: b2ContactHitEvent[];
    hitCount: number;
  }

  export const b2BodyType: {
    readonly b2_staticBody: 0;
    readonly b2_kinematicBody: 1;
    readonly b2_dynamicBody: 2;
  };

  export function b2CreateWorldArray(): void;
  export function b2DefaultWorldDef(): b2WorldDef;
  export function b2CreateWorld(def: b2WorldDef): b2WorldId;
  export function b2World_Step(worldId: b2WorldId, timeStep: number, subStepCount: number): void;
  /** Frees the world's slot for a new world (with scripts/patch-phaser-box2d.mjs applied). */
  export function b2DestroyWorld(worldId: b2WorldId): void;
  export function b2World_IsValid(worldId: b2WorldId): boolean;
  export function b2World_SetGravity(worldId: b2WorldId, gravity: b2Vec2): void;
  /** Contacts approaching slower than this (m/s) don't bounce. */
  export function b2World_SetRestitutionThreshold(worldId: b2WorldId, value: number): void;
  export function b2World_GetContactEvents(worldId: b2WorldId): b2ContactEvents;

  export function b2DefaultBodyDef(): b2BodyDef;
  export function b2CreateBody(worldId: b2WorldId, def: b2BodyDef): b2BodyId;
  /** Destroys its shapes and joints too. */
  export function b2DestroyBody(bodyId: b2BodyId): void;
  export function b2Body_GetType(bodyId: b2BodyId): number;
  export function b2Body_SetType(bodyId: b2BodyId, type: number): void;
  export function b2Body_SetAwake(bodyId: b2BodyId, awake: boolean): void;
  export function b2Body_GetUserData(bodyId: b2BodyId): unknown;
  export function b2Body_GetPosition(bodyId: b2BodyId): b2Vec2;
  export function b2Body_GetRotation(bodyId: b2BodyId): b2Rot;
  export function b2Body_GetLinearVelocity(bodyId: b2BodyId): b2Vec2;
  export function b2Body_SetLinearVelocity(bodyId: b2BodyId, velocity: b2Vec2): void;
  export function b2Body_GetAngularVelocity(bodyId: b2BodyId): number;
  export function b2Body_SetAngularVelocity(bodyId: b2BodyId, velocity: number): void;
  export function b2Body_GetMass(bodyId: b2BodyId): number;
  /** Rotational inertia about the centre of mass. */
  export function b2Body_GetInertiaTensor(bodyId: b2BodyId): number;
  export function b2Body_GetWorldCenterOfMass(bodyId: b2BodyId): b2Vec2;
  /** Fills `shapeArray` with the body's shapes; returns how many. */
  export function b2Body_GetShapes(bodyId: b2BodyId, shapeArray: b2ShapeId[]): number;
  export function b2Body_ApplyMassFromShapes(bodyId: b2BodyId): void;
  export function b2Body_ApplyLinearImpulse(
    bodyId: b2BodyId,
    impulse: b2Vec2,
    point: b2Vec2,
    wake: boolean,
  ): void;

  export function b2Body_ApplyLinearImpulseToCenter(
    bodyId: b2BodyId,
    impulse: b2Vec2,
    wake: boolean,
  ): void;
  export function b2Body_ApplyAngularImpulse(
    bodyId: b2BodyId,
    impulse: number,
    wake: boolean,
  ): void;

  export function b2DefaultWeldJointDef(): b2WeldJointDef;
  /**
   * Without `collideConnected`, destroys the contacts between the two bodies;
   * their end events are lost at the next step's start.
   */
  export function b2CreateWeldJoint(worldId: b2WorldId, def: b2WeldJointDef): b2JointId;
  export function b2DestroyJoint(jointId: b2JointId): void;

  export function b2DefaultShapeDef(): b2ShapeDef;
  export function b2CreatePolygonShape(
    bodyId: b2BodyId,
    def: b2ShapeDef,
    polygon: b2Polygon,
  ): b2ShapeId;
  export function b2CreateCapsuleShape(
    bodyId: b2BodyId,
    def: b2ShapeDef,
    capsule: b2Capsule,
  ): b2ShapeId;
  export function b2CreateCircleShape(
    bodyId: b2BodyId,
    def: b2ShapeDef,
    circle: b2Circle,
  ): b2ShapeId;
  export function b2Shape_GetBody(shapeId: b2ShapeId): b2BodyId;
  export function b2Shape_GetUserData(shapeId: b2ShapeId): unknown;
  export function b2Shape_GetRestitution(shapeId: b2ShapeId): number;
  export function b2Shape_SetDensity(shapeId: b2ShapeId, density: number): void;
  export function b2Shape_SetFriction(shapeId: b2ShapeId, friction: number): void;
  export function b2Shape_SetRestitution(shapeId: b2ShapeId, restitution: number): void;
  /** Fills `contactData` with the shape's touching contacts, up to `capacity`; returns how many. */
  export function b2Shape_GetContactData(
    shapeId: b2ShapeId,
    contactData: b2ContactData[],
    capacity: number,
  ): number;
  /** Fills `contactData` with the body's touching contacts, up to `capacity`; returns how many. */
  export function b2Body_GetContactData(
    bodyId: b2BodyId,
    contactData: b2ContactData[],
    capacity: number,
  ): number;
  export function b2ComputePolygonMass(polygon: b2Polygon, density: number): b2MassData;
  export function b2ComputeHull(points: b2Vec2[], count: number): b2Hull;
  /** Returns null when the hull is invalid. */
  export function b2MakePolygon(hull: b2Hull, radius: number): b2Polygon | null;
  export function b2Rot_GetAngle(rotation: b2Rot): number;
  export function b2MakeRot(angle: number): b2Rot;
}
