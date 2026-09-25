import { polygonBounds, polygonContainsPoint, boundsOverlap, type Polygon } from './polygon';
import { distanceSegmentToSegment, segmentsIntersect } from './segment';
import type { Vec2 } from './vec2';

/** A circle in world coordinates. */
export interface Circle {
  readonly centre: Vec2;
  readonly radius: number;
}

/** Overlap shallower than this (px) counts as touching. */
export const TOUCH_TOLERANCE = 1;

/**
 * Whether two convex polygons overlap by more than `tolerance` px
 * (separating axis test). Polygons that only touch don't overlap.
 */
export function convexPolygonsOverlap(
  a: Polygon,
  b: Polygon,
  tolerance = TOUCH_TOLERANCE,
): boolean {
  if (!boundsOverlap(polygonBounds(a), polygonBounds(b))) return false;
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i]!;
      const p2 = polygon[(i + 1) % polygon.length]!;
      const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (length === 0) continue;
      const axis = { x: -(p2.y - p1.y) / length, y: (p2.x - p1.x) / length };
      const [minA, maxA] = project(a, axis);
      const [minB, maxB] = project(b, axis);
      if (Math.min(maxA, maxB) - Math.max(minA, minB) <= tolerance) return false;
    }
  }
  return true;
}

function project(polygon: Polygon, axis: Vec2): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of polygon) {
    const d = p.x * axis.x + p.y * axis.y;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

/**
 * Whether a capsule (segment ab with the given radius) overlaps a polygon by
 * more than `tolerance` px.
 */
export function capsuleOverlapsPolygon(
  a: Vec2,
  b: Vec2,
  radius: number,
  polygon: Polygon,
  tolerance = TOUCH_TOLERANCE,
): boolean {
  if (polygonContainsPoint(polygon, a) || polygonContainsPoint(polygon, b)) return true;
  const reach = radius - tolerance;
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i]!;
    const p2 = polygon[(i + 1) % polygon.length]!;
    if (segmentsIntersect(a, b, p1, p2)) return true;
    if (distanceSegmentToSegment(a, b, p1, p2) < reach) return true;
  }
  return false;
}

/** Whether a circle overlaps a polygon by more than `tolerance` px. */
export function circleOverlapsPolygon(
  circle: Circle,
  polygon: Polygon,
  tolerance = TOUCH_TOLERANCE,
): boolean {
  return capsuleOverlapsPolygon(circle.centre, circle.centre, circle.radius, polygon, tolerance);
}
