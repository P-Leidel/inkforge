/**
 * The physics module. Everything outside src/physics/ uses the engine-neutral
 * interface below; swapping the engine (e.g. to Rapier, ADR 0001) means
 * writing another adapter and changing `createPhysicsWorld`.
 */
export type {
  BodyId,
  ContactHit,
  ObjectBodyDef,
  PhysicsWorld,
  PhysicsWorldFactory,
  PhysicsWorldOptions,
} from './physics-world';
export { createBox2dPhysicsWorld as createPhysicsWorld } from './box2d/box2d-physics-world';
