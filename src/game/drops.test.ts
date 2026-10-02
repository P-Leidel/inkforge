import { describe, expect, it } from 'vitest';
import { COLOURS, type Colour } from '../materials/colour';
import { DEFAULT_ENEMY_TABLE, type EnemyType } from '../materials/enemy-table';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import { dragAlong } from '../stroke/pointer-paths';
import type { Game } from './game';
import { inLineLength } from './ink-table';
import { games } from './test-support';

/** A Game over a new Sandbox world; Ink costs on unless said otherwise. */
const createGame = games();

/** A Game with Waves on, whose Wave sends in two Crawlers, the second a long while after the first. */
function wavesGame(options: { inkCosts?: boolean; seed?: number } = {}): Game {
  const game = createGame(options.inkCosts ?? true, {
    waves: true,
    worldOptions: { seed: options.seed ?? 1 },
  });
  game.defence.edit((table) => {
    table.counts = { crawler: 2, runner: 0, heavy: 0 };
    table.gap = 100;
  });
  return game;
}

/** Steps a running Game up to `seconds`, or until `until` holds. */
function stepFor(game: Game, seconds: number, until: () => boolean = () => false): void {
  for (let steps = 0; steps < Math.round(seconds / STEP_SECONDS) && !until(); steps++) game.step();
}

/**
 * Sends an Enemy of `type` in below the bottom of the screen, where it dies
 * as in a Pit, and steps until its Drop is let out.
 */
function pitKill(game: Game, type: EnemyType = 'crawler'): void {
  const before = game.world.enemyCount;
  game.world.spawn(type, { x: 800, y: game.world.arena.height + 200 });
  stepFor(game, 0.5, () => game.world.enemyCount === before);
}

/** A horizontal Line of `colour`, `length` px long, high in the air; returns what it became. */
const line = (game: Game, length: number, colour: Colour = 'grey', y = 200) =>
  game.submitStroke(
    dragAlong([
      { x: 600, y },
      { x: 600 + length, y },
    ]),
    colour,
  );

/** What each Tank holds, in Line length. */
const held = (game: Game) =>
  Object.fromEntries(
    COLOURS.map((colour) => [colour, inLineLength(game.tanks[colour].spendable)]),
  ) as Record<Colour, number>;

describe('Drops', () => {
  it('land straight in the Tanks within their ranges, and can be spent at once', () => {
    const game = wavesGame();
    game.togglePause();
    // Room in every Tank for a Drop: the Tanks hold 400 less of each.
    for (const colour of COLOURS) {
      expect(line(game, 400, colour, 100 + 60 * COLOURS.indexOf(colour)).kind).toBe('line');
    }
    const before = held(game);

    pitKill(game);

    const after = held(game);
    const ranges = DEFAULT_ENEMY_TABLE.types.crawler.drop;
    for (const colour of COLOURS) {
      expect(after[colour] - before[colour]).toBeGreaterThanOrEqual(ranges[colour].min - 1e-6);
      expect(after[colour] - before[colour]).toBeLessThanOrEqual(ranges[colour].max + 1e-6);
    }
    expect(line(game, 20, 'grey', 500).kind).toBe('line');
    expect(held(game).grey).toBeLessThan(after.grey);
  });

  it("lose what doesn't fit", () => {
    const game = wavesGame();
    game.togglePause();
    expect(line(game, 20).kind).toBe('line'); // about 28 grey of room

    pitKill(game);

    // A Crawler drops at least 40 grey, and full Tanks take none of the rest.
    for (const colour of COLOURS) {
      expect(game.tanks[colour].spendable).toBeCloseTo(game.tanks[colour].maximum, 6);
    }
  });

  it('are the same for the same seed', () => {
    const run = (seed: number) => {
      const game = wavesGame({ seed });
      game.togglePause();
      for (const colour of COLOURS) line(game, 400, colour, 100 + 60 * COLOURS.indexOf(colour));
      pitKill(game);
      pitKill(game, 'heavy');
      return held(game);
    };

    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });

  it('come from a Pit kill; an Enemy reaching the Ink Core drops nothing, though it counts as a kill', () => {
    const game = createGame(true, { waves: true });
    game.defence.edit((table) => (table.counts = { crawler: 0, runner: 1, heavy: 0 }));
    game.togglePause();
    expect(line(game, 400).kind).toBe('line');
    const before = held(game);
    let picked = held(game);

    stepFor(game, 60, () => {
      // Read before the Wave's end refills the Tanks.
      if (game.defence.reading.phase !== 'wave') return true;
      picked = held(game);
      return false;
    });

    expect(game.world.inkCore.hp).toBe(9);
    expect(picked).toEqual(before);
    expect(game.defence.reading.rewards?.summary).toMatchObject({ kills: 1, ink: { grey: 0 } });
  });

  it("count for the Wave's summary: its kills, the Ink Core's too, and the Ink the Tanks took", () => {
    const game = createGame(true, { waves: true });
    game.defence.edit((table) => (table.counts = { crawler: 0, runner: 1, heavy: 0 }));
    game.togglePause();
    expect(line(game, 400).kind).toBe('line');
    const before = game.tanks.grey.spendable;
    pitKill(game);
    const taken = game.tanks.grey.spendable - before;

    stepFor(game, 60, () => game.defence.reading.phase !== 'wave');

    expect(taken).toBeGreaterThan(0);
    const summary = game.defence.reading.rewards!.summary;
    expect(summary.kills).toBe(2); // the Pit's and the Ink Core's
    expect(summary.ink.grey).toBeCloseTo(taken, 6);
  });

  it('change nothing with Ink costs off, Waves on or off', () => {
    const waves = wavesGame({ inkCosts: false });
    waves.togglePause();
    pitKill(waves);
    expect(line(waves, 1000).kind).toBe('line');

    const sandbox = createGame(false);
    sandbox.togglePause();
    const before = held(sandbox);
    pitKill(sandbox);
    expect(held(sandbox)).toEqual(before);
  });

  it('go into the Tanks with Waves off too', () => {
    const game = createGame(true);
    expect(line(game, 400).kind).toBe('line');
    const before = held(game).grey;
    game.togglePause();

    pitKill(game);

    expect(held(game).grey - before).toBeGreaterThanOrEqual(40);
  });
});

describe('R, with Drops', () => {
  it('brings the Tanks back as at the snapshot, and a retry drops the same', () => {
    const game = createGame(true);
    for (const colour of COLOURS) line(game, 400, colour, 100 + 60 * COLOURS.indexOf(colour));
    const atStart = game.tanks;
    game.togglePause();
    pitKill(game);
    const first = game.tanks;

    game.reset();
    expect(game.tanks).toEqual(atStart);

    game.togglePause();
    pitKill(game);
    expect(game.tanks).toEqual(first);
  });
});
