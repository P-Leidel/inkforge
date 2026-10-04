import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { DEFAULT_ENEMY_TABLE, editEnemies } from '../materials/enemy-table';
import { DEFAULT_MATERIAL_TABLE } from '../materials/material-table';
import { dragBox } from '../stroke/pointer-paths';
import { ARENA_HEIGHT, SANDBOX_ARENA, sandboxTerrainWithPit, type Arena } from './arena';
import type { EnemyView, SandboxWorld } from './sandbox-world';
import {
  drawLine,
  drawObject,
  entriesOf,
  hear,
  piecesOf,
  runFor,
  sandboxWorlds,
  wentOf,
} from './test-support';

/**
 * The Siege Walker in the headless Sandbox world: each of its numbers'
 * reference cases (the milestone 6 spec's **Numbers**), and the usual rules
 * at the Ink Core and below the screen. Tipped and getting up are to come.
 */

const createWorld = sandboxWorlds();
const WALKER = DEFAULT_ENEMY_TABLE.types.siegeWalker;
const GROUND_Y = SANDBOX_ARENA.spawn.y;

/** Where a Siege Walker stands on the ground at `x`, its centre half its height up. */
const standingAt = (x: number): Vec2 => ({ x, y: GROUND_Y - WALKER.height / 2 - 0.5 });

