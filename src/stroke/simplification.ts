import { simplifyPolygon, simplifyPolyline } from '../geometry/simplify';
import { cross, distance, type Vec2 } from '../geometry/vec2';

/** Prefix sums over a point list, to measure any sub-path in O(1). */
function measureExcursions(points: readonly Vec2[]) {
  const n = points.length;
  const lengths = new Float64Array(n);
  const shoelace = new Float64Array(n);
  let maxStep = 0;
  for (let k = 1; k < n; k++) {
    const step = distance(points[k - 1]!, points[k]!);
    maxStep = Math.max(maxStep, step);
    lengths[k] = lengths[k - 1]! + step;
    shoelace[k] = shoelace[k - 1]! + cross(points[k - 1]!, points[k]!);
  }
  return {
    /** Longest distance between consecutive points. */
    maxStep,
    /** Path length from point i to point j. */
    length: (i: number, j: number) => lengths[j]! - lengths[i]!,
    /** Twice the area enclosed by the path from i to j and the chord back to i. */
    doubleArea: (i: number, j: number) =>
      Math.abs(shoelace[j]! - shoelace[i]! + cross(points[j]!, points[i]!)),
  };
}

type Measure = ReturnType<typeof measureExcursions>;

/**
 * The last j in [jMin, jMax], searching downwards, where the path from i to j
 * is a thin spike: it returns to within `thickness` of where it left, it is
 * long for its width, and the region it encloses is clearly thinner than
 * `thickness`. A loop or a small blob is wider and is kept. Returns -1 if
 * there is none.
 */
function findSpikeEnd(
  points: readonly Vec2[],
  i: number,
  jMin: number,
  jMax: number,
  thickness: number,
  measure: Measure,
  maxLength = Infinity,
): number {
  const p = points[i]!;
  const step = Math.max(measure.maxStep, 1e-9);
  let j = jMax;
  while (j >= jMin) {
    const q = points[j]!;
    const chord = Math.sqrt((q.x - p.x) ** 2 + (q.y - p.y) ** 2);
    if (chord >= thickness) {
      // Consecutive points are at most `step` apart, so the next points down
      // can't come within `thickness` of p any sooner than this.
      j -= Math.max(1, Math.floor((chord - thickness) / step));
      continue;
    }
    const length = measure.length(i, j);
    // 2 · area / perimeter is between half and all of the region's widest
    // point, so below thickness / 2 the spike is thinner than a Line.
    if (
      length >= 4 * thickness &&
      length <= maxLength &&
      measure.doubleArea(i, j) / (length + chord) < thickness / 2
    ) {
      return j;
    }
    j--;
  }
  return -1;
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
      const spikeEnd = i > 0 ? findSpikeEnd(current, i, i + 2, n - 2, thickness, measure) : -1;
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
    const halfPerimeter = measure.length(0, n) / 2;
    let cut: [number, number] | null = null;
    for (let i = 0; i < n && !cut; i++) {
      const j = findSpikeEnd(
        ring,
        i,
        i + 2,
        i + Math.floor(n / 2),
        thickness,
        measure,
        halfPerimeter,
      );
      if (j >= 0) cut = [i, j];
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
