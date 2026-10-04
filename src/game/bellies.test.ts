import { describe, expect, it } from 'vitest';
import { COLOURS, type Colour } from '../materials/colour';
import { ENEMY_TYPES } from '../materials/enemy-types';
import type { Level } from './level';
import { games } from './test-support';

const createGame = games();

/** A Level with grey and green only: no red, so none of its Enemies explodes. */
const NO_RED: Level = {
  name: 'No red',
  tanks: { grey: 400, blue: 0, green: 200, black: 0, red: 0 },
};

/** The Bellies of `count` Enemies of each type sent in. */
function bellies(game: ReturnType<typeof createGame>, count: number): Set<Colour> {
  for (const type of ENEMY_TYPES) {
    for (let k = 0; k < count; k++) game.world.spawn(type, { x: 600, y: 300 });
  }
  return new Set(game.world.enemies.map(({ belly }) => belly));
}

describe('Enemy Bellies in the Game', () => {
  it('rolls only the Colours the Level has', () => {
    const game = createGame(true);
    game.load(NO_RED);
    expect([...bellies(game, 100)].sort()).toEqual(['green', 'grey']);
  });

  it('rolls every Colour with Ink costs off, when every Colour is on hand', () => {
    const game = createGame(false);
    game.load(NO_RED);
    expect([...bellies(game, 100)].sort()).toEqual([...COLOURS].sort());
  });

  it('follows the Colours as Ink costs go on and off', () => {
    const game = createGame(false);
    game.load(NO_RED);
    game.inkCosts = true;
    expect(bellies(game, 50).has('red')).toBe(false);
  });
});
