import { polygonBounds } from '../geometry/polygon';
import { segmentsIntersect, type Segment } from '../geometry/segment';
import type { Vec2 } from '../geometry/vec2';

/** A rectangle in whole px. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The smallest rectangle in whole px holding every point within `reach` px of `points`. */
export function rectAround(points: readonly Vec2[], reach: number): Rect {
  const { minX, minY, maxX, maxY } = polygonBounds(points);
  const x = Math.floor(minX - reach);
  const y = Math.floor(minY - reach);
  return { x, y, width: Math.ceil(maxX + reach) - x, height: Math.ceil(maxY + reach) - y };
}

/**
 * Tiles at most `size` px square that cover everything within `reach` px of
 * `segments`: the rectangle around them cut into a grid from its top-left
 * corner, leaving out the tiles nothing reaches. A long diagonal Line then
 * needs a strip of tiles instead of a texture the size of its bounds.
 */
export function tilesAlong(segments: readonly Segment[], reach: number, size: number): Rect[] {
  if (segments.length === 0) return [];
  const around = rectAround(
    segments.flatMap(({ a, b }) => [a, b]),
    reach,
  );
  const tiles: Rect[] = [];
  for (let y = around.y; y < around.y + around.height; y += size) {
    for (let x = around.x; x < around.x + around.width; x += size) {
      const tile = {
        x,
        y,
        width: Math.min(size, around.x + around.width - x),
        height: Math.min(size, around.y + around.height - y),
      };
      const grown = grow(tile, reach);
      if (segments.some(({ a, b }) => segmentMeetsRect(a, b, grown))) tiles.push(tile);
    }
  }
  return tiles;
}

function grow({ x, y, width, height }: Rect, by: number): Rect {
  return { x: x - by, y: y - by, width: width + 2 * by, height: height + 2 * by };
}

function contains({ x, y, width, height }: Rect, p: Vec2): boolean {
  return p.x >= x && p.x <= x + width && p.y >= y && p.y <= y + height;
}

/** Whether any of the segment from `a` to `b` lies in the rectangle. */
export function segmentMeetsRect(a: Vec2, b: Vec2, rect: Rect): boolean {
  if (contains(rect, a) || contains(rect, b)) return true;
  const { x, y, width, height } = rect;
  const corners = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
  return corners.some((c, k) => segmentsIntersect(a, b, c, corners[(k + 1) % 4]!));
}
