import { segmentsIntersect } from './segment';
import { cross, sub, type Vec2 } from './vec2';

/** A closed polygon as its vertex list; the last vertex connects back to the first. */
export type Polygon = readonly Vec2[];

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Shoelace area with sign. With y pointing down, a positive area means the
 * vertices run clockwise on screen.
 */
export function signedArea(polygon: Polygon): number {
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    sum += polygon[j]!.x * polygon[i]!.y - polygon[i]!.x * polygon[j]!.y;
  }
  return sum / 2;
}

export function polygonArea(polygon: Polygon): number {
  return Math.abs(signedArea(polygon));
}

/** Length of the closed polygon's edge. */
export function polygonPerimeter(polygon: Polygon): number {
  let total = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    total += Math.hypot(polygon[i]!.x - polygon[j]!.x, polygon[i]!.y - polygon[j]!.y);
  }
  return total;
}

/** The polygon with its vertices ordered so that its signed area is positive. */
export function withPositiveArea(polygon: Polygon): Vec2[] {
  return signedArea(polygon) < 0 ? [...polygon].reverse() : [...polygon];
}

/** Area centroid (centre of mass for uniform density). */
export function polygonCentroid(polygon: Polygon): Vec2 {
  let cx = 0;
  let cy = 0;
  let area2 = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]!;
    const b = polygon[i]!;
    const f = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * f;
    cy += (a.y + b.y) * f;
    area2 += f;
  }
  if (Math.abs(area2) < 1e-12) {
    // Degenerate: fall back to the vertex average.
    const n = polygon.length || 1;
    return {
      x: polygon.reduce((s, p) => s + p.x, 0) / n,
      y: polygon.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * area2), y: cy / (3 * area2) };
}

export function polygonBounds(points: readonly Vec2[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function boundsOverlap(a: Bounds, b: Bounds, margin = 0): boolean {
  return (
    a.minX - margin <= b.maxX &&
    b.minX - margin <= a.maxX &&
    a.minY - margin <= b.maxY &&
    b.minY - margin <= a.maxY
  );
}

/** Even-odd point-in-polygon test. Points exactly on an edge may go either way. */
export function polygonContainsPoint(polygon: Polygon, p: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Whether every interior angle is at most 180° (collinear vertices allowed). */
export function isConvex(polygon: Polygon): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    const c = polygon[(i + 2) % n]!;
    const turn = cross(sub(b, a), sub(c, b));
    if (Math.abs(turn) < 1e-9) continue;
    const s = Math.sign(turn);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

/** Whether any two non-adjacent edges of the closed polygon touch or cross. */
export function isSelfIntersecting(polygon: Polygon): boolean {
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a1 = polygon[i]!;
    const a2 = polygon[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the closing edge
      const b1 = polygon[j]!;
      const b2 = polygon[(j + 1) % n]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}
