import { describe, expect, it } from 'vitest';
import type { Game } from '../game/game';
import { games } from '../game/test-support';
import { COLOURS } from '../materials/colour';
import { ENEMY_TYPES } from '../materials/enemy-table';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../sandbox/arena';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import { LEVEL_1 } from './level-1';

const createGame = games();

/** Steps a running Game up to `seconds`, or until `until` holds. Returns whether it held. */
function stepUntil(game: Game, seconds: number, until: () => boolean): boolean {
  for (let k = 0; k < Math.round(seconds / STEP_SECONDS); k++) {
    if (until()) return true;
    game.step();
  }
  return until();
}

describe('Level 1', () => {
  it('loads at its first of 3 Waves, and is one screen', () => {
    const game = createGame(true);

    game.load(LEVEL_1);

    expect(game.world.arena).toMatchObject({ width: ARENA_WIDTH, height: ARENA_HEIGHT });
    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 1, waves: 3 });
  });

  it('has only grey and black', () => {
    const game = createGame(true);

    game.load(LEVEL_1);

    expect(COLOURS.filter((colour) => game.has(colour))).toEqual(['grey', 'black']);
  });

  it('sends Waves of 4, 6 and 6, only Crawlers and Runners, Crawlers first', () => {
    const waves = LEVEL_1.waves!;
    const total = ({ counts }: (typeof waves)[number]) =>
      ENEMY_TYPES.reduce((sum, type) => sum + counts[type], 0);

    expect(waves.map(total)).toEqual([4, 6, 6]);
    expect(waves.every(({ counts }) => counts.heavy === 0)).toBe(true);
    expect(waves[0]!.counts).toMatchObject({ crawler: 4, runner: 0 });
    expect(waves.slice(1).every(({ counts }) => counts.runner > 0)).toBe(true);
  });

  it('has a hint for grey, black, the Crawler and the Runner, and nothing else', () => {
    expect(Object.keys(LEVEL_1.hints!).sort()).toEqual(['black', 'crawler', 'grey', 'runner']);
  });

  it('with no defence, lets every Crawler of the first Wave reach the Ink Core', () => {
    const game = createGame(true);
    game.load(LEVEL_1);
    const { hp } = game.world.inkCore;

    game.togglePause(); // the first Wave
    const ended = stepUntil(game, 120, () => game.defence.reading.phase !== 'wave');

    expect(ended).toBe(true);
    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 2 });
    expect(game.world.inkCore.hp).toBe(hp - 4);
  });

  it('with no defence, lets a Runner reach the Ink Core', () => {
    const game = createGame(true);
    game.load(LEVEL_1);
    game.waves = false;
    const { hp } = game.world.inkCore;

    game.spawn('runner');
    game.togglePause();
    const gone = stepUntil(game, 60, () => game.world.enemies.length === 0);

    expect(gone).toBe(true);
    expect(game.world.inkCore.hp).toBe(hp - 1);
  });
});
