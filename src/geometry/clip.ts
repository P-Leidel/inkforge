import { signedArea, type Polygon } from './polygon';
import type { Segment } from './segment';
import { lerp, type Vec2 } from './vec2';

const EPSILON = 1e-9;

/**
 * The parameter interval [tIn, tOut] of segment ab that lies strictly inside
 * a convex polygon (Cyrus–Beck), or null. Running along an edge counts as
 * outside, so a Line lying on a Terrain surface is kept.
 */
function insideInterval(a: Vec2, b: Vec2, polygon: Polygon): [number, number] | null {
  const orientation = Math.sign(signedArea(polygon));
  const d = { x: b.x - a.x, y: b.y - a.y };
  let tIn = 0;
  let tOut = 1;
  for (let i = 0; i < polygon.length; i++) {
    const v1 = polygon[i]!;
    const v2 = polygon[(i + 1) % polygon.length]!;
    // Outward normal of edge v1v2.
    const n = { x: (v2.y - v1.y) * orientation, y: -(v2.x - v1.x) * orientation };
    const num = n.x * (v1.x - a.x) + n.y * (v1.y - a.y);
    const den = n.x * d.x + n.y * d.y;
    if (Math.abs(den) < EPSILON) {
      if (num <= EPSILON) return null; // parallel to the edge, on it or outside
      continue;
    }
    const t = num / den;
    if (den > 0) tOut = Math.min(tOut, t);
    else tIn = Math.max(tIn, t);
    if (tIn >= tOut - EPSILON) return null;
  }
  return [tIn, tOut];
}

/** The parts of segment ab outside every one of the convex polygons. */
export function cutSegmentOutside(a: Vec2, b: Vec2, polygons: readonly Polygon[]): Segment[] {
  const inside = polygons
    .map((polygon) => insideInterval(a, b, polygon))
    .filter((interval): interval is [number, number] => interval !== null)
    .sort((p, q) => p[0] - q[0]);

  const parts: Segment[] = [];
  let t = 0;
  for (const [tIn, tOut] of inside) {
    if (tIn > t + EPSILON) parts.push({ a: lerp(a, b, t), b: lerp(a, b, tIn) });
    t = Math.max(t, tOut);
  }
  if (t < 1 - EPSILON) parts.push({ a: lerp(a, b, t), b });
  return parts;
}

/** The parts of an open polyline outside every one of the convex polygons, as segments. */
export function cutPolylineOutside(
  points: readonly Vec2[],
  polygons: readonly Polygon[],
): Segment[] {
  const parts: Segment[] = [];
  for (let i = 1; i < points.length; i++) {
    parts.push(...cutSegmentOutside(points[i - 1]!, points[i]!, polygons));
  }
  return parts;
}
