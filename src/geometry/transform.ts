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

/**
 * The pose `fraction` of the way from `from` to `to`: its position along the
 * straight line between them, its angle turned the short way round.
 */
export function between(from: Transform, to: Transform, fraction: number): Transform {
  if (fraction >= 1 || (from.x === to.x && from.y === to.y && from.angle === to.angle)) return to;
  const turn = to.angle - from.angle;
  const short = turn - 2 * Math.PI * Math.round(turn / (2 * Math.PI));
  return {
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction,
    angle: from.angle + short * fraction,
  };
}

/** Where `point`, fixed to a body at pose `from`, is with the body at pose `to`. */
export function carry(point: Vec2, from: Transform, to: Transform): Vec2 {
  if (from === to) return point;
  const c = Math.cos(to.angle - from.angle);
  const s = Math.sin(to.angle - from.angle);
  const x = point.x - from.x;
  const y = point.y - from.y;
  return { x: c * x - s * y + to.x, y: s * x + c * y + to.y };
}
