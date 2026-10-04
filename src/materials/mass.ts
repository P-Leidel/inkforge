import type { Polygon } from '../geometry/polygon';
import type { Colour } from './colour';
import type { EnemyMaterial } from './enemy-table';
import type { Segment } from '../geometry/segment';
import { fillInk, lineInk, outlineInk } from './ink';
import type { MaterialTable } from './material-table';

/*
 * An Object weighs the ink of its Outline (its length × the Line thickness)
 * plus the ink of its Fill (its area), each weighed by its Colour's density.
 * So an unfilled Object is a light, hollow shell, and weight follows the ink
 * spent on it.
 */

export function outlineMass(outline: Polygon, colour: Colour, table: MaterialTable): number {
  return table.inkMass * outlineInk(outline) * table.colours[colour].outline.density;
}

/**
 * A Line that isn't Grounded weighs its ink (its length × its thickness),
 * weighed by its Colour's Outline density, as an Object's Outline does: a
 * black bar is heavy, a blue one light.
 */
export function lineMass(
  segments: readonly Segment[],
  thickness: number,
  colour: Colour,
  table: MaterialTable,
): number {
  return table.inkMass * lineInk(segments, thickness) * table.colours[colour].outline.density;
}

export function fillMass(outline: Polygon, fill: Colour | null, table: MaterialTable): number {
  if (!fill) return 0;
  return table.inkMass * fillInk(outline) * table.colours[fill].fill.density;
}

/**
 * An Enemy weighs the `area` (px²) of its body's shape as ink of its type's
 * density: a box's whole width × height, the Siege Walker's hull and legs.
 */
export function enemyMass(enemy: EnemyMaterial, area: number, table: MaterialTable): number {
  return table.inkMass * area * enemy.density;
}

export function objectMass(
  outline: Polygon,
  colour: Colour,
  fill: Colour | null,
  table: MaterialTable,
): number {
  return outlineMass(outline, colour, table) + fillMass(outline, fill, table);
}
