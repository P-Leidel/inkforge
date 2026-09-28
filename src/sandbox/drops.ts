import { COLOURS, type Colour } from '../materials/colour';
import type { DropRange } from '../materials/enemy-table';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import type { Random } from './random';

/** The Ink of each Colour a Drop holds, px². */
export type DropInk = Readonly<Record<Colour, number>>;

/**
 * Draws a Drop from an Enemy type's ranges: an amount of every Colour, in
 * palette order, each drawn evenly from its range in Line length and given
 * as Ink (px²). It draws once per Colour from `random`, so it is part of
 * replay order.
 */
export function drawDrop(ranges: Readonly<Record<Colour, DropRange>>, random: Random): DropInk {
  return Object.fromEntries(
    COLOURS.map((colour) => {
      const { min, max } = ranges[colour];
      return [colour, Math.max(0, random.range(min, max)) * LINE_THICKNESS];
    }),
  ) as Record<Colour, number>;
}
