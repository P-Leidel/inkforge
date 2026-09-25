import type { Vec2 } from '../geometry/vec2';

/**
 * Synthetic pointer samples, as a mouse drag would produce them. Used by the
 * stress tests (which must draw through the same Stroke pipeline as the
 * player) and by tests.
 */

/** Samples every `spacing` px along a polyline. */
export function dragAlong(path: readonly Vec2[], spacing = 2): Vec2[] {
  const first = path[0];
  if (!first) return [];
  const samples: Vec2[] = [first];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing));
    for (let s = 1; s <= steps; s++) {
      samples.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
    }
  }
  return samples;
}

/** A closed drag around a circle, ending back at its start. */
export function dragCircle(center: Vec2, radius: number, spacing = 2): Vec2[] {
  const steps = Math.max(12, Math.ceil((2 * Math.PI * radius) / spacing));
  const samples: Vec2[] = [];
  for (let k = 0; k <= steps; k++) {
    const angle = (k / steps) * 2 * Math.PI;
    samples.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
  }
  return samples;
}

/** A closed drag around a polygon's vertices, ending back at the first vertex. */
export function dragPolygon(vertices: readonly Vec2[], spacing = 2): Vec2[] {
  return dragAlong([...vertices, vertices[0]!], spacing);
}

/** A closed drag around an axis-aligned box given by its top-left corner and size. */
export function dragBox(x: number, y: number, width: number, height: number, spacing = 2): Vec2[] {
  return dragPolygon(
    [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
    spacing,
  );
}
