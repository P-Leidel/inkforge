import { describe, expect, it } from 'vitest';
import { checkArenaSize } from '../game/level';
import { games } from '../game/test-support';
import { COLOURS } from '../materials/colour';
import { ENEMY_TYPES, type EnemyType } from '../materials/enemy-table';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import { LEVEL_2, LEVEL_2_HINTS } from './level-2';

const createGame = games();

/** The Enemy types a Wave sends any of. */
const sent = (wave: (typeof LEVEL_2.waves & {})[number]) =>
  ENEMY_TYPES.filter((type) => wave.counts[type] > 0);

describe('Level 2', () => {
  const waves = LEVEL_2.waves!;

  it('loads at its first of four Waves, of 5, 6, 8 and 8 Enemies, on one screen', () => {
    const game = createGame(true);

    game.load(LEVEL_2);

    expect(() => checkArenaSize(LEVEL_2.arena!)).not.toThrow();
    expect(game.world.arena).toBe(LEVEL_2.arena);
    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 1, waves: 4 });
    expect(waves.map((wave) => sent(wave).reduce((n, type) => n + wave.counts[type], 0))).toEqual([
      5, 6, 8, 8,
    ]);
  });

  it('has every Colour but red, at their default maximums, and builds nothing', () => {
    const game = createGame(true);

    game.load(LEVEL_2);

    expect(COLOURS.filter((colour) => game.ink.tanks[colour] > 0)).toEqual([
      'grey',
      'blue',
      'green',
      'black',
    ]);
    expect(game.ink.tanks.red).toBe(0);
    expect(LEVEL_2.build).toBeUndefined();
    expect(game.world.lines).toEqual([]);
    expect(game.world.objects).toEqual([]);
  });

  it('sends Crawlers and Runners, and Heavies only in its last two Waves', () => {
    expect(waves.map(sent)).toEqual([
      ['crawler'],
      ['crawler', 'runner'],
      ['crawler', 'runner', 'heavy'],
      ['crawler', 'runner', 'heavy'],
    ]);
  });

  it('has a hint for blue, green and the Heavy', () => {
    expect(Object.keys(LEVEL_2_HINTS).sort()).toEqual(['blue', 'green', 'heavy']);
  });

  it.each(ENEMY_TYPES)(
    'lets a %s sent in with no defence cross the valley and reach the Ink Core',
    (type: EnemyType) => {
      const game = createGame(true);
      const counts = { crawler: 0, runner: 0, heavy: 0, [type]: 1 };
      game.load({ ...LEVEL_2, waves: [{ counts, gap: 1 }] });
      game.togglePause();

      const steps = Math.round(90 / STEP_SECONDS);
      for (
        let step = 0;
        step < steps && game.world.inkCore.hp === game.world.inkCore.fullHp;
        step++
      )
        game.step();

      expect(game.world.inkCore.hp).toBeLessThan(game.world.inkCore.fullHp);
    },
  );
});
