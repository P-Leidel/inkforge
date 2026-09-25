import { cross, dot, sub, type Vec2 } from './vec2';

export interface Segment {
  readonly a: Vec2;
  readonly b: Vec2;
}

/** Closest point to p on segment ab, as the parameter t in [0, 1]. */
export function closestParameterOnSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const lenSq = dot(ab, ab);
  if (lenSq === 0) return 0;
  return Math.min(1, Math.max(0, dot(sub(p, a), ab) / lenSq));
}

export function distancePointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const t = closestParameterOnSegment(p, a, b);
  return Math.hypot(a.x + (b.x - a.x) * t - p.x, a.y + (b.y - a.y) * t - p.y);
}

/**
 * Whether segments p1p2 and q1q2 cross at a single point strictly inside both
 * (touching at an end point or running collinear does not count).
 */
export function segmentsCrossProperly(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): boolean {
  const d1 = cross(sub(p2, p1), sub(q1, p1));
  const d2 = cross(sub(p2, p1), sub(q2, p1));
  const d3 = cross(sub(q2, q1), sub(p1, q1));
  const d4 = cross(sub(q2, q1), sub(p2, q1));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Whether segments p1p2 and q1q2 share any point, including touching and collinear overlap. */
export function segmentsIntersect(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): boolean {
  if (segmentsCrossProperly(p1, p2, q1, q2)) return true;
  const eps = 1e-9;
  return (
    distancePointToSegment(q1, p1, p2) < eps ||
    distancePointToSegment(q2, p1, p2) < eps ||
    distancePointToSegment(p1, q1, q2) < eps ||
    distancePointToSegment(p2, q1, q2) < eps
  );
}

export function distanceSegmentToSegment(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): number {
  if (segmentsIntersect(p1, p2, q1, q2)) return 0;
  return Math.min(
    distancePointToSegment(p1, q1, q2),
    distancePointToSegment(p2, q1, q2),
    distancePointToSegment(q1, p1, p2),
    distancePointToSegment(q2, p1, p2),
  );
}
