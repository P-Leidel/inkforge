import type { Vec2 } from '../geometry/vec2';

/**
 * Removes hand jitter with repeated [1 2 1] / 4 averaging, which approximates
 * a Gaussian blur of `sigma` px along evenly spaced points. An open Stroke
 * keeps its end points; a closed one wraps around.
 */
export function smooth(
  points: readonly Vec2[],
  spacing: number,
  sigma: number,
  closed: boolean,
): Vec2[] {
  // Each pass adds a variance of half a sample spacing squared.
  const passes = Math.round(2 * (sigma / spacing) ** 2);
  let current = [...points];
  const n = current.length;
  if (n < 3) return current;
  for (let pass = 0; pass < passes; pass++) {
    const next = current.map((p, i) => {
      if (!closed && (i === 0 || i === n - 1)) return p;
      const prev = current[(i - 1 + n) % n]!;
      const after = current[(i + 1) % n]!;
      return { x: (prev.x + 2 * p.x + after.x) / 4, y: (prev.y + 2 * p.y + after.y) / 4 };
    });
    current = next;
  }
  return current;
}

/**
 * Smooths each run between corners on its own, with the corners pinned, so
 * drawn corners stay sharp while the sides between them lose their jitter.
 * `corners` are indices into `points`, in order.
 */
export function smoothBetweenCorners(
  points: readonly Vec2[],
  corners: readonly number[],
  spacing: number,
  sigma: number,
  closed: boolean,
): Vec2[] {
  if (corners.length === 0) return smooth(points, spacing, sigma, closed);
  const out: Vec2[] = [];
  if (!closed) {
    const cuts = [0, ...corners, points.length - 1];
    for (let k = 0; k < cuts.length - 1; k++) {
      const run = smooth(points.slice(cuts[k], cuts[k + 1]! + 1), spacing, sigma, false);
      out.push(...(k === 0 ? run : run.slice(1)));
    }
    return out;
  }
  for (let k = 0; k < corners.length; k++) {
    const start = corners[k]!;
    const end = corners[(k + 1) % corners.length]!;
    const run =
      end > start
        ? points.slice(start, end + 1)
        : [...points.slice(start), ...points.slice(0, end + 1)];
    // Each run ends on the corner that starts the next one.
    out.push(...smooth(run, spacing, sigma, false).slice(0, -1));
  }
  return out;
}
