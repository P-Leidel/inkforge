import { describe, expect, it } from 'vitest';
import { checkArenaSize } from '../game/level';
import { games } from '../game/test-support';
import { COLOURS } from '../materials/colour';
import { ENEMY_TYPES, type EnemyType } from '../materials/enemy-table';
import {
  LEVEL_3,
  LEVEL_3_GROUND_Y,
  LEVEL_3_HINTS,
  LEVEL_3_OVERHANG,
  LEVEL_3_VALLEY,
} from './level-3';

const createGame = games();

/** The Terrain polygons spanning `x`, by their x extents. */
const terrainAt = (x: number) =>
  LEVEL_3.arena!.terrain.filter((polygon) => {
    const xs = polygon.map((p) => p.x);
    return Math.min(...xs) <= x && x <= Math.max(...xs);
  });

/** The lowest y any Terrain at `x` reaches: the bottom of the screen unless a gap is open there. */
const deepestAt = (x: number) =>
  Math.max(...terrainAt(x).flatMap((polygon) => polygon.map((p) => p.y)));

describe('Level 3', () => {
  it('is one screen, with every Colour at its Tank maximum and nothing built', () => {
    const arena = LEVEL_3.arena!;

    expect(() => checkArenaSize(arena)).not.toThrow();
    expect(arena.spawnSide).toBe('left');
    for (const colour of COLOURS) expect(LEVEL_3.tanks![colour]).toBeGreaterThan(0);
    expect(LEVEL_3.build).toBeUndefined();
  });

  it('has a valley with a floor, no Pit, and an overhang above it', () => {
    const arena = LEVEL_3.arena!;

    for (let x = 0; x <= arena.width; x += 20) expect(deepestAt(x)).toBe(arena.height);
    const middle = (LEVEL_3_VALLEY.left + LEVEL_3_VALLEY.right) / 2;
    const floor = Math.min(
      ...terrainAt(middle)
        .flatMap((polygon) => polygon.map((p) => p.y))
        .filter((y) => y > LEVEL_3_OVERHANG.bottom),
    );
    expect(floor).toBe(LEVEL_3_GROUND_Y + LEVEL_3_VALLEY.depth);
    expect(
      terrainAt(middle).some((polygon) => polygon.every((p) => p.y <= LEVEL_3_OVERHANG.bottom)),
    ).toBe(true);
    expect(arena.core.maxY).toBeLessThan(LEVEL_3_GROUND_Y); // the plateau
  });

  it('sends five Waves of 6, 8, 10, 10 and 12, every Enemy type in each', () => {
    const waves = LEVEL_3.waves!;

    expect(waves.map((wave) => ENEMY_TYPES.reduce((n, t) => n + wave.counts[t], 0))).toEqual([
      6, 8, 10, 10, 12,
    ]);
    for (const wave of waves)
      for (const type of ENEMY_TYPES) expect(wave.counts[type]).toBeGreaterThan(0);
  });

  it('loads at its first Wave of five', () => {
    const game = createGame(true);

    game.load(LEVEL_3);

    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 1, waves: 5 });
    expect(game.world.arena).toBe(LEVEL_3.arena);
  });

  it('has a hint for red, the Colour new here', () => {
    expect(Object.keys(LEVEL_3_HINTS)).toEqual(['red']);
  });

  it.each(ENEMY_TYPES)(
    'a %s sent in with no defence walks through the valley to the Ink Core',
    (type: EnemyType) => {
      const game = createGame(true);
      game.load(LEVEL_3);
      game.waves = false;
      const world = game.world;
      world.spawn(type);
      world.resume();

      for (let step = 0; step < 90 * 60 && world.enemyCount > 0; step++) world.step();

      expect(world.enemyCount).toBe(0);
      expect(world.inkCore.hp).toBeLessThan(world.inkCore.fullHp);
    },
  );
});
