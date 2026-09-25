import { polygonArea, polygonPerimeter, type Polygon } from '../geometry/polygon';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import type { Colour } from './colour';
import type { MaterialTable } from './material-table';

/**
 * An Object's mass: the ink of its Outline (its length × the Line thickness)
 * plus the ink of its Fill (its area), each weighed by its Colour's density.
 * So an unfilled Object is a light, hollow shell, and weight follows the ink
 * spent on it.
 */
export function objectMass(
  outline: Polygon,
  colour: Colour,
  fill: Colour | null,
  table: MaterialTable,
): number {
  const outlineInk = polygonPerimeter(outline) * LINE_THICKNESS;
  const fillInk = fill ? polygonArea(outline) * table.colours[fill].fill.density : 0;
  return table.inkMass * (outlineInk * table.colours[colour].outline.density + fillInk);
}
