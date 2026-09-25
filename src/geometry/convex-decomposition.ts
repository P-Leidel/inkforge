import { isConvex, signedArea, type Polygon } from './polygon';
import { cross, sub, type Vec2 } from './vec2';

/**
 * Splits a simple polygon into convex parts of at most `maxVertices`
 * vertices that together cover it exactly: ear-clipping triangulation, then
 * Hertel–Mehlhorn merging of neighbouring parts while they stay convex.
 */
export function decomposeConvex(polygon: Polygon, maxVertices: number): Vec2[][] {
  const points = signedArea(polygon) < 0 ? [...polygon].reverse() : [...polygon];
  if (points.length <= maxVertices && isConvex(points)) return [points];
  const triangles = triangulate(points);
  return mergeConvex(points, triangles, maxVertices).map((part) => part.map((i) => points[i]!));
}

/** Ear clipping of a simple polygon with positive signed area, as vertex index triples. */
function triangulate(points: readonly Vec2[]): number[][] {
  const remaining = points.map((_, i) => i);
  const triangles: number[][] = [];
  const turn = (a: number, b: number, c: number) =>
    cross(sub(points[b]!, points[a]!), sub(points[c]!, points[b]!));

  while (remaining.length > 3) {
    const n = remaining.length;
    let ear = -1;
    for (let k = 0; k < n && ear < 0; k++) {
      const a = remaining[(k - 1 + n) % n]!;
      const b = remaining[k]!;
      const c = remaining[(k + 1) % n]!;
      if (turn(a, b, c) <= 1e-9) continue; // reflex or straight
      const triangle = [points[a]!, points[b]!, points[c]!];
      const blocked = remaining.some(
        (i) => i !== a && i !== b && i !== c && pointInOrOnTriangle(points[i]!, triangle),
      );
      if (!blocked) ear = k;
    }
    if (ear < 0) {
      // Numerically stuck (nearly collinear run): drop the flattest vertex.
      let flattest = 0;
      let smallest = Infinity;
      for (let k = 0; k < n; k++) {
        const t = Math.abs(
          turn(remaining[(k - 1 + n) % n]!, remaining[k]!, remaining[(k + 1) % n]!),
        );
        if (t < smallest) {
          smallest = t;
          flattest = k;
        }
      }
      remaining.splice(flattest, 1);
      continue;
    }
    const a = remaining[(ear - 1 + n) % n]!;
    const b = remaining[ear]!;
    const c = remaining[(ear + 1) % n]!;
    triangles.push([a, b, c]);
    remaining.splice(ear, 1);
  }
  if (remaining.length === 3) triangles.push([...remaining]);
  return triangles;
}

function pointInOrOnTriangle(p: Vec2, [a, b, c]: Vec2[]): boolean {
  const d1 = cross(sub(b!, a!), sub(p, a!));
  const d2 = cross(sub(c!, b!), sub(p, b!));
  const d3 = cross(sub(a!, c!), sub(p, c!));
  return d1 >= -1e-9 && d2 >= -1e-9 && d3 >= -1e-9;
}

/** Greedily removes shared diagonals while the merged part stays convex and small enough. */
function mergeConvex(points: readonly Vec2[], parts: number[][], maxVertices: number): number[][] {
  const current = parts.map((p) => [...p]);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let p = 0; p < current.length; p++) {
      for (let q = p + 1; q < current.length; q++) {
        const joined = joinAtSharedEdge(current[p]!, current[q]!);
        if (!joined || joined.length > maxVertices) continue;
        if (!isConvex(joined.map((i) => points[i]!))) continue;
        current[p] = joined;
        current.splice(q, 1);
        merged = true;
        break outer;
      }
    }
  }
  return current;
}

/**
 * If parts a and b (both with positive orientation) share an edge, the
 * part formed by removing it; otherwise null.
 */
function joinAtSharedEdge(a: readonly number[], b: readonly number[]): number[] | null {
  for (let i = 0; i < a.length; i++) {
    const u = a[i]!;
    const v = a[(i + 1) % a.length]!;
    // b runs the shared edge the other way: v → u.
    const j = b.indexOf(v);
    if (j < 0 || b[(j + 1) % b.length] !== u) continue;
    // a from v round to u, then b's vertices strictly between u and v.
    const fromA = rotate(a, (i + 1) % a.length); // starts at v, ends at u
    const fromB = rotate(b, (j + 1) % b.length).slice(1, -1); // starts at u, ends at v
    return [...fromA, ...fromB];
  }
  return null;
}

function rotate<T>(items: readonly T[], start: number): T[] {
  return [...items.slice(start), ...items.slice(0, start)];
}
