import { distance, lerp, type Vec2 } from '../geometry/vec2';

/**
 * Resamples a polyline at even spacing, so smoothing behaves the same however
 * fast the pointer moved. Keeps the first and last point.
 */
export function resample(points: readonly Vec2[], spacing: number): Vec2[] {
  const first = points[0];
  if (!first) return [];
  const out: Vec2[] = [first];
  let carried = 0; // distance travelled since the last emitted point
  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1]!;
    const b = points[i]!;
    let segment = distance(a, b);
    while (carried + segment >= spacing) {
      const t = (spacing - carried) / segment;
      const p = lerp(a, b, t);
      out.push(p);
      a = p;
      segment = distance(a, b);
      carried = 0;
    }
    carried += segment;
  }
  const last = points[points.length - 1]!;
  if (distance(out[out.length - 1]!, last) > spacing * 0.25) out.push(last);
  else out[out.length - 1] = last;
  return out;
}

/** Resamples a closed ring at even spacing, including along the closing edge. */
export function resampleClosed(ring: readonly Vec2[], spacing: number): Vec2[] {
  const first = ring[0];
  if (!first) return [];
  const out = resample([...ring, first], spacing);
  out.pop(); // the repeated first point
  return out;
}
