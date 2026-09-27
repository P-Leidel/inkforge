import type { Capsule } from './overlap';
import { signedArea, type Polygon } from './polygon';
import type { Segment } from './segment';
import { dot, lerp, perp, scale, sub, type Vec2 } from './vec2';

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

/**
 * The parts of segment ab inside any of `capsules`: within a capsule's
 * radius of its segment, its round ends included. In order along ab; none
 * for a segment of no length.
 */
export function partsInsideCapsules(a: Vec2, b: Vec2, capsules: readonly Capsule[]): Segment[] {
  if (a.x === b.x && a.y === b.y) return [];
  const inside: [number, number][] = [];
  for (const capsule of capsules) {
    const interval = capsuleInterval(a, b, capsule);
    if (interval) inside.push(interval);
  }
  inside.sort((p, q) => p[0] - q[0]);

  const parts: Segment[] = [];
  let run: [number, number] | null = null;
  for (const [tIn, tOut] of inside) {
    if (run && tIn <= run[1] + EPSILON) {
      run[1] = Math.max(run[1], tOut);
      continue;
    }
    if (run) parts.push({ a: lerp(a, b, run[0]), b: lerp(a, b, run[1]) });
    run = [tIn, tOut];
  }
  if (run) parts.push({ a: lerp(a, b, run[0]), b: lerp(a, b, run[1]) });
  return parts;
}

/**
 * The parameter interval [tIn, tOut] of segment ab inside a capsule, or
 * null. A capsule is convex, so it is one interval: from the first of its
 * round ends and the band between them that ab enters, to the last it leaves.
 */
function capsuleInterval(
  a: Vec2,
  b: Vec2,
  { segment: { a: p, b: q }, radius }: Capsule,
): [number, number] | null {
  // Most capsules near a path are out of reach of each segment of it.
  if (
    Math.max(a.x, b.x) < Math.min(p.x, q.x) - radius ||
    Math.min(a.x, b.x) > Math.max(p.x, q.x) + radius ||
    Math.max(a.y, b.y) < Math.min(p.y, q.y) - radius ||
    Math.min(a.y, b.y) > Math.max(p.y, q.y) + radius
  ) {
    return null;
  }
  const d = sub(b, a);
  let tIn = Infinity;
  let tOut = -Infinity;
  for (const span of [
    discSpan(a, d, p, radius),
    discSpan(a, d, q, radius),
    bandSpan(a, d, p, q, radius),
  ]) {
    if (!span) continue;
    tIn = Math.min(tIn, span[0]);
    tOut = Math.max(tOut, span[1]);
  }
  tIn = Math.max(0, tIn);
  tOut = Math.min(1, tOut);
  return tIn < tOut - EPSILON ? [tIn, tOut] : null;
}

/** Where the line a + t·d is within `radius` of `centre`, as [t1, t2], or null. */
function discSpan(a: Vec2, d: Vec2, centre: Vec2, radius: number): [number, number] | null {
  const f = sub(a, centre);
  const dd = dot(d, d);
  const fd = dot(f, d);
  const discriminant = fd * fd - dd * (dot(f, f) - radius * radius);
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  return [(-fd - root) / dd, (-fd + root) / dd];
}

/**
 * Where the line a + t·d is within `radius` of segment pq beside it, not
 * past its ends: inside the rectangle between the capsule's round ends.
 */
function bandSpan(a: Vec2, d: Vec2, p: Vec2, q: Vec2, radius: number): [number, number] | null {
  const pq = sub(q, p);
  const length = Math.hypot(pq.x, pq.y);
  if (length === 0) return null;
  const along = scale(pq, 1 / length);
  const across = perp(along);
  const ap = sub(a, p);
  const span = slab([-Infinity, Infinity], dot(ap, along), dot(d, along), 0, length);
  return span && slab(span, dot(ap, across), dot(d, across), -radius, radius);
}

/** `span` narrowed to where s0 + t·s1 lies between `lo` and `hi`, or null. */
function slab(
  span: [number, number],
  s0: number,
  s1: number,
  lo: number,
  hi: number,
): [number, number] | null {
  if (Math.abs(s1) < EPSILON) return s0 >= lo && s0 <= hi ? span : null;
  const t1 = (lo - s0) / s1;
  const t2 = (hi - s0) / s1;
  const tIn = Math.max(span[0], Math.min(t1, t2));
  const tOut = Math.min(span[1], Math.max(t1, t2));
  return tIn <= tOut ? [tIn, tOut] : null;
}
