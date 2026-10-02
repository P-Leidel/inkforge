import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import {
  createEnemyTable,
  DEFAULT_ENEMY_TABLE,
  editEnemies,
  type EnemyType,
} from '../materials/enemy-table';
import { DEFAULT_MATERIAL_TABLE } from '../materials/material-table';
import { dragBox, dragCircle } from '../stroke/pointer-paths';
import { SANDBOX_ARENA, sandboxTerrainWithPit, type Arena } from './arena';
import { enemyOutline, walkingForce } from './enemies';
import type { EnemyView, PatchView, SandboxWorld } from './sandbox-world';
import {
  drawLine,
  drawObject,
  drawPost,
  entriesOf,
  hear,
  mirrored,
  objectById,
  runFor,
  sandboxWorlds,
  wentOf,
  worldSegments,
} from './test-support';

const createWorld = sandboxWorlds();
const CRAWLER = DEFAULT_ENEMY_TABLE.types.crawler;
const GROUND_Y = SANDBOX_ARENA.spawn.y;

/** How high (px) an Enemy's feet are above the ground. */
const feet = (enemy: EnemyView) => GROUND_Y - (enemy.transform.y + enemy.height / 2);

/** The one Enemy in the Arena. */
function onlyEnemy(world: SandboxWorld): EnemyView {
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

/** A Line on the ground from `x` for `length` px, its underside on the ground. */
function floorLine(world: SandboxWorld, x: number, length: number, colour: Colour): void {
  drawLine(
    world,
    [
      { x, y: GROUND_Y - 4 },
      { x: x + length, y: GROUND_Y - 4 },
    ],
    colour,
  );
}

/** A ramp rising `degrees` from the ground at `x`, 150 px long. */
function ramp(world: SandboxWorld, x: number, degrees: number): void {
  const turn = (degrees * Math.PI) / 180;
  const foot = { x, y: GROUND_Y - 4 };
  drawLine(world, [foot, { x: x + 150 * Math.cos(turn), y: foot.y - 150 * Math.sin(turn) }]);
}

describe('The walking force', () => {
  it('takes the body to its walking speed over one step, capped at its push either way', () => {
    // 1 mass, 60 steps a second: 30 px/s short needs 1800.
    expect(walkingForce(30, 60, 5000, 1, 1 / 60)).toBeCloseTo(1800, 9);
    expect(walkingForce(0, 60, 1000, 1, 1 / 60)).toBe(1000);
    expect(walkingForce(-200, 60, 1000, 1, 1 / 60)).toBe(1000);
    expect(walkingForce(400, 60, 1000, 1, 1 / 60)).toBe(-1000);
    expect(walkingForce(60, 60, 1000, 1, 1 / 60)).toBe(0);
  });

  it('shapes an Enemy as an upright box with bevelled feet, gentler than 45°', () => {
    const outline = enemyOutline(40, 40);
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([
      -20, 20, -20, 20,
    ]);
    // The front foot's bevel: from the bottom to the side.
    const foot = outline.find((p) => p.x === 20 && p.y > 0)!;
    const toe = outline.find((p) => p.y === 20 && p.x > 0)!;
    const rise = toe.y - foot.y;
    const run = foot.x - toe.x;
    expect(rise).toBeGreaterThan(8); // taller than a Line is thick
    expect(Math.atan2(rise, run)).toBeLessThan(Math.PI / 4);
  });
});

describe('Enemies walk', () => {
  it('sends a Crawler in at the Spawn, beyond the left edge, paused or running', () => {
    const world = createWorld();

    const id = world.spawn('crawler');

    const crawler = onlyEnemy(world);
    expect(crawler).toMatchObject({ id, type: 'crawler', width: 40, height: 40 });
    expect(crawler.transform.x + CRAWLER.width / 2).toBeLessThan(0); // out of view
    expect(Math.abs(crawler.transform.y - (GROUND_Y - CRAWLER.height / 2))).toBeLessThan(1);
    runFor(world, 0.5);
    world.spawn('crawler');
    expect(world.enemies).toHaveLength(2);
  });

  it('stacks a Crawler sent in while the Spawn is taken on top of the one there', () => {
    const world = createWorld();

    world.spawn('crawler');
    world.spawn('crawler');

    const [first, second] = world.enemies;
    expect(second!.transform.x).toBeCloseTo(first!.transform.x, 6);
    expect(second!.transform.y).toBeLessThan(first!.transform.y - CRAWLER.height + 1);
  });

  it("says the lane's far end is taken while an Enemy stands there, and free once it walked on", () => {
    const world = createWorld();
    expect(world.spawnClear('heavy')).toBe(true);

    world.spawn('crawler');

    expect(world.spawnClear('crawler')).toBe(false);
    expect(world.spawnClear('heavy')).toBe(false);
    expect(stepUntil(world, 3, () => world.spawnClear('heavy'))).toBe(true);
    expect(world.enemyCount).toBe(1);
  });

  it('walks a Crawler from the Spawn onto the screen, along the ground, up the slope to the Ink Core, which loses 1 HP; the Crawler is gone', () => {
    const world = createWorld();
    const heard = hear(world);
    const id = world.spawn('crawler');
    let highest = Infinity;
    let fastest = 0;

    const reached = stepUntil(world, 45, () => {
      const crawler = world.enemies[0];
      if (!crawler) return true;
      highest = Math.min(highest, crawler.transform.y);
      fastest = Math.max(fastest, crawler.velocity.x);
      return false;
    });

    expect(reached).toBe(true);
    expect(highest).toBeLessThan(SANDBOX_ARENA.core.maxY - CRAWLER.height / 2 + 1); // on the plateau
    expect(fastest).toBeCloseTo(CRAWLER.walkingSpeed, 0);
    expect(world.inkCore).toMatchObject({ hp: 9, fullHp: 10 });
    expect(world.enemies).toEqual([]);
    expect(wentOf(heard())).toEqual([`enemy ${id} reached`]);
  });

  it('rides up onto a Line lying on the ground', () => {
    const world = createWorld();
    floorLine(world, 100, 300, 'grey');
    world.spawn('crawler');

    stepUntil(world, 20, () => onlyEnemy(world).transform.x > 300);

    const crawler = onlyEnemy(world);
    expect(crawler.transform.x).toBeGreaterThan(300);
    expect(crawler.transform.y).toBeLessThan(GROUND_Y - CRAWLER.height / 2 - 6); // on the Line
  });

  it('climbs a surface no steeper than 45°, and not a steeper one', () => {
    const past = (degrees: number) => {
      const world = createWorld();
      ramp(world, 200, degrees);
      world.spawn('crawler');
      runFor(world, 16);
      return onlyEnemy(world).transform.x;
    };

    // The ramp's top end is 150 px along it: about 310 px from the left edge at 44°.
    expect(past(44)).toBeGreaterThan(400);
    expect(past(46)).toBeLessThan(200);
    expect(past(60)).toBeLessThan(200);
  });

  it('slows down on glue: it is just a moving body', () => {
    const at = (colour: Colour) => {
      const world = createWorld();
      floorLine(world, 100, 600, colour);
      world.spawn('crawler');
      runFor(world, 12);
      return onlyEnemy(world).transform.x;
    };

    const onGrey = at('grey');
    const onGreen = at('green');

    // Its walking force makes up for the drag each step, up to its push: only a little shows.
    expect(onGreen).toBeLessThan(onGrey - 5);
  });

  it('kills an Enemy below the bottom of the screen', () => {
    const world = createWorld({ arena: PIT_ARENA });
    const heard = hear(world);
    const id = world.spawn('crawler');

    const died = stepUntil(world, 20, () => world.enemies.length === 0);

    expect(died).toBe(true);
    expect(wentOf(heard())).toEqual([`enemy ${id} died`]);
    expect(world.inkCore.hp).toBe(10);
  });

  it('destroys an Object that falls down a Pit once it is below the screen', () => {
    const world = createWorld({ arena: PIT_ARENA });
    const heard = hear(world);
    const id = drawObject(world, dragBox(440, GROUND_Y - 60, 40, 40));
    world.togglePause();
    world.release(id);

    const gone = stepUntil(world, 10, () => world.objects.length === 0);

    expect(gone).toBe(true);
    expect(wentOf(heard())).toEqual([`object ${id} left`]);
  });

  it('walks an Enemy thrown back over the left edge in again', () => {
    const world = createWorld();
    const heard = hear(world);
    // A big red bomb in the Crawler's way: pressing it sets it off.
    drawObject(world, dragCircle({ x: 300, y: GROUND_Y - 31 }, 30), 'red');
    world.fillAt({ x: 300, y: GROUND_Y - 31 }, 'red');
    world.spawn('crawler');
    stepUntil(world, 15, () => entriesOf(heard(), 'exploded').length > 0);
    expect(world.objects).toEqual([]); // the bomb went off

    let furthestBack = Infinity;
    stepUntil(world, 2, () => {
      furthestBack = Math.min(furthestBack, onlyEnemy(world).transform.x);
      return false;
    });
    runFor(world, 10);

    expect(furthestBack + CRAWLER.width / 2).toBeLessThan(0); // wholly out of view
    expect(onlyEnemy(world).transform.x).toBeGreaterThan(100); // back in
  });

  it('removes an Object pushed wholly out over the left edge, with no Blast and no Fill', () => {
    const world = createWorld();
    const heard = hear(world);
    const bomb = drawObject(world, dragBox(40, GROUND_Y - 41, 40, 40), 'red');
    world.fillAt({ x: 60, y: GROUND_Y - 21 }, 'red');
    runFor(world, 0.1);

    world.release(bomb, { x: -800, y: 0 });
    runFor(world, 1);

    expect(world.objects).toEqual([]);
    const entries = heard();
    expect(wentOf(entries)).toEqual([`object ${bomb} left`]);
    expect(entriesOf(entries, 'exploded')).toEqual([]);
    expect(entriesOf(entries, 'burst')).toEqual([]);
    expect(world.rubble).toEqual([]);
    expect(world.blasts).toEqual([]);
  });

  it('cuts a Stroke that runs past the left edge there, and refuses an Object past it', () => {
    const world = createWorld();

    drawLine(world, [
      { x: -150, y: 500 },
      { x: 300, y: 500 },
    ]);
    const outcome = world.submitStroke(dragBox(-30, 400, 60, 60), 'grey');

    const xs = worldSegments(world.lines[0]!).flatMap(({ a, b }) => [a.x, b.x]);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(outcome.kind).toBe('rejected');
  });

  it('lets R bring back the Enemies and the Ink Core’s HP, and a retry plays out the same', () => {
    const world = createWorld();
    world.spawn('crawler');
    runFor(world, 30);
    world.spawn('crawler');
    world.togglePause();
    world.togglePause(); // the snapshot: one on the slope, one at the Spawn
    const started = world.enemies.map(({ id, transform }) => ({ id, transform }));
    runFor(world, 12);
    const first = { enemies: world.enemies, core: world.inkCore };
    expect(first.core.hp).toBe(9);

    world.reset();
    expect(world.enemies.map(({ id, transform }) => ({ id, transform }))).toEqual(started);
    expect(world.inkCore.hp).toBe(10);
    runFor(world, 12);

    expect({ enemies: world.enemies, core: world.inkCore }).toEqual(first);
  });

  it('lets Clear remove the Enemies and make the Ink Core whole', () => {
    const world = createWorld();
    world.spawn('crawler');
    runFor(world, 38);
    world.spawn('crawler');
    expect(world.inkCore.hp).toBe(9);

    world.clear();

    expect(world.enemies).toEqual([]);
    expect(world.inkCore.hp).toBe(10);
    world.spawn('crawler');
    runFor(world, 1);
    expect(world.enemies).toHaveLength(1);
  });

  it('takes an F2 edit to its walking speed from the next step', () => {
    const world = createWorld();
    world.spawn('crawler');
    runFor(world, 3);

    editEnemies(world.enemyTable, (table) => (table.types.crawler.walkingSpeed = 90));
    runFor(world, 1);

    expect(onlyEnemy(world).velocity.x).toBeCloseTo(90, 0);
  });

  it('never damages the Ink Core but by an Enemy reaching it', () => {
    const world = createWorld();
    const { minX, maxX, minY } = world.inkCore.bounds;
    const centre: Vec2 = { x: (minX + maxX) / 2, y: minY - 200 };
    // A boulder dropped on it, and a big bomb going off beside it.
    drawObject(world, dragBox(centre.x - 30, centre.y - 30, 60, 60), 'black');
    world.fillAt(centre, 'black');
    drawObject(world, dragCircle({ x: minX - 60, y: minY - 40 }, 30), 'red');
    world.fillAt({ x: minX - 60, y: minY - 40 }, 'red');
    world.togglePause();
    for (const object of world.objects) world.release(object.id);

    runFor(world, 3);

    expect(world.inkCore.hp).toBe(10);
  });
});

describe('Climbing', () => {
  const HEAVY = DEFAULT_ENEMY_TABLE.types.heavy;
  /** Where the wall's near face is (px). */
  const WALL_X = 600;
  /** The sandbox Arena with a Terrain wall `height` px tall standing on its ground at `WALL_X`. */
  const walled = (height: number): Arena => ({
    ...SANDBOX_ARENA,
    terrain: [
      ...SANDBOX_ARENA.terrain,
      [
        { x: WALL_X, y: GROUND_Y - height },
        { x: WALL_X + 40, y: GROUND_Y - height },
        { x: WALL_X + 40, y: GROUND_Y },
        { x: WALL_X, y: GROUND_Y },
      ],
    ],
  });
  /** Sends in each type in turn, `gap` seconds apart, then runs on for `after` seconds. */
  const sendIn = (world: SandboxWorld, types: EnemyType[], gap: number, after: number) => {
    for (const type of types) {
      world.spawn(type);
      runFor(world, gap);
    }
    runFor(world, after);
  };

  it('lets a Crawler climb onto one stopped in its way, whose top is within its step', () => {
    const world = createWorld({ arena: walled(200) });

    sendIn(world, ['crawler', 'crawler'], 2, 14);

    const [first, second] = world.enemies;
    expect(feet(first!)).toBeLessThan(1);
    expect(feet(second!)).toBeCloseTo(CRAWLER.height, -0.5); // on top of the first
    expect(Math.abs(second!.transform.x - first!.transform.x)).toBeLessThan(CRAWLER.width / 2);
  });

  it('lets a Runner climb onto a Crawler too', () => {
    const world = createWorld({ arena: walled(200) });

    // The Runner sent in once the Crawler is at the wall: sooner, it would climb over it on the way.
    sendIn(world, ['crawler', 'runner'], 12, 6);

    const [, runner] = world.enemies;
    expect(feet(runner!)).toBeCloseTo(CRAWLER.height, -0.5);
  });

  it('refuses a step higher than its climbing step: it only presses it and waits', () => {
    // A Heavy is 64 px tall, more than 1.2 Crawler heights (48 px).
    const world = createWorld({ arena: walled(200) });

    sendIn(world, ['heavy', 'crawler'], 18, 12);

    const [heavy, crawler] = world.enemies;
    expect(feet(crawler!)).toBeLessThan(1);
    expect(crawler!.transform.x).toBeLessThan(heavy!.transform.x - HEAVY.width / 2);
  });

  it('never lets a Heavy climb, but lets an Enemy climb a Heavy where its step allows', () => {
    const world = createWorld({ arena: walled(200) });
    sendIn(world, ['crawler', 'heavy'], 2, 20);
    const [, heavy] = world.enemies;
    expect(feet(heavy!)).toBeLessThan(1);

    const tuned = createWorld({ arena: walled(200) });
    editEnemies(tuned.enemyTable, (table) => (table.climbStep = 2));
    sendIn(tuned, ['heavy', 'crawler'], 18, 12);
    const [, crawler] = tuned.enemies;
    expect(feet(crawler!)).toBeCloseTo(HEAVY.height, -0.5);
  });

  it('climbs a wall of the Terrain or a Line, even upright, whose top is within its step', () => {
    // 40 px: within 1.2 Crawler heights (48 px).
    const terrain = createWorld({ arena: walled(CRAWLER.height) });
    terrain.spawn('crawler');
    runFor(terrain, 16);
    expect(onlyEnemy(terrain).transform.x).toBeGreaterThan(WALL_X + 40);

    const line = createWorld();
    drawLine(line, [
      { x: WALL_X, y: GROUND_Y - 4 },
      { x: WALL_X, y: GROUND_Y - 34 },
    ]);
    line.spawn('crawler');
    runFor(line, 16);
    expect(onlyEnemy(line).transform.x).toBeGreaterThan(WALL_X + 40);
  });

  it('never climbs a wall whose top is above its step: it only presses it', () => {
    // 60 px: more than 1.2 Crawler heights (48 px).
    const world = createWorld({ arena: walled(60) });
    world.spawn('crawler');
    runFor(world, 16);
    const crawler = onlyEnemy(world);
    expect(crawler.transform.x).toBeLessThan(WALL_X);
    expect(feet(crawler)).toBeLessThan(1);
  });

  it('lets a Crawler standing on another climb a wall two Crawlers tall', () => {
    const world = createWorld({ arena: walled(2 * CRAWLER.height) });

    sendIn(world, ['crawler', 'crawler'], 2, 14);

    const [first, second] = world.enemies;
    expect(first!.transform.x).toBeLessThan(WALL_X);
    expect(second!.transform.x).toBeGreaterThan(WALL_X + 40); // over, from the first's top
  });

  it('builds a staircase at a wall three Crawlers tall, and the Crawlers after the third get over it', () => {
    const world = createWorld({ arena: walled(3 * CRAWLER.height) });

    sendIn(world, Array<EnemyType>(6).fill('crawler'), 3, 20);

    // #1 presses the wall, #2 stands on #1, #3 meets a 2-high step and waits: the stair.
    const [first, second, third, ...rest] = world.enemies;
    expect([first, second, third].map((enemy) => enemy!.id)).toEqual([1, 2, 3]);
    expect(feet(first!)).toBeLessThan(1);
    expect(feet(second!)).toBeCloseTo(CRAWLER.height, -0.5);
    expect(feet(third!)).toBeLessThan(1);
    expect(third!.transform.x).toBeLessThan(first!.transform.x - CRAWLER.width + 1);
    // #4 to #6 climbed #3, then #2, then the wall, and walked on.
    const over = 6 - 3 - rest.filter((enemy) => enemy.transform.x < WALL_X).length;
    expect(over).toBe(3);
  });
});

describe('Strokes meet Enemies', () => {
  /** A Crawler walked in past x = 400 and paused there. */
  const pausedCrawler = (world: SandboxWorld): EnemyView => {
    world.spawn('crawler');
    stepUntil(world, 20, () => onlyEnemy(world).transform.x > 400);
    world.togglePause();
    return onlyEnemy(world);
  };
  const xsOf = (world: SandboxWorld) =>
    world.lines.flatMap((line) => worldSegments(line).flatMap(({ a, b }) => [a.x, b.x]));
  const lengthOf = (world: SandboxWorld) =>
    world.lines
      .flatMap(({ segments }) => segments)
      .reduce((sum, { a, b }) => sum + Math.hypot(b.x - a.x, b.y - a.y), 0);

  it('cuts a Line drawn across a paused Crawler at the Crawler', () => {
    const world = createWorld();
    const { x, y } = pausedCrawler(world).transform;

    drawLine(world, [
      { x: x - 150, y },
      { x: x + 150, y },
    ]);

    const xs = xsOf(world);
    const half = CRAWLER.width / 2;
    expect(xs.filter((at) => at > x - half + 0.5 && at < x + half - 0.5)).toEqual([]);
    expect(Math.min(...xs)).toBeLessThan(x - half);
    expect(Math.max(...xs)).toBeGreaterThan(x + half);
    expect(lengthOf(world)).toBeCloseTo(300 - CRAWLER.width, -1);
  });

  it('cuts a Line drawn across the Ink Core there', () => {
    const world = createWorld();
    const { minX, maxX, minY, maxY } = world.inkCore.bounds;
    const y = (minY + maxY) / 2;

    drawLine(world, [
      { x: minX - 200, y },
      { x: (minX + maxX) / 2, y },
    ]);

    expect(Math.max(...xsOf(world))).toBeCloseTo(minX, 0);
    expect(lengthOf(world)).toBeCloseTo(200, -1);
  });

  it('refuses an Object drawn over a paused Crawler or the Ink Core', () => {
    const world = createWorld();
    const { x, y } = pausedCrawler(world).transform;
    const top = y - CRAWLER.height / 2;
    const core = world.inkCore.bounds;
    const middle = (core.minY + core.maxY) / 2;

    // Into the Crawler's top by 10 px, and into the Ink Core's side by 20 px.
    expect(world.submitStroke(dragBox(x - 25, top - 40, 50, 50), 'grey')).toMatchObject({
      kind: 'rejected',
      reason: 'overlaps',
    });
    expect(world.submitStroke(dragBox(core.minX - 30, middle - 25, 50, 50), 'grey')).toMatchObject({
      kind: 'rejected',
      reason: 'overlaps',
    });
    expect(world.objects).toEqual([]);
    // Clear of the Crawler by 10 px: it may go there.
    drawObject(world, dragBox(x - 25, top - 60, 50, 50));
    expect(world.objects).toHaveLength(1);
  });
});

describe('Pressing wear', () => {
  /** A grey Line standing upright on the ground at `x`, `height` px tall. */
  const post = (world: SandboxWorld, x: number, height: number, colour: Colour = 'grey') =>
    drawLine(
      world,
      [
        { x, y: GROUND_Y - 4 },
        { x, y: GROUND_Y - 4 - height },
      ],
      colour,
    );
  const durabilities = (world: SandboxWorld) =>
    world.lines.map(({ pieces }) => pieces.map(({ durability }) => durability));

  it('lets a Crawler against a grey Line wear one Piece through in about 20 s; the Piece breaks and the Crawler walks on', () => {
    const world = createWorld();
    const heard = hear(world);
    const line = post(world, 300, 86); // two Pieces: the Crawler presses the lower one
    world.spawn('crawler');
    let pressedFrom: number | null = null;
    let broke: number | null = null;

    stepUntil(world, 45, () => {
      const [lower] = world.lines[0]!.pieces;
      if (pressedFrom === null && lower!.durability < 6000) pressedFrom = world.time;
      if (broke === null && world.lines[0]!.pieces.length < 2) broke = world.time;
      return broke !== null;
    });

    expect(wentOf(heard())).toEqual([`piece ${line}.0 broke`]);
    expect(broke! - pressedFrom!).toBeCloseTo(6000 / CRAWLER.pressing, 0);
    expect(durabilities(world)).toEqual([[6000]]); // the upper Piece, out of its reach
    runFor(world, 3);
    expect(onlyEnemy(world).transform.x).toBeGreaterThan(400);
  });

  it('wears and breaks a Frozen Object in its way, and never wakes it', () => {
    const world = createWorld();
    const heard = hear(world);
    const box = drawObject(world, dragBox(300, GROUND_Y - 60, 50, 56), 'grey');
    world.spawn('crawler');
    let wornWhileFrozen = false;

    const broke = stepUntil(world, 30, () => {
      const object = world.objects[0];
      if (!object) return true;
      expect(object.frozen).toBe(true);
      if (object.durability < DEFAULT_MATERIAL_TABLE.colours.grey.outline.durability)
        wornWhileFrozen = true;
      return false;
    });

    expect(broke).toBe(true);
    expect(wornWhileFrozen).toBe(true);
    expect(wentOf(heard())).toEqual([`object ${box} broke`]);
    runFor(world, 3);
    expect(onlyEnemy(world).transform.x).toBeGreaterThan(400);
  });

  it('sets off a red Line on the floor under a Crawler within about a second', () => {
    const world = createWorld();
    const heard = hear(world);
    floorLine(world, 200, 200, 'red');
    world.spawn('crawler');
    let steppedOn: number | null = null;

    stepUntil(world, 20, () => {
      const pieces = world.lines[0]?.pieces ?? [];
      if (steppedOn === null && pieces.some(({ durability }) => durability < 250))
        steppedOn = world.time;
      return entriesOf(heard(), 'exploded').length > 0;
    });

    expect(steppedOn).not.toBeNull();
    expect(entriesOf(heard(), 'exploded').length).toBeGreaterThan(0);
    expect(world.time - steppedOn!).toBeLessThan(1.2);
  });

  it('lets Crawlers stacked on a grey bridge wear it through', () => {
    const world = createWorld({ arena: PIT_ARENA });
    const heard = hear(world);
    const bridge = drawLine(world, [
      { x: 380, y: GROUND_Y - 4 },
      { x: 540, y: GROUND_Y - 4 },
    ]);
    post(world, 520, 190, 'black'); // it stops them on the bridge
    for (let k = 0; k < 4; k++) {
      world.spawn('crawler');
      runFor(world, 1.5);
    }

    const through = stepUntil(world, 40, () => world.enemies.length === 0);

    expect(through).toBe(true);
    const went = wentOf(heard());
    // They climb onto each other at the post, so they stand on, and wear through, two Pieces.
    expect(went.filter((what) => what.startsWith(`piece ${bridge}.`))).toHaveLength(2);
    expect(went.filter((what) => what.endsWith(' died'))).toHaveLength(4);
  });

  it('lets two Crawlers stacked at a grey Line wear it half again as fast each', () => {
    const world = createWorld();
    post(world, 300, 190);
    world.spawn('crawler');
    runFor(world, 2);
    world.spawn('crawler');
    const [first] = world.enemies;
    const stacked = () => world.enemies.some((enemy) => feet(enemy) > CRAWLER.height - 1);
    expect(stepUntil(world, 20, stacked)).toBe(true);
    runFor(world, 0.5);

    const lower = () => world.lines[0]!.pieces[0]!.durability;
    const before = lower();
    runFor(world, 2);

    expect(feet(world.enemies[0]!)).toBeLessThan(1);
    expect(world.enemies[0]!.id).toBe(first!.id);
    // Both press the lower Piece, each at its rate and half again for the other.
    expect((before - lower()) / 2).toBeCloseTo(2 * 1.5 * CRAWLER.pressing, -1);
  });

  it('wears a Line or an Object whose corner only catches a stalled Enemy’s head, until it walks on', () => {
    for (const type of ['crawler', 'runner', 'heavy'] as const) {
      const { height } = DEFAULT_ENEMY_TABLE.types[type];
      const world = createWorld();
      // A short Line hanging Frozen at a slant, its low round end just above
      // the Enemy's head: worn away or knocked loose, it lets the Enemy by.
      drawLine(world, [
        { x: 300, y: GROUND_Y - height - 2 },
        { x: 330, y: GROUND_Y - height - 20 },
      ]);
      expect(world.lines[0]!.pieces).toHaveLength(1);
      world.spawn(type);
      const by = stepUntil(world, 50, () =>
        world.enemies.every(({ transform }) => transform.x > 400),
      );
      expect(by, type).toBe(true);
    }

    const world = createWorld();
    // A Frozen box in mid-air, its bottom corner just below a Crawler's head.
    drawObject(world, dragBox(300, GROUND_Y - CRAWLER.height + 2 - 60, 60, 60), 'grey');
    world.spawn('crawler');
    runFor(world, 30);
    expect(world.objects).toEqual([]);
    expect(onlyEnemy(world).transform.x).toBeGreaterThan(400);
  });

  it('wears a Piece left hanging over it on the slope, until it walks on to the Ink Core', () => {
    const world = createWorld();
    // The sandbox slope rises 1 in 2 from x = 1400. An upright grey wall on it:
    // once its bottom Piece breaks, the next hangs just above and behind the
    // Crawler's head as the ground rises under it.
    const slopeY = (x: number) => GROUND_Y - (x - 1400) / 2;
    drawLine(world, [
      { x: 1550, y: slopeY(1550) - 2 },
      { x: 1550, y: slopeY(1550) - 200 },
    ]);
    world.spawn('crawler');

    const reached = stepUntil(world, 120, () => world.enemies.length === 0);

    expect(reached).toBe(true);
    expect(world.inkCore.hp).toBe(9);
  });

  it('wears nothing on the Terrain and nothing when no Enemy is there', () => {
    const world = createWorld();
    post(world, 300, 86);
    runFor(world, 30);
    expect(durabilities(world)).toEqual([[6000, 6000]]);
  });

  it('lets R bring back what pressing had worn, and a retry plays out the same', () => {
    const world = createWorld();
    post(world, 300, 86);
    world.spawn('crawler');
    runFor(world, 14); // pressing for some seconds already
    world.togglePause();
    world.togglePause(); // the snapshot
    const started = durabilities(world);
    expect(started[0]![0]).toBeLessThan(6000);
    runFor(world, 16);
    const first = { lines: durabilities(world), enemies: world.enemies };
    expect(first.lines).toEqual([[6000]]); // worn through

    world.reset();
    expect(durabilities(world)).toEqual(started);
    runFor(world, 16);

    expect({ lines: durabilities(world), enemies: world.enemies }).toEqual(first);
  });
});

describe('Enemies take damage', () => {
  /** A black post standing on the ground at `x`, which holds a Crawler walking up to it; returns its path. */
  function holdAt(world: SandboxWorld, x: number): Vec2[] {
    const path = [
      { x, y: GROUND_Y - 4 },
      { x, y: GROUND_Y - 90 },
    ];
    drawLine(world, path, 'black');
    return path;
  }

  /**
   * A Crawler dropped from `height` px (its underside's fall) onto a grey
   * Line at y 700, with floor wear off so only the landing counts. Returns
   * its HP and the Pieces' durabilities just after it lands.
   */
  function drop(height: number): { hp: number; pieces: number[] } {
    const world = createWorld();
    editEnemies(world.enemyTable, (table) => (table.floorWear = 0));
    drawPost(world, { x: 700, y: 700 });
    const line = drawLine(world, [
      { x: 700, y: 700 },
      { x: 900, y: 700 },
    ]);
    // The Line's top is 4 px above it; the Crawler's centre half its height above its underside.
    world.spawn('crawler', { x: 790, y: 700 - 4 - CRAWLER.height / 2 - height });
    let falling = false;
    stepUntil(world, 3, () => {
      const { velocity } = onlyEnemy(world);
      if (velocity.y > 1) falling = true;
      return falling && velocity.y <= 1;
    });
    world.step();
    return {
      hp: onlyEnemy(world).hp,
      pieces: world.lines.find(({ id }) => id === line)!.pieces.map(({ durability }) => durability),
    };
  }

  it('hurts a Crawler dropped from high enough on landing, and the Line it lands on; a short drop does nothing', () => {
    const high = drop(400);
    const short = drop(15);

    expect(high.hp).toBeLessThan(CRAWLER.hp - 500);
    expect(Math.min(...high.pieces)).toBeLessThan(6000 - 200);
    expect(short).toEqual({ hp: CRAWLER.hp, pieces: [6000, 6000, 6000, 6000] });
  });

  it('shows no damage on a Crawler that only walks', () => {
    const world = createWorld();
    floorLine(world, 100, 300, 'grey');
    world.spawn('crawler');

    runFor(world, 15);

    expect(onlyEnemy(world).hp).toBe(CRAWLER.hp);
    expect(onlyEnemy(world).fullHp).toBe(CRAWLER.hp);
  });

  it('kills a Crawler a black boulder is dropped on: it pops and is gone, letting out only its Belly', () => {
    const world = createWorld();
    holdAt(world, 640); // where the boulder falls
    const id = world.spawn('crawler', { x: 610, y: GROUND_Y - CRAWLER.height / 2 }, 'grey');
    const boulder = drawObject(world, dragBox(585, GROUND_Y - 300, 50, 50), 'black');
    world.fillAt({ x: 610, y: GROUND_Y - 275 }, 'black');
    runFor(world, 0.5);
    const before = world.bodyCount;
    const heard = hear(world);

    world.release(boulder);
    const died = stepUntil(world, 2, () => world.enemies.length === 0);

    expect(died).toBe(true);
    const entries = heard();
    expect(wentOf(entries)).toEqual([`enemy ${id} died`]);
    const [pop] = entriesOf(entries, 'popped');
    expect(pop).toMatchObject({ id, type: 'crawler' });
    // The pop is a burst of its body, where it stood.
    const xs = pop!.outline.map(({ x }) => x);
    expect(Math.min(...xs)).toBeCloseTo(616 - CRAWLER.width / 2, -1);
    // Its grey Belly comes out as pebbles, and nothing else.
    const added = entriesOf(entries, 'added');
    expect(added.length).toBeGreaterThan(0);
    expect(added.every(({ what }) => what.thing === 'rubble')).toBe(true);
    expect(world.bodyCount).toBe(before - 1 + added.length);
    expect(world.rubble.every(({ colour }) => colour === 'grey')).toBe(true);
  });

  it('lets a Blast damage and push a Crawler', () => {
    const world = createWorld();
    const heard = hear(world);
    world.spawn('crawler', { x: 600, y: GROUND_Y - CRAWLER.height / 2 });
    // A red bomb dropped just ahead of it goes off on the ground.
    const bomb = drawObject(world, dragCircle({ x: 690, y: GROUND_Y - 200 }, 20), 'red');
    world.fillAt({ x: 690, y: GROUND_Y - 200 }, 'red');
    world.togglePause();
    world.release(bomb);
    stepUntil(world, 3, () => entriesOf(heard(), 'exploded').length > 0);
    let slowest = Infinity;

    stepUntil(world, 0.5, () => {
      slowest = Math.min(slowest, onlyEnemy(world).velocity.x);
      return false;
    });

    expect(onlyEnemy(world).hp).toBeLessThan(CRAWLER.hp);
    expect(slowest).toBeLessThan(-100); // thrown back, away from the Blast
  });

  it('lets a green Object stick to a Crawler and ride along with it', () => {
    const world = createWorld();
    world.spawn('crawler', { x: 300, y: GROUND_Y - CRAWLER.height / 2 });
    const green = drawObject(world, dragBox(280, GROUND_Y - 100, 30, 30), 'green');
    world.togglePause();
    world.release(green);

    runFor(world, 1);
    const stuck = world.bonds.find((bond) => bond.object === green);
    const from = objectById(world, green).transform.x;
    runFor(world, 2);

    expect(stuck).toBeDefined();
    expect(world.bonds.some((bond) => bond.object === green)).toBe(true);
    expect(objectById(world, green).transform.x).toBeGreaterThan(from + 60);
  });

  it('lets a Crawler reach the Ink Core through a green Object stuck to its front: the Ink Core loses 1 HP; the Crawler is gone', () => {
    const world = createWorld();
    const heard = hear(world);
    const id = world.spawn('crawler', { x: 300, y: GROUND_Y - CRAWLER.height / 2 });
    const green = drawObject(world, dragBox(300, GROUND_Y - CRAWLER.height - 60, 40, 40), 'green');
    world.togglePause();
    world.release(green);

    const reached = stepUntil(world, 45, () => world.enemies.length === 0);

    expect(reached).toBe(true);
    expect(world.inkCore).toMatchObject({ hp: 9, fullHp: 10 });
    expect(wentOf(heard())).toEqual([`enemy ${id} reached`]);
  });

  it('lets a Droplet land on a Crawler as a Patch that moves with it', () => {
    const world = createWorld();
    const { blue } = world.materials.colours;
    blue.outline.durability = 1;
    blue.outline.damageThreshold = 0;
    blue.fill.kickSpeed = 0;
    const post = holdAt(world, 640);
    world.spawn('crawler', { x: 610, y: GROUND_Y - CRAWLER.height / 2 });
    // A blue box that breaks on the Crawler's head and spills on it.
    const box = drawObject(world, dragBox(600, GROUND_Y - 100, 30, 30), 'blue');
    world.fillAt({ x: 615, y: GROUND_Y - 85 }, 'blue');
    world.togglePause();
    world.release(box);
    runFor(world, 1.5);
    const onTop = (patch: PatchView) =>
      Math.max(patch.segment.a.y, patch.segment.b.y) < GROUND_Y - CRAWLER.height + 2;
    const patch = world.patches.find(onTop);
    expect(patch).toBeDefined();
    const from = patch!.segment.a.x;

    world.eraseAlong(post, 6); // the Crawler walks on
    runFor(world, 2);

    const later = world.patches.find(({ id }) => id === patch!.id)!;
    expect(later.segment.a.x).toBeGreaterThan(from + 60);
    expect(onTop(later)).toBe(true);
  });

  it('lets R bring back each Enemy’s HP, and a retry plays out the same', () => {
    const world = createWorld();
    world.spawn('crawler', { x: 300, y: 300 }); // a fall that hurts it
    runFor(world, 2);
    const hurt = onlyEnemy(world).hp;
    expect(hurt).toBeLessThan(CRAWLER.hp);
    const boulder = drawObject(world, dragBox(620, GROUND_Y - 400, 50, 50), 'black');
    world.fillAt({ x: 645, y: GROUND_Y - 375 }, 'black');
    world.togglePause();
    world.togglePause(); // the snapshot
    world.release(boulder);
    runFor(world, 4);
    const first = { enemies: world.enemies, objects: world.objects };

    world.reset();
    expect(onlyEnemy(world).hp).toBe(hurt);
    world.togglePause();
    world.release(boulder);
    runFor(world, 4);

    expect({ enemies: world.enemies, objects: world.objects }).toEqual(first);
  });
});

describe('Runner and Heavy', () => {
  const RUNNER = DEFAULT_ENEMY_TABLE.types.runner;
  const HEAVY = DEFAULT_ENEMY_TABLE.types.heavy;

  it('sends in a Runner and a Heavy at the Spawn, each its own size', () => {
    const world = createWorld();

    world.spawn('runner');
    runFor(world, 3);
    world.spawn('heavy');

    const [runner, heavy] = world.enemies;
    expect(runner).toMatchObject({ type: 'runner', width: 32, height: 44, hp: RUNNER.hp });
    expect(heavy).toMatchObject({ type: 'heavy', width: 64, height: 64, hp: HEAVY.hp });
    expect(heavy!.transform.x + HEAVY.width / 2).toBeLessThan(0); // out of view
    expect(Math.abs(heavy!.transform.y - (GROUND_Y - HEAVY.height / 2))).toBeLessThan(1);
  });

  it('lets a Heavy wear a grey Piece through in about 4 s and a black one in about 13 s', () => {
    const wearThrough = (colour: Colour) => {
      const world = createWorld();
      drawLine(
        world,
        [
          { x: 300, y: GROUND_Y - 4 },
          { x: 300, y: GROUND_Y - 200 },
        ],
        colour,
      );
      const full = world.lines[0]!.pieces[0]!.durability;
      const count = world.lines[0]!.pieces.length;
      world.spawn('heavy');
      let pressedFrom: number | null = null;
      let broke: number | null = null;
      stepUntil(world, 60, () => {
        const { pieces } = world.lines[0]!;
        if (pressedFrom === null && pieces.some(({ durability }) => durability < full))
          pressedFrom = world.time;
        if (broke === null && pieces.length < count) broke = world.time;
        return broke !== null;
      });
      expect(broke, colour).not.toBeNull();
      return broke! - pressedFrom!;
    };

    expect(wearThrough('grey')).toBeCloseTo(6000 / HEAVY.pressing, 0);
    expect(wearThrough('black')).toBeCloseTo(20000 / HEAVY.pressing, 0);
  });

  it('lets a Heavy shove a light Object out of its way, where a Crawler presses it', () => {
    const push = (type: 'crawler' | 'heavy') => {
      const world = createWorld();
      // A filled grey box: too heavy for a Crawler's push, light for a Heavy's.
      const box = drawObject(world, dragBox(300, GROUND_Y - 60, 50, 56), 'grey');
      world.fillAt({ x: 325, y: GROUND_Y - 32 }, 'grey');
      world.togglePause();
      world.release(box);
      runFor(world, 0.5);
      const from = objectById(world, box).transform.x;
      world.spawn(type);
      let moved = 0;
      let durability = Infinity;
      stepUntil(world, 20, () => {
        const object = world.objects.find(({ id }) => id === box);
        if (!object) return true; // worn through
        moved = Math.max(moved, object.transform.x - from);
        durability = Math.min(durability, object.durability);
        return false;
      });
      return { moved, durability };
    };

    const byHeavy = push('heavy');
    const byCrawler = push('crawler');

    expect(byHeavy.moved).toBeGreaterThan(100);
    expect(byHeavy.durability).toBe(DEFAULT_MATERIAL_TABLE.colours.grey.outline.durability);
    expect(byCrawler.moved).toBeLessThan(10);
    expect(byCrawler.durability).toBeLessThan(
      DEFAULT_MATERIAL_TABLE.colours.grey.outline.durability,
    );
  });

  it('lets glue slow a Runner or a Crawler more than a Heavy', () => {
    /** How much longer it takes to cross 400 px of a green floor than of a grey one. */
    const slowedBy = (type: 'crawler' | 'runner' | 'heavy') => {
      const crossing = (colour: Colour) => {
        const world = createWorld();
        floorLine(world, 100, 600, colour);
        world.spawn(type);
        let from: number | null = null;
        stepUntil(world, 40, () => {
          const { x } = onlyEnemy(world).transform;
          if (from === null && x > 200) from = world.time;
          return x > 600;
        });
        return world.time - from!;
      };
      return crossing('green') / crossing('grey');
    };

    const heavy = slowedBy('heavy');
    expect(slowedBy('crawler')).toBeGreaterThan(heavy);
    expect(slowedBy('runner')).toBeGreaterThan(heavy);
  });

  it('throws a Runner off a blue Line harder than a Crawler', () => {
    /** Its fastest speed back, away from a blue wall it walks into. */
    const thrownBack = (type: 'crawler' | 'runner') => {
      const world = createWorld();
      drawLine(
        world,
        [
          { x: 300, y: GROUND_Y - 4 },
          { x: 300, y: GROUND_Y - 120 },
        ],
        'blue',
      );
      world.spawn(type);
      let slowest = 0;
      stepUntil(world, 12, () => {
        slowest = Math.min(slowest, onlyEnemy(world).velocity.x);
        return false;
      });
      return -slowest;
    };

    expect(thrownBack('runner')).toBeGreaterThan(thrownBack('crawler') + 30);
  });

  it('lets a Heavy reaching the Ink Core take 3 HP', () => {
    const world = createWorld();
    const { minX, maxY } = SANDBOX_ARENA.core;
    world.spawn('heavy', { x: minX - 100, y: maxY - HEAVY.height / 2 });

    const reached = stepUntil(world, 10, () => world.enemies.length === 0);

    expect(reached).toBe(true);
    expect(world.inkCore.hp).toBe(10 - 3);
  });
});

describe('The Ink Core destroyed', () => {
  /** A world whose Ink Core has 2 HP, with two Crawlers walking into it on the plateau. */
  function twoAtTheCore(): SandboxWorld {
    const enemies = createEnemyTable();
    enemies.coreHp = 2;
    const world = createWorld({ enemies });
    const { minX, maxY } = SANDBOX_ARENA.core;
    world.spawn('crawler', { x: minX - 150, y: maxY - CRAWLER.height / 2 });
    world.spawn('crawler', { x: minX - 60, y: maxY - CRAWLER.height / 2 });
    return world;
  }

  it('lets R start over: the Ink Core whole and the Crawlers back, and a retry plays out the same', () => {
    const world = twoAtTheCore();
    world.togglePause(); // the snapshot
    const started = world.enemies;
    stepUntil(world, 10, () => world.inkCore.hp === 0);
    const time = world.time;

    world.reset();
    expect(world.inkCore.hp).toBe(2);
    expect(world.enemies).toEqual(started);
    world.togglePause();
    stepUntil(world, 10, () => world.inkCore.hp === 0);

    expect(world.time).toBe(time);
  });
});

describe('From a Spawn on the right', () => {
  /** The sandbox Arena mirrored: the Spawn beyond the right edge, the Ink Core on the left. */
  const MIRRORED = mirrored(SANDBOX_ARENA);
  const WIDTH = MIRRORED.width;

  it('sends a Crawler in beyond the right edge, which walks in from the right and reaches the Ink Core', () => {
    const world = createWorld({ arena: MIRRORED });
    const heard = hear(world);
    const id = world.spawn('crawler');
    expect(onlyEnemy(world).transform.x - CRAWLER.width / 2).toBeGreaterThan(WIDTH); // out of view
    let slowest = 0;

    const reached = stepUntil(world, 45, () => {
      const crawler = world.enemies[0];
      if (!crawler) return true;
      slowest = Math.min(slowest, crawler.velocity.x);
      return false;
    });

    expect(reached).toBe(true);
    expect(slowest).toBeCloseTo(-CRAWLER.walkingSpeed, 0);
    expect(world.inkCore).toMatchObject({ hp: 9, fullHp: 10 });
    expect(wentOf(heard())).toEqual([`enemy ${id} reached`]);
  });

  it('removes an Object pushed wholly out over the right edge', () => {
    const world = createWorld({ arena: MIRRORED });
    const heard = hear(world);
    const box = drawObject(world, dragBox(WIDTH - 80, GROUND_Y - 41, 40, 40));
    runFor(world, 0.1);

    world.release(box, { x: 800, y: 0 });
    runFor(world, 1);

    expect(world.objects).toEqual([]);
    expect(wentOf(heard())).toEqual([`object ${box} left`]);
  });

  it('cuts a Stroke that runs past the right edge there, and refuses an Object past it', () => {
    const world = createWorld({ arena: MIRRORED });

    drawLine(world, [
      { x: WIDTH - 300, y: 500 },
      { x: WIDTH + 150, y: 500 },
    ]);
    const outcome = world.submitStroke(dragBox(WIDTH - 30, 400, 60, 60), 'grey');

    const xs = worldSegments(world.lines[0]!).flatMap(({ a, b }) => [a.x, b.x]);
    expect(Math.max(...xs)).toBeCloseTo(WIDTH, 6);
    expect(outcome.kind).toBe('rejected');
  });
});

/** The sandbox Arena with a Pit: a gap in the ground from x 400 to 520, open to the bottom. */
const PIT_ARENA: Arena = { ...SANDBOX_ARENA, terrain: sandboxTerrainWithPit(400, 520) };
