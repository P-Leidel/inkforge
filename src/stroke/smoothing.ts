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
