import { convexPolygonsOverlap } from '../geometry/overlap';
import type { Polygon } from '../geometry/polygon';
import { SANDBOX_ARENA } from '../sandbox/arena';
import type { StrokeContext } from './stroke-pipeline';

/**
 * Helpers for tests of the Stroke pipeline alone. Only test files import
 * this module.
 */

/**
 * An Arena with only the Terrain in it, as the Arena query would answer for
 * it: the Terrain cuts a Line and blocks an Object.
 */
export function terrainOnly(terrain: readonly Polygon[] = SANDBOX_ARENA.terrain): StrokeContext {
  return {
    lineCutters: () => terrain,
    overlapsSolid: (part) => terrain.some((solid) => convexPolygonsOverlap(part, solid)),
  };
}
