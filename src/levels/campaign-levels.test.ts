import { describe, expect, it } from 'vitest';
import { Campaign } from '../game/campaign';
import type { Level } from '../game/level';
import { Session } from '../game/session';
import { games } from '../game/test-support';
import { sentCounts } from '../game/wave-table';
import { CAMPAIGN_LEVELS } from './campaign-levels';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import { LEVEL_4 } from './level-4';
import { TUTORIAL_LEVEL } from './tutorial';

const createGame = games();

describe('The Campaign Levels', () => {
  it('are four, in order, the boss Level last', () => {
    expect(CAMPAIGN_LEVELS.map((level) => level.name)).toEqual([
      'Level 1',
      'Level 2',
      'Level 3',
      'Level 4 · Siege Walker',
    ]);
    expect(CAMPAIGN_LEVELS.at(-1)).toBe(LEVEL_4);
  });

  it('send a Siege Walker only in the boss Level; the Tutorial sends none', () => {
    for (const level of [TUTORIAL_LEVEL, ...CAMPAIGN_LEVELS])
      for (const wave of level.waves ?? [])
        if (level !== LEVEL_4) expect(sentCounts(wave).siegeWalker, level.name).toBeUndefined();
    expect(LEVEL_4.waves!.some((wave) => sentCounts(wave).siegeWalker === 1)).toBe(true);
  });

  describe('played through', () => {
    /** The Campaign's Levels with their Waves emptied, so each ends on its first step. */
    const EMPTIED: readonly Level[] = CAMPAIGN_LEVELS.map((level) => ({
      ...level,
      waves: level.waves!.map(() => ({ sends: [], gap: 1 })),
    }));

    /** A Session over a Campaign of `EMPTIED`, saving to `record`; plays Level `index` out. */
    function clearLevel(index: number, record: { value: string | null }) {
      const game = createGame(true);
      const store = { read: () => record.value, write: (value: string) => (record.value = value) };
      const campaign = new Campaign(EMPTIED, store);
      const session = new Session(game, campaign);
      const phase = () => game.defence.reading.phase;
      expect(session.playCampaign(index)).toBe('started');
      while (phase() === 'intermission') {
        session.cards.close();
        game.togglePause();
        for (let k = 0; k < 600 && phase() === 'wave'; k++) session.advance(STEP_SECONDS);
      }
      expect(phase()).toBe('cleared');
      return { campaign, session };
    }

    it('unlocks Level 4 once Level 3 is cleared, and saves it; Level 3 offers Next Level', () => {
      const record = { value: JSON.stringify({ unlocked: 3 }) };
      expect(new Campaign(EMPTIED, { read: () => record.value, write() {} }).isUnlocked(3)).toBe(
        false,
      );

      const { campaign, session } = clearLevel(2, record);

      expect(campaign.isUnlocked(3)).toBe(true);
      expect(JSON.parse(record.value)).toEqual({ unlocked: 4 });
      expect(session.reading.offer).toEqual({
        choices: ['next-level', 'level-list'],
        next: { name: 'Level 4 · Siege Walker' },
      });
    });

    it('is cleared after Level 4: nothing comes next', () => {
      const record = { value: JSON.stringify({ unlocked: 4 }) };

      const { session } = clearLevel(3, record);

      expect(session.reading.offer).toEqual({ choices: ['level-list'], next: null });
    });
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
