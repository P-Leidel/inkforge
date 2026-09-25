import { polygonArea, polygonPerimeter, type Polygon } from '../geometry/polygon';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import type { Colour } from './colour';
import type { MaterialTable } from './material-table';

/*
 * An Object weighs the ink of its Outline (its length × the Line thickness)
 * plus the ink of its Fill (its area), each weighed by its Colour's density.
 * So an unfilled Object is a light, hollow shell, and weight follows the ink
 * spent on it.
 */

export function outlineMass(outline: Polygon, colour: Colour, table: MaterialTable): number {
  const ink = polygonPerimeter(outline) * LINE_THICKNESS;
  return table.inkMass * ink * table.colours[colour].outline.density;
}

export function fillMass(outline: Polygon, fill: Colour | null, table: MaterialTable): number {
  if (!fill) return 0;
  return table.inkMass * polygonArea(outline) * table.colours[fill].fill.density;
}

export function objectMass(
  outline: Polygon,
  colour: Colour,
  fill: Colour | null,
  table: MaterialTable,
): number {
  return outlineMass(outline, colour, table) + fillMass(outline, fill, table);
}
