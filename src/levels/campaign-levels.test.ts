import { describe, expect, it } from 'vitest';
import { games } from '../game/test-support';
import { CAMPAIGN_LEVELS } from './campaign-levels';

const createGame = games();

describe('The Campaign Levels', () => {
  it('are three, in order', () => {
    expect(CAMPAIGN_LEVELS.map((level) => level.name)).toEqual(['Level 1', 'Level 2', 'Level 3']);
  });

  it.each(CAMPAIGN_LEVELS.map((level) => [level.name, level] as const))(
    '%s loads at its first Wave',
    (_, level) => {
      const game = createGame(true);

      game.load(level);

      const reading = game.defence.reading;
      expect(reading).toMatchObject({ phase: 'intermission', wave: 1 });
      expect(reading.waves).toBeGreaterThanOrEqual(2);
      expect(reading.waves).toBeLessThanOrEqual(5);
    },
  );
});
