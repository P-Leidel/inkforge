import { convexPolygonsOverlap } from './overlap';
import { boundsOverlap, polygonBounds, type Polygon } from './polygon';
import type { Segment } from './segment';
import type { Vec2 } from './vec2';

/**
 * The outline of a band `radius` either side of a path of connected
 * segments: one side forward, the other back. Not exact at sharp bends, so
 * only for looks (a broken Piece's Debris).
 */
export function bandPolygon(segments: readonly Segment[], radius: number): Vec2[] {
  if (segments.length === 1) return capsulePolygon(segments[0]!, radius);
  const points = [segments[0]!.a, ...segments.map((s) => s.b)];
  const normals = segments.map(({ a, b }) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (a.y - b.y) / length, y: (b.x - a.x) / length };
  });
  const normalAt = (k: number) => {
    const before = normals[Math.max(0, k - 1)]!;
    const after = normals[Math.min(normals.length - 1, k)]!;
    const n = { x: before.x + after.x, y: before.y + after.y };
    const length = Math.hypot(n.x, n.y) || 1;
    return { x: n.x / length, y: n.y / length };
  };
  const left = points.map((p, k) => {
    const n = normalAt(k);
    return { x: p.x + n.x * radius, y: p.y + n.y * radius };
  });
  const right = points.map((p, k) => {
    const n = normalAt(k);
    return { x: p.x - n.x * radius, y: p.y - n.y * radius };
  });
  return [...left, ...right.reverse()];
}

/** A convex polygon enclosing a capsule (segment ab thickened by `radius`). */
export function capsulePolygon({ a, b }: Segment, radius: number, capVertices = 6): Vec2[] {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const points: Vec2[] = [];
  // Round caps, slightly outside the true circle so the polygon encloses it.
  const r = radius / Math.cos(Math.PI / (2 * capVertices));
  for (let k = 0; k <= capVertices; k++) {
    const t = angle - Math.PI / 2 + (k * Math.PI) / capVertices;
    points.push({ x: b.x + r * Math.cos(t), y: b.y + r * Math.sin(t) });
  }
  for (let k = 0; k <= capVertices; k++) {
    const t = angle + Math.PI / 2 + (k * Math.PI) / capVertices;
    points.push({ x: a.x + r * Math.cos(t), y: a.y + r * Math.sin(t) });
  }
  return points;
}

function edgeNormals(polygon: Polygon): Vec2[] {
  const normals: Vec2[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    if (length > 0) normals.push({ x: -(q.y - p.y) / length, y: (q.x - p.x) / length });
  }
  return normals;
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
 * How far convex polygon `moving` must travel along unit direction `u` to
 * stop overlapping convex polygon `fixed`: the first distance at which some
 * separating axis appears (exact for convex polygons).
 */
function exitDistance(moving: Polygon, fixed: Polygon, u: Vec2): number {
  let best = Infinity;
  for (const n of [...edgeNormals(moving), ...edgeNormals(fixed)]) {
    const [m0, m1] = project(moving, n);
    const [f0, f1] = project(fixed, n);
    if (m0 >= f1 || m1 <= f0) return 0; // already apart on this axis
    const speed = u.x * n.x + u.y * n.y;
    if (speed > 1e-9) best = Math.min(best, (f1 - m0) / speed);
    else if (speed < -1e-9) best = Math.min(best, (m1 - f0) / -speed);
  }
  return best;
}

function translate(polygon: Polygon, d: Vec2): Vec2[] {
  return polygon.map((p) => ({ x: p.x + d.x, y: p.y + d.y }));
}

/**
 * The shortest straight move that takes a body made of convex `parts` clear
 * of every polygon in `from`, to a place that overlaps nothing in `from` or
 * `blocked`. Tries `directions` evenly spread directions; null if none works.
 */
export function shortestWayOut(
  parts: readonly Polygon[],
  from: readonly Polygon[],
  blocked: readonly Polygon[],
  margin = 1,
  directions = 48,
): Vec2 | null {
  const candidates: { move: Vec2; distance: number }[] = [];
  for (let k = 0; k < directions; k++) {
    const angle = (k / directions) * 2 * Math.PI;
    const u = { x: Math.cos(angle), y: Math.sin(angle) };
    let distance = 0;
    for (const part of parts) {
      for (const obstacle of from) distance = Math.max(distance, exitDistance(part, obstacle, u));
    }
    if (!Number.isFinite(distance)) continue;
    distance += margin;
    candidates.push({ move: { x: u.x * distance, y: u.y * distance }, distance });
  }
  candidates.sort((p, q) => p.distance - q.distance);

  const obstacles = [...from, ...blocked].map((polygon) => ({
    polygon,
    bounds: polygonBounds(polygon),
  }));
  for (const { move } of candidates) {
    const moved = parts.map((part) => translate(part, move));
    const clear = moved.every((part) => {
      const bounds = polygonBounds(part);
      return obstacles.every(
        (o) => !boundsOverlap(bounds, o.bounds) || !convexPolygonsOverlap(part, o.polygon),
      );
    });
    if (clear) return move;
  }
  return null;
}
