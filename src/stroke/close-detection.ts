import { segmentsIntersect } from '../geometry/segment';
import { cross, distance, pathLength, sub, type Vec2 } from '../geometry/vec2';
import { CLOSE_RADIUS, MIN_CLOSING_LENGTH } from './stroke-rules';

/**
 * Whether a Stroke closes into an Object: its end is within CLOSE_RADIUS of
 * its start, and it is long enough that a short scribble doesn't snap shut.
 * The scene uses the same test to show the close marker while drawing.
 */
export function isClosingStroke(samples: readonly Vec2[]): boolean {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last || samples.length < 3) return false;
  return distance(first, last) <= CLOSE_RADIUS && pathLength(samples) >= MIN_CLOSING_LENGTH;
}

/**
 * The closed outline of a closing Stroke. If the end overshoots past the
 * start and crosses the beginning of the Stroke, both loose ends are cut off
 * at the crossing; otherwise the gap is closed with a straight edge.
 */
export function closeRing(samples: readonly Vec2[]): Vec2[] {
  const window = 2 * CLOSE_RADIUS;
  const n = samples.length;
  const head: number[] = [];
  for (let i = 0, travelled = 0; i < n - 1 && travelled <= window; i++) {
    head.push(i);
    travelled += distance(samples[i]!, samples[i + 1]!);
  }
  const tail: number[] = [];
  for (let j = n - 2, travelled = 0; j > 0 && travelled <= window; j--) {
    tail.push(j);
    travelled += distance(samples[j]!, samples[j + 1]!);
  }
  // Earliest head segment and latest tail segment that cross: the largest loop.
  for (const i of head) {
    for (const j of tail) {
      if (j <= i + 1) continue;
      const a1 = samples[i]!;
      const a2 = samples[i + 1]!;
      const b1 = samples[j]!;
      const b2 = samples[j + 1]!;
      if (!segmentsIntersect(a1, a2, b1, b2)) continue;
      const crossing = intersection(a1, a2, b1, b2);
      return [crossing, ...samples.slice(i + 1, j + 1)];
    }
  }
  const ring = [...samples];
  // Drop an end sample that lands (almost) on the start.
  if (distance(ring[0]!, ring[ring.length - 1]!) < 1) ring.pop();
  return ring;
}

function intersection(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 {
  const r = sub(a2, a1);
  const s = sub(b2, b1);
  const denominator = cross(r, s);
  if (Math.abs(denominator) < 1e-12) return a2; // collinear overlap: any shared point will do
  const t = cross(sub(b1, a1), s) / denominator;
  return { x: a1.x + r.x * t, y: a1.y + r.y * t };
}
