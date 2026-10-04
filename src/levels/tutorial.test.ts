import { describe, expect, it } from 'vitest';
import { checkArenaSize } from '../game/level';
import { games } from '../game/test-support';
import { sentCounts } from '../game/wave-table';
import { COLOURS } from '../materials/colour';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import { TUTORIAL_LEVEL } from './tutorial';

const createGame = games();

describe('The Tutorial Level', () => {
  it('is one screen, with grey and black, and three Waves of 2, 3 and 4 Crawlers', () => {
    const game = createGame(true);

    game.load(TUTORIAL_LEVEL);

    expect(() => checkArenaSize(TUTORIAL_LEVEL.arena!)).not.toThrow();
    expect(COLOURS.filter((colour) => game.has(colour))).toEqual(['grey', 'black']);
    expect(TUTORIAL_LEVEL.waves!.map((wave) => sentCounts(wave))).toEqual([
      { crawler: 2 },
      { crawler: 3 },
      { crawler: 4 },
    ]);
  });

  it('teaches the goal and the controls before Wave 1, killing and Bellies before Wave 2, pebble vs stone before Wave 3', () => {
    expect(TUTORIAL_LEVEL.cards!.map((cards) => cards.map((card) => card.title))).toEqual([
      ['Defend the Ink Core', 'Draw', 'Close it into an Object', 'Fill and Release'],
      ['Crush them', 'Full of ink'],
      ['Pebble or stone?'],
    ]);
    expect(
      TUTORIAL_LEVEL.cards!.at(-1)!
        .at(-1)!
        .swatches.map((swatch) => swatch.colour),
    ).toEqual(['grey', 'black']);
  });

  it('names no side: Enemies come from the Spawn arrows', () => {
    const goal = TUTORIAL_LEVEL.cards![0]![0]!.body;

    expect(goal).toContain('from the Spawn arrows toward the Ink Core');
    expect(goal).not.toMatch(/\b(left|right)\b/);
  });

  it('lets a Crawler sent in with no defence reach the Ink Core', () => {
    const game = createGame(true);
    game.load(TUTORIAL_LEVEL);
    game.togglePause();

    for (let step = 0; step < Math.round(60 / STEP_SECONDS); step++) {
      if (game.world.inkCore.hp < game.world.inkCore.fullHp) break;
      game.step();
    }

    expect(game.world.inkCore.hp).toBeLessThan(game.world.inkCore.fullHp);
  });
});
