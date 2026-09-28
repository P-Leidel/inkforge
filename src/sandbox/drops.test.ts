import { describe, expect, it } from 'vitest';
import { COLOURS } from '../materials/colour';
import { DEFAULT_ENEMY_TABLE, ENEMY_TYPES } from '../materials/enemy-table';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import { drawDrop } from './drops';
import { Random } from './random';

describe('A Drop', () => {
  it("holds every Colour within its type's range, in Line length", () => {
    const random = new Random(3);
    for (const type of ENEMY_TYPES) {
      const ranges = DEFAULT_ENEMY_TABLE.types[type].drop;
      for (let k = 0; k < 200; k++) {
        const ink = drawDrop(ranges, random);
        for (const colour of COLOURS) {
          const length = ink[colour] / LINE_THICKNESS;
          expect(length).toBeGreaterThanOrEqual(ranges[colour].min);
          expect(length).toBeLessThanOrEqual(ranges[colour].max);
        }
      }
    }
  });

  it('repeats for the same seed, and draws once per Colour', () => {
    const ranges = DEFAULT_ENEMY_TABLE.types.heavy.drop;
    const a = new Random(42);
    const b = new Random(42);

    expect(drawDrop(ranges, a)).toEqual(drawDrop(ranges, b));
    const c = new Random(42);
    for (let k = 0; k < COLOURS.length; k++) c.next();
    expect(a.state).toBe(c.state);
  });
});
