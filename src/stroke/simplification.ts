import { simplifyPolygon, simplifyPolyline } from '../geometry/simplify';
import { cross, distance, type Vec2 } from '../geometry/vec2';

interface Excursion {
  /** Path length from point i to point j. */
  length: number;
  /** Twice the area enclosed by the path from i to j and the chord back to i. */
  doubleArea: number;
}

/** Prefix sums over a point list, to measure any sub-path in O(1). */
function measureExcursions(points: readonly Vec2[]) {
  const lengths = [0];
  const shoelace = [0];
  for (let k = 1; k < points.length; k++) {
    lengths.push(lengths[k - 1]! + distance(points[k - 1]!, points[k]!));
    shoelace.push(shoelace[k - 1]! + cross(points[k - 1]!, points[k]!));
  }
  return (i: number, j: number): Excursion => ({
    length: lengths[j]! - lengths[i]!,
    doubleArea: Math.abs(shoelace[j]! - shoelace[i]! + cross(points[j]!, points[i]!)),
  });
}

/**
 * Whether the path from i to j is a thin spike: it returns to within
 * `thickness` of where it left, and on average it is thinner than
 * `thickness` (a loop or bulge is wider and is kept).
 */
function isSpike(
  points: readonly Vec2[],
  i: number,
  j: number,
  thickness: number,
  measure: ReturnType<typeof measureExcursions>,
): boolean {
  if (distance(points[i]!, points[j]!) >= thickness) return false;
  const { length, doubleArea } = measure(i, j);
  if (length < 2 * thickness) return false; // a small wiggle, not a spike
  // Enclosed area / half the path length is the excursion's average width.
  return doubleArea / length < thickness;
}

/**
 * Cuts off thin spikes in the middle of an open Stroke. A spike is an
 * out-and-back thinner than `thickness`; the Stroke then runs straight
 * across its base. A Stroke that doubles back at its end keeps that part.
 */
export function flattenSpikesOpen(points: readonly Vec2[], thickness: number): Vec2[] {
  let current = [...points];
  for (;;) {
    const n = current.length;
    const measure = measureExcursions(current);
    const out: Vec2[] = [];
    let changed = false;
    let i = 0;
    while (i < n) {
      out.push(current[i]!);
      let spikeEnd = -1;
      if (i > 0) {
        for (let j = n - 2; j >= i + 2; j--) {
          if (isSpike(current, i, j, thickness, measure)) {
            spikeEnd = j;
            break;
          }
        }
      }
      if (spikeEnd >= 0) {
        i = spikeEnd;
        changed = true;
      } else {
        i++;
      }
    }
    current = out;
    if (!changed) return current;
  }
}

/**
 * Cuts off thin spikes and thin notches of a closed outline, so no convex
 * piece of the Object is a sliver.
 */
export function flattenSpikesClosed(points: readonly Vec2[], thickness: number): Vec2[] {
  let current = [...points];
  for (;;) {
    const n = current.length;
    if (n < 4) return current;
    // Walk the ring twice so excursions may wrap past the first point.
    const ring = [...current, ...current];
    const measure = measureExcursions(ring);
    const perimeter = measure(0, n).length;
    let cut: [number, number] | null = null;
    for (let i = 0; i < n && !cut; i++) {
      for (let j = i + Math.floor(n / 2); j >= i + 2; j--) {
        if (measure(i, j).length > perimeter / 2) continue;
        if (isSpike(ring, i, j, thickness, measure)) {
          cut = [i, j];
          break;
        }
      }
    }
    if (!cut) return current;
    const [i, j] = cut;
    // Keep ring[j .. i + n], i.e. drop the points strictly between i and j.
    current = ring.slice(j, i + n + 1);
  }
}

/**
 * Simplifies to at most `maxPoints` points, starting at `tolerance` px and
 * loosening until the cap holds.
 */
export function simplifyCapped(
  points: readonly Vec2[],
  tolerance: number,
  maxPoints: number,
  closed: boolean,
): Vec2[] {
  let t = tolerance;
  for (;;) {
    const simplified = closed ? simplifyPolygon(points, t) : simplifyPolyline(points, t);
    if (simplified.length <= maxPoints) return simplified;
    t *= 1.5;
  }
}
