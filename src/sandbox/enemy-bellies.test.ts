import { describe, expect, it } from 'vitest';
import type { Colour } from '../materials/colour';
import { createEnemyTable, DEFAULT_ENEMY_TABLE, type EnemyTable } from '../materials/enemy-table';
import { SANDBOX_ARENA, sandboxTerrainWithPit, type Arena } from './arena';
import type { Entry, SandboxWorld } from './sandbox-world';
import { entriesOf, hear, sandboxWorlds } from './test-support';

const createWorld = sandboxWorlds();
const GROUND_Y = SANDBOX_ARENA.spawn.y;
const CRAWLER = DEFAULT_ENEMY_TABLE.types.crawler;
/** The sandbox Arena with a Pit: a gap in the ground from x 400 to 520, open to the bottom. */
const PIT_ARENA: Arena = { ...SANDBOX_ARENA, terrain: sandboxTerrainWithPit(400, 520) };

/** An enemy table whose Crawlers die from any hit: a short fall kills one. */
function fragileCrawlers(hp = 1): EnemyTable {
  const enemies = createEnemyTable();
  enemies.types.crawler.hp = hp;
  return enemies;
}

/** Steps until `done` holds or `seconds` have passed; returns whether it held. */
function stepUntil(world: SandboxWorld, seconds: number, done: () => boolean): boolean {
  if (!world.isRunning) world.togglePause();
  for (let step = 0; step < seconds * 60; step++) {
    if (done()) return true;
    world.step();
  }
  return done();
}

/** Drops a fragile Crawler carrying `belly` from 200 px above the ground at x 700: it dies landing. */
function dropToDeath(belly: Colour): { world: SandboxWorld; heard: () => readonly Entry[] } {
  const world = createWorld({ enemies: fragileCrawlers() });
  const heard = hear(world);
  world.spawn('crawler', { x: 700, y: GROUND_Y - 200 }, belly);
  expect(stepUntil(world, 3, () => world.enemyCount === 0)).toBe(true);
  return { world, heard };
}

const addedOf = (entries: readonly Entry[], thing: string) =>
  entriesOf(entries, 'added').filter(({ what }) => what.thing === thing);

describe('Enemy Bellies', () => {
  it('shows each Enemy’s Belly: the Colour given, or one rolled when it is sent in', () => {
    const world = createWorld();
    world.spawn('crawler', { x: 700, y: GROUND_Y - 20 }, 'blue');
    world.spawn('heavy', { x: 900, y: GROUND_Y - 32 });
    expect(world.enemies[0]!.belly).toBe('blue');
    expect(['grey', 'blue', 'green', 'black', 'red']).toContain(world.enemies[1]!.belly);
  });

  it('lets out a grey Belly as pebbles where the Enemy died, on top of its Drop', () => {
    const { world, heard } = dropToDeath('grey');
    const entries = heard();
    expect(entriesOf(entries, 'dropped')).toHaveLength(1);
    expect(world.rubble.length).toBeGreaterThan(0);
    for (const rubble of world.rubble) {
      expect(rubble.colour).toBe('grey');
      expect(Math.abs(rubble.transform.x - 700)).toBeLessThan(100);
    }
  });

  it('lets out a black Belly as stones', () => {
    const { world } = dropToDeath('black');
    expect(world.rubble.length).toBeGreaterThan(0);
    expect(world.rubble.every(({ colour }) => colour === 'black')).toBe(true);
  });

  it('throws out a blue or green Belly as a Spill of Droplets, and no Rubble', () => {
    for (const belly of ['blue', 'green'] as const) {
      const { heard } = dropToDeath(belly);
      const entries = heard();
      expect(addedOf(entries, 'droplet').length, belly).toBeGreaterThan(0);
      expect(addedOf(entries, 'rubble'), belly).toEqual([]);
    }
  });

  it('sets off a red Belly as a Blast where the Enemy died', () => {
    const { heard } = dropToDeath('red');
    const entries = heard();
    const [blast, ...more] = entriesOf(entries, 'exploded');
    expect(more).toEqual([]);
    expect(Math.abs(blast!.centre.x - 700)).toBeLessThan(10);
    expect(Math.abs(blast!.centre.y - (GROUND_Y - CRAWLER.height / 2))).toBeLessThan(20);
    expect(addedOf(entries, 'rubble')).toEqual([]);
    expect(addedOf(entries, 'droplet')).toEqual([]);
  });

  it('lets out nothing for an Enemy that falls below the screen, though it still drops its Ink', () => {
    const world = createWorld({ arena: PIT_ARENA });
    const heard = hear(world);
    world.spawn('crawler', { x: 460, y: GROUND_Y - 30 }, 'red');

    expect(stepUntil(world, 5, () => world.enemyCount === 0)).toBe(true);

    const entries = heard();
    expect(entriesOf(entries, 'dropped')).toHaveLength(1);
    expect(entriesOf(entries, 'exploded')).toEqual([]);
    expect(addedOf(entries, 'rubble')).toEqual([]);
    expect(addedOf(entries, 'droplet')).toEqual([]);
  });

  it('lets out nothing, and drops nothing, for an Enemy that reaches the Ink Core', () => {
    const world = createWorld();
    const heard = hear(world);
    const { minX, maxY } = SANDBOX_ARENA.core;
    world.spawn('crawler', { x: minX - 60, y: maxY - CRAWLER.height / 2 }, 'grey');

    expect(stepUntil(world, 10, () => world.enemyCount === 0)).toBe(true);

    const entries = heard();
    expect(world.inkCore.hp).toBe(DEFAULT_ENEMY_TABLE.coreHp - CRAWLER.coreDamage);
    expect(entriesOf(entries, 'dropped')).toEqual([]);
    expect(addedOf(entries, 'rubble')).toEqual([]);
  });

  it('lets a red Belly’s Blast kill the next Enemy, which goes off in turn, a little later', () => {
    // Crawlers a Blast kills, standing still; the first is dropped to its death beside the others.
    const enemies = fragileCrawlers(400);
    enemies.types.crawler.walkingSpeed = 0;
    const world = createWorld({ enemies });
    const heard = hear(world);
    world.spawn('crawler', { x: 700, y: GROUND_Y - 300 }, 'red');
    world.spawn('crawler', { x: 745, y: GROUND_Y - CRAWLER.height / 2 }, 'red');
    world.spawn('crawler', { x: 790, y: GROUND_Y - CRAWLER.height / 2 }, 'red');

    expect(stepUntil(world, 4, () => world.enemyCount === 0)).toBe(true);

    const blasts = entriesOf(heard(), 'exploded');
    expect(blasts).toHaveLength(3);
    const times = heard()
      .filter((entry) => entry.kind === 'exploded')
      .map((entry) => entry.time);
    expect(times[1]).toBeGreaterThan(times[0]!);
    expect(times[2]).toBeGreaterThan(times[1]!);
  });

  it('plays out the same after R, Bellies and all', () => {
    const play = (world: SandboxWorld) => {
      stepUntil(world, 3, () => false);
      return {
        rubble: world.rubble.map(({ colour, transform }) => ({ colour, transform })),
        enemies: world.enemies.map(({ belly }) => belly),
      };
    };
    const world = createWorld({ enemies: fragileCrawlers() });
    for (let k = 0; k < 3; k++) world.spawn('crawler', { x: 600 + 80 * k, y: GROUND_Y - 200 });
    world.spawn('heavy', { x: 1000, y: GROUND_Y - 32 });
    const first = play(world);
    world.reset();
    expect(play(world)).toEqual(first);
  });
});
