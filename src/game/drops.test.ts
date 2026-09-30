import { describe, expect, it } from 'vitest';
import { COLOURS, type Colour } from '../materials/colour';
import { DEFAULT_ENEMY_TABLE, type EnemyType } from '../materials/enemy-table';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import { dragAlong } from '../stroke/pointer-paths';
import type { Game } from './game';
import { inLineLength } from './ink-table';
import { games } from './test-support';

/** A Core Zone wide enough to take in the whole Arena, px. */
const WHOLE_ARENA = 10_000;

/** A Game over a new Sandbox world; Ink costs on unless said otherwise. */
const createGame = games();

/**
 * A Game with Waves on, whose Wave sends in one Crawler, then waits a long
 * while. Its Core Zone takes in the whole Arena, so it refuses nothing here.
 */
function wavesGame(options: { inkCosts?: boolean; seed?: number } = {}): Game {
  const game = createGame(options.inkCosts ?? true, {
    waves: true,
    worldOptions: { seed: options.seed ?? 1 },
  });
  game.defence.edit((table) => {
    table.coreZone = WHOLE_ARENA;
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

/** Each Tank's spendable and Locked Ink, in Line length. */
const held = (game: Game) =>
  Object.fromEntries(
    COLOURS.map((colour) => {
      const { spendable, locked } = game.tanks[colour];
      return [colour, { spendable: inLineLength(spendable), locked: inLineLength(locked) }];
    }),
  ) as Record<Colour, { spendable: number; locked: number }>;

describe('Wave Ink', () => {
  it('starting a Wave locks every Tank: only Wave Ink can be spent, and there is none yet', () => {
    const game = wavesGame();
    game.togglePause();

    for (const colour of COLOURS) {
      expect(game.tanks[colour].spendable).toBe(0);
      expect(game.tanks[colour].locked).toBe(game.tanks[colour].maximum);
    }
    const refused = line(game, 100);
    expect(refused).toMatchObject({ kind: 'refused', colour: 'grey' });
    expect(game.world.lines).toEqual([]);
  });

  it("a kill's Drop lands as Wave Ink within its ranges, and can be spent at once", () => {
    const game = wavesGame();
    // Room in every Tank for a Drop: the Tanks hold 400 less of each.
    for (const colour of COLOURS) {
      expect(line(game, 400, colour, 100 + 60 * COLOURS.indexOf(colour)).kind).toBe('line');
    }
    const before = held(game);
    game.togglePause();

    pitKill(game);

    const after = held(game);
    const ranges = DEFAULT_ENEMY_TABLE.types.crawler.drop;
    for (const colour of COLOURS) {
      expect(after[colour].locked).toBeCloseTo(before[colour].spendable, 6);
      expect(after[colour].spendable).toBeGreaterThanOrEqual(ranges[colour].min);
      expect(after[colour].spendable).toBeLessThanOrEqual(ranges[colour].max);
    }
    // At least 40 grey: a 20 px Line costs less than that.
    expect(line(game, 20).kind).toBe('line');
    expect(held(game).grey.spendable).toBeLessThan(after.grey.spendable);
    expect(held(game).grey.locked).toBeCloseTo(after.grey.locked, 6);
  });

  it("loses what doesn't fit: Locked Ink still takes room", () => {
    const game = wavesGame();
    expect(line(game, 20).kind).toBe('line'); // about 28 grey of room
    const room = inLineLength(game.tanks.grey.maximum) - held(game).grey.spendable;
    game.togglePause();

    pitKill(game);

    // A Crawler drops at least 40 grey, and full Tanks take none of the rest.
    expect(held(game).grey.spendable).toBeCloseTo(room, 6);
    expect(held(game).blue).toEqual({
      spendable: 0,
      locked: inLineLength(game.tanks.blue.maximum),
    });
    for (const colour of COLOURS) {
      const { spendable, locked, maximum } = game.tanks[colour];
      expect(spendable + locked).toBeLessThanOrEqual(maximum + 1e-6);
    }
  });

  it('gives the same Drops for the same seed', () => {
    const run = (seed: number) => {
      const game = wavesGame({ seed });
      for (const colour of COLOURS) line(game, 400, colour, 100 + 60 * COLOURS.indexOf(colour));
      game.togglePause();
      pitKill(game);
      pitKill(game, 'heavy');
      return held(game);
    };

    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });

  it('comes from a Pit kill; an Enemy reaching the Ink Core drops nothing', () => {
    const game = createGame(true, { waves: true });
    game.defence.edit((table) => (table.counts = { crawler: 0, runner: 1, heavy: 0 }));
    expect(line(game, 400).kind).toBe('line');
    const before = held(game);
    game.togglePause();

    stepFor(game, 60, () => game.defence.reading.phase === 'build');

    expect(game.world.inkCore.hp).toBe(9);
    expect(held(game)).toEqual(before);
  });

  it('is kept when the Wave ends, and the Locked Ink is spendable again', () => {
    const game = wavesGame();
    game.defence.edit((table) => (table.counts = { crawler: 0, runner: 0, heavy: 0 }));
    expect(line(game, 400).kind).toBe('line');
    const before = held(game).grey.spendable;
    game.togglePause();

    // The only Enemy dies in the Wave's first step: none is left to come or alive.
    pitKill(game);

    expect(game.defence.reading.phase).toBe('build');
    const { spendable, locked } = held(game).grey;
    expect(locked).toBe(0);
    expect(spendable - before).toBeGreaterThanOrEqual(40);
    expect(line(game, 1000).kind).toBe('line');
  });

  it('changes nothing with Ink costs off, Waves on or off', () => {
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

  it('goes into the Tanks with Waves off too, as spendable Ink', () => {
    const game = createGame(true);
    expect(line(game, 400).kind).toBe('line');
    const before = held(game).grey.spendable;
    game.togglePause();

    pitKill(game);

    expect(held(game).grey.spendable - before).toBeGreaterThanOrEqual(40);
    expect(held(game).grey.locked).toBe(0);
  });
});

describe('Refunds during a Wave', () => {
  it('go back to the part they were paid from, and never leave a Tank above what it held', () => {
    const game = wavesGame();
    expect(line(game, 400, 'grey', 200).kind).toBe('line'); // paid in the Build Phase
    const full = inLineLength(game.tanks.grey.maximum);
    game.togglePause();
    pitKill(game);
    const drop = held(game).grey.spendable;
    expect(line(game, 20, 'grey', 300).kind).toBe('line'); // paid from Wave Ink
    const afterPaying = held(game).grey;

    // Erase the Wave's Line: its price goes back to Wave Ink.
    game.eraseAlong(
      [
        { x: 595, y: 300 },
        { x: 625, y: 300 },
      ],
      12,
    );
    expect(held(game).grey.spendable).toBeCloseTo(drop, 6);
    expect(held(game).grey.locked).toBeCloseTo(afterPaying.locked, 6);

    // Erase the Build Phase's Line: its price goes back as Locked Ink, up to the maximum.
    game.eraseAlong(
      [
        { x: 595, y: 200 },
        { x: 1005, y: 200 },
      ],
      12,
    );
    const { spendable, locked } = held(game).grey;
    expect(spendable).toBeCloseTo(drop, 6);
    expect(spendable + locked).toBeLessThanOrEqual(full + 1e-6);
    expect(locked).toBeCloseTo(full - drop, 6);
  });

  it('after the Wave, everything erased is spendable', () => {
    const game = wavesGame({ inkCosts: true });
    game.defence.edit((table) => (table.counts = { crawler: 0, runner: 0, heavy: 0 }));
    expect(line(game, 400).kind).toBe('line');
    game.togglePause();
    game.step(); // an empty Wave ends at once

    expect(game.defence.reading.phase).toBe('build');
    game.eraseAlong(
      [
        { x: 595, y: 200 },
        { x: 1005, y: 200 },
      ],
      12,
    );
    expect(held(game).grey).toEqual({
      spendable: inLineLength(game.tanks.grey.maximum),
      locked: 0,
    });
  });
});

describe('R, with Locked and Wave Ink', () => {
  it('brings the Tanks back as at the snapshot, and a retry drops the same', () => {
    const game = wavesGame();
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
