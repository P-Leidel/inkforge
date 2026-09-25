import type { Vec2 } from './vec2';

/** Position and rotation of a body: local points are rotated by `angle`, then moved by (x, y). */
export interface Transform {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export const IDENTITY_TRANSFORM: Transform = { x: 0, y: 0, angle: 0 };

export function applyTransform(point: Vec2, t: Transform): Vec2 {
  const c = Math.cos(t.angle);
  const s = Math.sin(t.angle);
  return { x: c * point.x - s * point.y + t.x, y: s * point.x + c * point.y + t.y };
}

export function transformPoints(points: readonly Vec2[], t: Transform): Vec2[] {
  const c = Math.cos(t.angle);
  const s = Math.sin(t.angle);
  return points.map((p) => ({ x: c * p.x - s * p.y + t.x, y: s * p.x + c * p.y + t.y }));
}
