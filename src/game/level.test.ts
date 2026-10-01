import { describe, expect, it } from 'vitest';
import { PIT_DEMO } from '../gallery/gallery';
import { COLOURS } from '../materials/colour';
import { SANDBOX_ARENA, type Arena } from '../sandbox/arena';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import { dragAlong } from '../stroke/pointer-paths';
import type { Game } from './game';
import { fromLineLength } from './ink-table';
import { SANDBOX_LEVEL, type Level } from './level';
import { games } from './test-support';
import { DEFAULT_WAVE_TABLE } from './wave-table';

const createGame = games();

/** The sandbox Arena with the Ink Core on the flat ground and the Spawn nearer the edge. */
const ARENA: Arena = {
  ...SANDBOX_ARENA,
  spawn: { x: -120, y: SANDBOX_ARENA.spawn.y },
  core: { minX: 1000, minY: 784, maxX: 1096, maxY: 880 },
};

/** Its first Wave: one Heavy. */
const FIRST_WAVE = { counts: { crawler: 0, runner: 0, heavy: 1 }, gap: 3 };

/** A Level with everything of its own: two Waves, small Tanks, and a grey Line built. */
const LEVEL: Level = {
  arena: ARENA,
  waves: [FIRST_WAVE, { counts: { crawler: 2, runner: 0, heavy: 0 }, gap: 1 }],
  tanks: { grey: 500, blue: 400, green: 300, black: 200, red: 100 },
  build(world) {
    world.submitStroke(
      dragAlong([
        { x: 300, y: 500 },
        { x: 500, y: 500 },
      ]),
      'grey',
    );
  },
};

/** Every Tank's maximum, in Line length. */
const maximums = (game: Game) => COLOURS.map((colour) => game.tanks[colour].maximum);

/** Every Tank's spendable Ink. */
const spendable = (game: Game) => COLOURS.map((colour) => game.tanks[colour].spendable);

function stepFor(game: Game, seconds: number): void {
  for (let t = 0; t < Math.round(seconds / STEP_SECONDS); t++) game.step();
}

describe('Loading a Level', () => {
  it('puts the world on its Arena, Ink Core and Spawn included', () => {
    const game = createGame(true);

    game.load(LEVEL);

    expect(game.world.arena).toBe(ARENA);
    expect(game.world.inkCore.bounds).toEqual(ARENA.core);
  });

  it('sets its Waves, starting at the first, and its Tank maximums, and fills the Tanks', () => {
    const game = createGame(true);

    game.load(LEVEL);

    expect(game.defence.list).toEqual(LEVEL.waves);
    expect(game.defence.table).toEqual(FIRST_WAVE);
    expect(game.defence.reading).toMatchObject({ wave: 1, waves: 2 });
    expect(game.ink.tanks).toEqual(LEVEL.tanks);
    expect(maximums(game)).toEqual(COLOURS.map((c) => fromLineLength(LEVEL.tanks![c])));
    expect(spendable(game)).toEqual(maximums(game));
  });

  it('builds it for free, and what it built can be undone', () => {
    const game = createGame(true);

    game.load(LEVEL);
    game.waves = false; // its Waves turned them on, and they bar undo outside a Wave

    expect(game.world.lines).toHaveLength(1);
    expect(spendable(game)).toEqual(maximums(game));
    game.undo();
    expect(game.world.lines).toEqual([]);
  });

  it('with Waves on, sends in its own first Wave from its own Spawn, toward its own Ink Core', () => {
    const game = createGame(true, { waves: true });
    game.load(LEVEL);

    game.togglePause();
    game.step();

    expect(game.world.enemies.map((enemy) => enemy.type)).toEqual(['heavy']);
    expect(game.world.enemies[0]!.transform.x).toBeGreaterThan(ARENA.spawn.x);
    stepFor(game, 30);
    expect(game.world.inkCore.hp).toBeLessThan(game.world.inkCore.fullHp);
  });

  it('keeps all of it through R', () => {
    const game = createGame(true, { waves: true });
    game.load(LEVEL);
    game.togglePause();
    stepFor(game, 2);

    game.reset();

    expect(game.world.arena).toBe(ARENA);
    expect(game.world.inkCore.bounds).toEqual(ARENA.core);
    expect(game.defence.table).toEqual(FIRST_WAVE);
    expect(game.ink.tanks).toEqual(LEVEL.tanks);
    expect(game.world.lines).toHaveLength(1);
  });

  it('the sandbox Level after it brings the sandbox Arena back, and keeps the current Wave and the Tanks as they are', () => {
    const game = createGame(true);
    game.load(LEVEL);
    game.editInk((ink) => (ink.tanks.red = 150)); // as the F2 tuning panel does

    game.load(SANDBOX_LEVEL);

    expect(game.world.arena).toBe(SANDBOX_ARENA);
    expect(game.world.inkCore.bounds).toEqual(SANDBOX_ARENA.core);
    expect(game.world.lines).toEqual([]);
    expect(game.defence.list).toEqual([FIRST_WAVE]);
    expect(game.ink.tanks).toEqual({ ...LEVEL.tanks, red: 150 });
    expect(spendable(game)).toEqual(maximums(game));
  });

  it('a Level without Waves or Tanks has one Wave, the current table, and leaves the Ink table as it is', () => {
    const game = createGame(true);
    const ink = structuredClone(game.ink);

    game.load(PIT_DEMO);

    expect(game.defence.list).toEqual([DEFAULT_WAVE_TABLE]);
    expect(game.ink).toEqual(ink);
  });

  it('refuses an Arena that is not one screen', () => {
    const game = createGame(true);

    expect(() => game.load({ arena: { ...ARENA, width: 2400 } })).toThrow(/1920 × 1080/);
  });
});
