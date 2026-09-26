import { capsuleOverlapsPolygon } from '../geometry/overlap';
import type { Polygon } from '../geometry/polygon';
import {
  distancePointToSegment,
  distanceSegmentToSegment,
  type Segment,
} from '../geometry/segment';
import type { Vec2 } from '../geometry/vec2';

/**
 * The Eraser's brush: everything closer than `radius` px to its path, a
 * pointer drag. A click is a path of one point.
 */
export interface Brush {
  readonly path: readonly Vec2[];
  readonly radius: number;
}

/** The brush's path as segments; a single point is a segment of no length. */
function segmentsOf({ path }: Brush): Segment[] {
  if (path.length === 1) return [{ a: path[0]!, b: path[0]! }];
  return path.slice(1).map((b, k) => ({ a: path[k]!, b }));
}

/** Whether the brush touches a polygon (convex or not), in world coordinates. */
export function brushTouchesPolygon(brush: Brush, polygon: Polygon): boolean {
  return segmentsOf(brush).some(({ a, b }) =>
    capsuleOverlapsPolygon(a, b, brush.radius, polygon, 0),
  );
}

/** Whether the brush touches capsules of `radius` round `segments`: a Piece, or a Patch. */
export function brushTouchesCapsules(
  brush: Brush,
  segments: readonly Segment[],
  radius: number,
): boolean {
  const reach = brush.radius + radius;
  return segmentsOf(brush).some(({ a, b }) =>
    segments.some((s) => distanceSegmentToSegment(a, b, s.a, s.b) < reach),
  );
}

/** Whether the brush touches a circle: Rubble, or a Droplet. */
export function brushTouchesCircle(brush: Brush, centre: Vec2, radius: number): boolean {
  const reach = brush.radius + radius;
  return segmentsOf(brush).some(({ a, b }) => distancePointToSegment(centre, a, b) < reach);
}
