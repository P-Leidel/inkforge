/**
 * The physics module. Everything outside src/physics/ uses the engine-neutral
 * interface below; swapping the engine (e.g. to Rapier, ADR 0001) means
 * writing another adapter and changing `createPhysicsWorld`.
 */
export type {
  BodyId,
  ContactHit,
  ContactPair,
  ObjectBodyDef,
  PhysicsWorld,
  PhysicsWorldFactory,
  PhysicsWorldOptions,
  ShapeId,
  StepReport,
  Surface,
} from './physics-world';
export { createBox2dPhysicsWorld as createPhysicsWorld } from './box2d/box2d-physics-world';
