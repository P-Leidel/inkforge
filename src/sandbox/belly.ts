import { COLOURS, type Colour } from '../materials/colour';
import type { Random } from './random';

/**
 * Rolls an Enemy's Belly: one Colour, drawn by its type's `weights` from
 * the Colours `has` says the Level has, so a Level without red never has an
 * Enemy that explodes. It draws once from `random`, so it is part of replay
 * order. Every Enemy carries a Colour: if the Level has none, or gives the
 * ones it has no weight, it draws from what is left as evenly as it can,
 * the Level's Colours first.
 */
export function rollBelly(
  weights: Readonly<Record<Colour, number>>,
  has: (colour: Colour) => boolean,
  random: Random,
): Colour {
  const inLevel = COLOURS.filter(has);
  const pool = inLevel.length > 0 ? inLevel : [...COLOURS];
  const weightOf = (colour: Colour) => Math.max(0, weights[colour]);
  const total = pool.reduce((sum, colour) => sum + weightOf(colour), 0);
  const roll = random.next();
  if (total <= 0) return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))]!;
  let left = roll * total;
  for (const colour of pool) {
    left -= weightOf(colour);
    if (left < 0 && weightOf(colour) > 0) return colour;
  }
  // Rounding left a sliver: the last Colour with any weight.
  return pool.filter((colour) => weightOf(colour) > 0).at(-1)!;
}
