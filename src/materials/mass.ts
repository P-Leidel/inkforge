import type { Polygon } from '../geometry/polygon';
import type { Colour } from './colour';
import { fillInk, outlineInk } from './ink';
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

export function fillMass(outline: Polygon, fill: Colour | null, table: MaterialTable): number {
  if (!fill) return 0;
  return table.inkMass * fillInk(outline) * table.colours[fill].fill.density;
}

export function objectMass(
  outline: Polygon,
  colour: Colour,
  fill: Colour | null,
  table: MaterialTable,
): number {
  return outlineMass(outline, colour, table) + fillMass(outline, fill, table);
}
