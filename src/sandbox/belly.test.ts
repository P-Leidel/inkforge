import { describe, expect, it } from 'vitest';
import { COLOURS, type Colour } from '../materials/colour';
import { DEFAULT_ENEMY_TABLE } from '../materials/enemy-table';
import { ENEMY_TYPES } from '../materials/enemy-types';
import { rollBelly } from './belly';
import { Random } from './random';

const EVEN: Record<Colour, number> = { grey: 1, blue: 1, green: 1, black: 1, red: 1 };
const all = () => true;

/** How often each Colour comes up in `rolls` rolls from a generator seeded 7. */
function tally(
  weights: Record<Colour, number>,
  has: (colour: Colour) => boolean,
  rolls: number,
): Record<Colour, number> {
  const random = new Random(7);
  const counts: Record<Colour, number> = { grey: 0, blue: 0, green: 0, black: 0, red: 0 };
  for (let k = 0; k < rolls; k++) counts[rollBelly(weights, has, random)]++;
  return counts;
}

describe('Rolling a Belly', () => {
  it('never rolls a Colour the Level does not have', () => {
    const counts = tally(EVEN, (colour) => colour !== 'red' && colour !== 'blue', 2000);
    expect(counts.red).toBe(0);
    expect(counts.blue).toBe(0);
    expect(counts.grey + counts.green + counts.black).toBe(2000);
  });

  it("rolls each Colour by its type's weight, against the Colours the Level has", () => {
    const counts = tally({ ...EVEN, grey: 3, black: 1, red: 0 }, (c) => c !== 'blue', 4000);
    // Of grey 3, green 1, black 1 and red 0: three fifths, a fifth, a fifth, none.
    expect(counts.grey / 4000).toBeCloseTo(0.6, 1);
    expect(counts.green / 4000).toBeCloseTo(0.2, 1);
    expect(counts.black / 4000).toBeCloseTo(0.2, 1);
    expect(counts.red).toBe(0);
  });

  it('always rolls the one Colour of a Level that has only one', () => {
    expect(tally(EVEN, (colour) => colour === 'green', 100).green).toBe(100);
  });

  it('still rolls a Colour when the Level gives its own no weight, or has none', () => {
    const noWeight = { ...EVEN, grey: 0, black: 0 };
    const counts = tally(noWeight, (c) => c === 'grey' || c === 'black', 400);
    expect(counts.grey + counts.black).toBe(400);
    expect(counts.grey).toBeGreaterThan(0);
    expect(counts.black).toBeGreaterThan(0);
    expect(COLOURS).toContain(rollBelly(EVEN, () => false, new Random(1)));
  });

  it('draws once from the generator, so it is part of replay order', () => {
    const random = new Random(3);
    const next = new Random(3);
    next.next();
    rollBelly(EVEN, all, random);
    expect(random.state).toBe(next.state);
  });

  it('is the same from the same seed', () => {
    const roll = () => {
      const random = new Random(11);
      return Array.from({ length: 20 }, () => rollBelly(EVEN, all, random));
    };
    expect(roll()).toEqual(roll());
  });

  it('leans Heavies toward black, and gives every type some of every Colour', () => {
    const { heavy } = DEFAULT_ENEMY_TABLE.types;
    for (const colour of COLOURS) {
      if (colour !== 'black')
        expect(heavy.belly.weights.black).toBeGreaterThan(heavy.belly.weights[colour]);
    }
    for (const type of ENEMY_TYPES) {
      for (const colour of COLOURS) {
        expect(
          DEFAULT_ENEMY_TABLE.types[type].belly.weights[colour],
          `${type} ${colour}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('fills a Runner least, a Crawler more and a Heavy most', () => {
    const { crawler, runner, heavy } = DEFAULT_ENEMY_TABLE.types;
    expect(runner.belly.ink).toBeLessThan(crawler.belly.ink);
    expect(crawler.belly.ink).toBeLessThan(heavy.belly.ink);
  });
});
