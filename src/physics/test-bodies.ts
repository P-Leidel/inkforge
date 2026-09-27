import type { Polygon } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import type { Vec2 } from '../geometry/vec2';
import type { BodyDef, Surface } from './physics-world';

/**
 * For tests: the bodies milestones 1 to 3 know, described as the Sandbox
 * describes them.
 */

/** Fixed Terrain of convex polygons in world coordinates. */
export function terrainDef(polygons: readonly Polygon[], surface: Surface): BodyDef {
  return { shapes: { kind: 'polygons', polygons }, surface };
}

/** A fixed Line: one capsule of `thickness` per segment. */
export function lineDef(
  segments: readonly Segment[],
  thickness: number,
  surface: Surface,
): BodyDef {
  return { shapes: { kind: 'capsules', segments, radius: thickness / 2 }, surface };
}

export interface TestObject {
  readonly position: Vec2;
  readonly parts: readonly Polygon[];
  readonly frozen: boolean;
  readonly surface: Surface;
  readonly mass: number;
  readonly angle?: number;
  readonly velocity?: Vec2;
  readonly angularVelocity?: number;
}

/** An Object: it moves, can start Frozen, reports hits and wakes Frozen Objects. */
export function objectDef(def: TestObject): BodyDef {
  return {
    shapes: { kind: 'polygons', polygons: def.parts },
    surface: def.surface,
    position: def.position,
    angle: def.angle,
    motion: {
      mass: def.mass,
      velocity: def.velocity,
      angularVelocity: def.angularVelocity,
      frozen: def.frozen,
      wakes: true,
    },
    reportsHits: true,
  };
}

export interface TestCircle {
  readonly position: Vec2;
  readonly radius: number;
  readonly surface: Surface;
  readonly mass: number;
  readonly angle?: number;
  readonly velocity?: Vec2;
  readonly angularVelocity?: number;
  readonly group?: number;
  /** True by default. */
  readonly wakes?: boolean;
  readonly bullet?: boolean;
}

/** A moving circle (Rubble, a Droplet): it reports hits and, unless told not to, wakes. */
export function circleDef(def: TestCircle): BodyDef {
  return {
    shapes: { kind: 'circle', radius: def.radius },
    surface: def.surface,
    position: def.position,
    angle: def.angle,
    motion: {
      mass: def.mass,
      velocity: def.velocity,
      angularVelocity: def.angularVelocity,
      wakes: def.wakes ?? true,
      bullet: def.bullet,
    },
    reportsHits: true,
    group: def.group,
  };
}
