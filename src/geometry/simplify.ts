import { distancePointToSegment } from './segment';
import type { Vec2 } from './vec2';

/** Ramer–Douglas–Peucker simplification of an open polyline; keeps both end points. */
export function simplifyPolyline(points: readonly Vec2[], tolerance: number): Vec2[] {
  if (points.length <= 2) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDistance = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distancePointToSegment(points[i]!, points[first]!, points[last]!);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > tolerance) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Ramer–Douglas–Peucker simplification of a closed polygon. */
export function simplifyPolygon(points: readonly Vec2[], tolerance: number): Vec2[] {
  if (points.length <= 3) return [...points];
  // Split the ring at the vertex farthest from the first one, simplify both halves.
  const start = points[0]!;
  let far = 1;
  for (let i = 2; i < points.length; i++) {
    const di = (points[i]!.x - start.x) ** 2 + (points[i]!.y - start.y) ** 2;
    const df = (points[far]!.x - start.x) ** 2 + (points[far]!.y - start.y) ** 2;
    if (di > df) far = i;
  }
  const first = simplifyPolyline(points.slice(0, far + 1), tolerance);
  const second = simplifyPolyline([...points.slice(far), start], tolerance);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}
