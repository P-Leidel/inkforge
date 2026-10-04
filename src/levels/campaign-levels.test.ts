import { describe, expect, it } from 'vitest';
import { games } from '../game/test-support';
import { sentCounts } from '../game/wave-table';
import { CAMPAIGN_LEVELS } from './campaign-levels';
import { TUTORIAL_LEVEL } from './tutorial';

const createGame = games();

describe('The Campaign Levels', () => {
  it('are three, in order', () => {
    expect(CAMPAIGN_LEVELS.map((level) => level.name)).toEqual(['Level 1', 'Level 2', 'Level 3']);
  });

  it('send no Siege Walker yet, nor does the Tutorial', () => {
    for (const level of [TUTORIAL_LEVEL, ...CAMPAIGN_LEVELS])
      for (const wave of level.waves ?? [])
        expect(sentCounts(wave).siegeWalker, level.name).toBeUndefined();
  });

  it.each(CAMPAIGN_LEVELS.map((level) => [level.name, level] as const))(
    '%s loads at its first Wave',
    (_, level) => {
      const game = createGame(true);

      game.load(level);

      const reading = game.defence.reading;
      expect(reading).toMatchObject({ phase: 'intermission', wave: 1 });
      expect(reading.waves).toBe(level.waves!.length);
    },
  );
});