/** The one Enemy in the Arena. */
function onlyWalker(world: SandboxWorld): EnemyView {
  expect(world.enemies).toHaveLength(1);
  return world.enemies[0]!;
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

/**
 * An Arena like the sandbox's whose ground rises at `degrees` from x 1000
 * to x 1450 to a plateau, with the Ink Core at its far end.
 */
function slopeArena(degrees: number): Arena {
  const [left, right] = [1000, 1450];
  const top = GROUND_Y - (right - left) * Math.tan((degrees * Math.PI) / 180);
  const [farWall, rightWall] = SANDBOX_ARENA.terrain;
  const wallX = SANDBOX_ARENA.core.maxX;
  return {
    ...SANDBOX_ARENA,
    terrain: [
      farWall!,
      rightWall!,
      [
        { x: -280, y: GROUND_Y },
        { x: left, y: GROUND_Y },
        { x: left, y: ARENA_HEIGHT },
        { x: -280, y: ARENA_HEIGHT },
      ],
      [
        { x: left, y: GROUND_Y },
        { x: right, y: top },
        { x: right, y: ARENA_HEIGHT },
        { x: left, y: ARENA_HEIGHT },
      ],
      [
        { x: right, y: top },
        { x: wallX, y: top },
        { x: wallX, y: ARENA_HEIGHT },
        { x: right, y: ARENA_HEIGHT },
      ],
    ],
    core: { minX: wallX - 96, maxX: wallX, minY: top - 96, maxY: top },
  };
}

describe('The Siege Walker', () => {
  it('is sent in at the Spawn, out of view, standing on the ground, as tall and wide as its numbers say', () => {
    const world = createWorld();

    world.spawn('siegeWalker');

    const walker = onlyWalker(world);
    expect(walker).toMatchObject({ type: 'siegeWalker', width: 220, height: 200, hp: WALKER.hp });
    expect(walker.transform.x + WALKER.width / 2).toBeLessThan(0);
    expect(Math.abs(walker.transform.y - (GROUND_Y - WALKER.height / 2))).toBeLessThan(1);
  });

  it('walks at its walking speed over flat ground, up the slope to the Ink Core, deals it 8 and goes', () => {
    const world = createWorld();
    const heard = hear(world);
    const id = world.spawn('siegeWalker');
    runFor(world, 5);
    expect(onlyWalker(world).velocity.x).toBeCloseTo(WALKER.walkingSpeed, 0);

    const reached = stepUntil(world, 90, () => world.enemies.length === 0);

    expect(reached).toBe(true);
    expect(world.inkCore.hp).toBe(10 - 8);
    expect(wentOf(heard())).toEqual([`enemy ${id} reached`]);
  });

  it('walks up a 30° slope to the Ink Core', () => {
    const world = createWorld({ arena: slopeArena(30) });
    world.spawn('siegeWalker', standingAt(800));

    const reached = stepUntil(world, 60, () => world.enemies.length === 0);

    expect(reached).toBe(true);
    expect(world.inkCore.hp).toBe(10 - WALKER.coreDamage);
  });

  it('never climbs a step: it stops at a Terrain step 80 px high and stays on the ground', () => {
    const step = [
      { x: 500, y: GROUND_Y - 80 },
      { x: 900, y: GROUND_Y - 80 },
      { x: 900, y: GROUND_Y },
      { x: 500, y: GROUND_Y },
    ];
    const world = createWorld({
      arena: { ...SANDBOX_ARENA, terrain: [...SANDBOX_ARENA.terrain, step] },
    });
    world.spawn('siegeWalker', standingAt(300));

    runFor(world, 15);

    const walker = onlyWalker(world);
    expect(walker.transform.x + WALKER.width / 2).toBeLessThan(500 + WALKER.width / 2);
    expect(walker.transform.y + WALKER.height / 2).toBeCloseTo(GROUND_Y, 0);
    expect(walker.transform.angle).toBeCloseTo(0, 2);
  });

  it('presses a Line in its way and wears through grey almost at once, black in a few seconds', () => {
    const wearThrough = (colour: Colour) => {
      const world = createWorld();
      const wall = drawLine(
        world,
        [
          { x: 600, y: GROUND_Y - 4 },
          { x: 600, y: GROUND_Y - 250 },
        ],
        colour,
      );
      world.spawn('siegeWalker', standingAt(400));
      const durability = () =>
        Math.min(...piecesOf(world.lines.find(({ id }) => id === wall)!).map((p) => p.durability));
      const full = durability();
      expect(stepUntil(world, 10, () => durability() < full)).toBe(true);
      const from = world.time;
      const broken = () => piecesOf(world.lines.find(({ id }) => id === wall)!).length < 5;
      expect(stepUntil(world, 20, broken)).toBe(true);
      return world.time - from;
    };

    expect(wearThrough('grey')).toBeLessThan(2);
    const black = wearThrough('black');
    expect(black).toBeGreaterThan(3);
    expect(black).toBeLessThan(7);
  });

  it('shoves a free black Object of about 80 px, and only presses a Frozen one', () => {
    const shove = (frozen: boolean) => {
      const world = createWorld();
      const box = drawObject(world, dragBox(560, GROUND_Y - 80, 80, 78), 'black');
      world.fillAt({ x: 600, y: GROUND_Y - 40 }, 'black');
      world.togglePause();
      if (!frozen) world.release(box);
      runFor(world, 0.5);
      world.spawn('siegeWalker', standingAt(400));
      let moved = 0;
      let durability = Infinity;
      stepUntil(world, 6, () => {
        const object = world.objects.find(({ id }) => id === box);
        if (!object) return true; // worn through
        moved = Math.max(moved, object.transform.x - 600);
        durability = Math.min(durability, object.durability);
        return false;
      });
      return { moved, durability };
    };
    const black = DEFAULT_MATERIAL_TABLE.colours.black.outline.durability;

    const free = shove(false);
    const held = shove(true);

    expect(free.moved).toBeGreaterThan(50);
    expect(free.durability).toBe(black);
    expect(held.moved).toBeLessThan(1);
    expect(held.durability).toBeLessThan(black / 2);
  });

  describe('takes damage by the one rule', () => {
    /** The damage a filled box `size` px of `colour` dropped `height` px onto its hull deals it. */
    function dropOn(size: number, height: number, colour: Colour): number {
      const world = createWorld();
      editEnemies(world.enemyTable, (table) => (table.floorWear = 0));
      world.spawn('siegeWalker', standingAt(600));
      runFor(world, 0.5);
      const { transform } = onlyWalker(world);
      const top = transform.y - WALKER.height / 2;
      const box = drawObject(
        world,
        dragBox(transform.x - size / 2, top - height - size, size, size),
        colour,
      );
      world.fillAt({ x: transform.x, y: top - height - size / 2 }, colour);
      world.release(box);
      runFor(world, 2);
      return WALKER.hp - onlyWalker(world).hp;
    }

    it('takes nothing from a 60 px grey box dropped 300 px onto it', () => {
      expect(dropOn(60, 300, 'grey')).toBe(0);
    });

    it('takes from a 100 px black box dropped 400 px, and dies of three or four', () => {
      const damage = dropOn(100, 400, 'black');

      expect(damage).toBeGreaterThan(0);
      expect(WALKER.hp / damage).toBeGreaterThan(3);
      expect(WALKER.hp / damage).toBeLessThan(4);
    });
  });

  it('dies wholly below the screen, letting out no Belly and dropping its Drop', () => {
    const world = createWorld({
      arena: { ...SANDBOX_ARENA, terrain: sandboxTerrainWithPit(400, 800) },
    });
    const id = world.spawn('siegeWalker', { x: 600, y: GROUND_Y - 200 }, 'red');
    const heard = hear(world);

    const died = stepUntil(world, 10, () => world.enemies.length === 0);

    expect(died).toBe(true);
    const entries = heard();
    expect(wentOf(entries)).toEqual([`enemy ${id} died`]);
    expect(entriesOf(entries, 'dropped')).toHaveLength(1);
    expect(entriesOf(entries, 'added')).toEqual([]);
    expect(entriesOf(entries, 'exploded')).toEqual([]);
  });

  it('killed in the Arena, lets out its Belly where it died, on top of its Drop', () => {
    const world = createWorld();
    editEnemies(world.enemyTable, (table) => (table.types.siegeWalker.hp = 1));
    const heard = hear(world);
    world.spawn('siegeWalker', { x: 700, y: GROUND_Y - 400 }, 'black');

    const died = stepUntil(world, 5, () => world.enemies.length === 0);

    expect(died).toBe(true);
    const entries = heard();
    expect(entriesOf(entries, 'dropped')).toHaveLength(1);
    expect(world.rubble.length).toBeGreaterThan(0);
    expect(world.rubble.every(({ colour }) => colour === 'black')).toBe(true);
  });
});
