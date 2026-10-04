import { describe, expect, it } from 'vitest';
import { Campaign } from '../game/campaign';
import type { Level } from '../game/level';
import { Session } from '../game/session';
import { games } from '../game/test-support';
import { arrivals, gapBefore, sentCounts } from '../game/wave-table';
import { checkArenaSize } from '../game/level';
import { COLOURS } from '../materials/colour';
import { ENEMY_TYPES, type EnemyType } from '../materials/enemy-types';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import { LEVEL_4, LEVEL_4_GROUND, LEVEL_4_LANE_LENGTH, LEVEL_4_OVERHANG } from './level-4';

const createGame = games();

/** The Terrain polygons spanning `x`, by their x extents. */
const terrainAt = (x: number) =>
  LEVEL_4.arena!.terrain.filter((polygon) => {
    const xs = polygon.map((p) => p.x);
    return Math.min(...xs) <= x && x <= Math.max(...xs);
  });

/** The lowest y any Terrain at `x` reaches: the bottom of the screen unless a gap is open there. */
const deepestAt = (x: number) =>
  Math.max(...terrainAt(x).flatMap((polygon) => polygon.map((p) => p.y)));

describe('Level 4, the boss Level', () => {
  it('is one screen, with every Colour at its Tank maximum and nothing built', () => {
    const arena = LEVEL_4.arena!;

    expect(LEVEL_4.name).toBe('Level 4 · Siege Walker');
    expect(() => checkArenaSize(arena)).not.toThrow();
    expect(arena.spawnSide).toBe('left');
    for (const colour of COLOURS) expect(LEVEL_4.tanks![colour]).toBeGreaterThan(0);
    expect(LEVEL_4.build).toBeUndefined();
  });

  it('has a Spawn lane long enough to send in a Siege Walker wholly out of view', () => {
    const { siegeWalker } = createGame(true).world.enemyTable.types;

    expect(LEVEL_4_LANE_LENGTH).toBeGreaterThanOrEqual(320);
    expect(LEVEL_4_LANE_LENGTH).toBeGreaterThan(siegeWalker.width);
  });

  it('has ground with no step and no slope over 30°, a crest, no Pit, and an overhang', () => {
    const arena = LEVEL_4.arena!;
    const ground = LEVEL_4_GROUND;

    expect(ground[0]!.x).toBe(-LEVEL_4_LANE_LENGTH);
    expect(ground.at(-1)!.x).toBe(arena.core.maxX);
    for (let i = 1; i < ground.length; i++) {
      const [a, b] = [ground[i - 1]!, ground[i]!];
      expect(b.x).toBeGreaterThan(a.x);
      const degrees = (Math.atan(Math.abs(b.y - a.y) / (b.x - a.x)) * 180) / Math.PI;
      expect(degrees).toBeLessThanOrEqual(30);
    }
    // A crest: the ground rises above the approach and falls below it behind.
    const approach = ground[0]!.y;
    expect(Math.min(...ground.map((p) => p.y))).toBeLessThan(approach);
    expect(Math.max(...ground.map((p) => p.y))).toBeGreaterThan(approach);
    expect(ground.some((p, i) => i > 0 && p.y - ground[i - 1]!.y > 0)).toBe(true);

    for (let x = 0; x <= arena.width; x += 20) expect(deepestAt(x)).toBe(arena.height);
    const middle = (LEVEL_4_OVERHANG.left + LEVEL_4_OVERHANG.right) / 2;
    expect(
      terrainAt(middle).some((polygon) => polygon.every((p) => p.y <= LEVEL_4_OVERHANG.bottom)),
    ).toBe(true);
    expect(arena.core.maxY).toBe(ground.at(-1)!.y); // on the plateau
  });

  it('sends three Waves, the Siege Walker only in the last, with Crawlers close behind it', () => {
    const waves = LEVEL_4.waves!;
    const total = (wave: (typeof waves)[number]) =>
      ENEMY_TYPES.reduce((n, t) => n + (sentCounts(wave)[t] ?? 0), 0);

    expect(waves.map(total)).toEqual([6, 8, 9]);
    expect(sentCounts(waves[0]!)).toEqual({ crawler: 4, runner: 2 });
    expect(sentCounts(waves[1]!)).toEqual({ crawler: 4, runner: 2, heavy: 2 });
    for (const wave of waves.slice(0, 2)) expect(gapBefore(wave, 0)).toBe(2.5);

    const last = waves[2]!;
    expect(arrivals(last).map((arrival) => arrival.type)).toEqual([
      ...Array(3).fill('crawler'),
      'siegeWalker',
      ...Array(3).fill('crawler'),
      'heavy',
      'heavy',
    ]);
    expect(last.sends.map((_, k) => gapBefore(last, k))).toEqual([2, 3, 1.5, 3]);
  });

  it('has a Card before Wave 3, and a hint for the Siege Walker, the one thing new here', () => {
    expect(LEVEL_4.cards!.map((cards) => cards.map((card) => card.title))).toEqual([
      [],
      [],
      ['The Siege Walker'],
    ]);
    expect(LEVEL_4.hints).toEqual({ siegeWalker: 'New: the Siege Walker. Knock it over.' });
  });

  it('shows its Card in the Intermission before Wave 3, once a start', () => {
    // Level 4 with its Waves emptied, so they end on their first step.
    const level: Level = { ...LEVEL_4, waves: LEVEL_4.waves!.map(() => ({ sends: [], gap: 1 })) };
    const game = createGame(true);
    const session = new Session(game, new Campaign([level], { read: () => null, write() {} }));
    const playWave = () => {
      game.togglePause();
      for (let k = 0; k < 600 && game.defence.reading.phase === 'wave'; k++)
        session.advance(STEP_SECONDS);
    };
    session.playCampaign(0);

    expect(session.cards.isOpen).toBe(false);
    playWave();
    expect(session.cards.isOpen).toBe(false);
    playWave();
    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 3 });
    expect(session.cards.shown?.card.title).toBe('The Siege Walker');
    expect(session.reading.campaign?.hints).toEqual([]); // emptied Waves bring nothing new
    session.cards.next();
    expect(session.cards.isOpen).toBe(false);

    game.togglePause(); // Wave 3 starts: R's checkpoint is its Intermission
    session.retry();
    session.advance(STEP_SECONDS);
    expect(session.cards.isOpen).toBe(false);
  });

  it('loads at its first Wave of three', () => {
    const game = createGame(true);

    game.load(LEVEL_4);

    expect(game.defence.reading).toMatchObject({ phase: 'intermission', wave: 1, waves: 3 });
    expect(game.world.arena).toBe(LEVEL_4.arena);
  });

  it.each(ENEMY_TYPES)(
    'a %s sent in with no defence walks over the crest to the Ink Core',
    (type: EnemyType) => {
      const game = createGame(true);
      game.load(LEVEL_4);
      game.waves = false;
      const world = game.world;
      world.spawn(type);
      world.resume();

      let steepest = 0;
      for (let step = 0; step < 150 * 60 && world.enemyCount > 0; step++) {
        world.step();
        steepest = Math.max(steepest, Math.abs(world.enemies[0]?.transform.angle ?? 0));
      }

      expect(world.enemyCount).toBe(0);
      expect(world.inkCore.hp).toBeLessThan(world.inkCore.fullHp);
      // Never near the Siege Walker's tip angle of 40° on its own: the Arena alone doesn't trip it.
      expect((steepest * 180) / Math.PI).toBeLessThan(35);
    },
  );
});
