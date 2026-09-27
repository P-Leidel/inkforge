import { describe, expect, it } from 'vitest';
import type { Polygon } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { DEFAULT_ENEMY_TABLE, editEnemies } from '../materials/enemy-table';
import { DEFAULT_MATERIAL_TABLE } from '../materials/material-table';
import { dragBox, dragCircle } from '../stroke/pointer-paths';
import { SANDBOX_ARENA, type Arena } from './arena';
import { enemyOutline, walkingForce } from './enemies';
import type { EnemyView, SandboxWorld } from './sandbox-world';
import {
  drawLine,
  drawObject,
  entriesOf,
  hear,
  runFor,
  sandboxWorlds,
  wentOf,
} from './test-support';

const createWorld = sandboxWorlds();
const CRAWLER = DEFAULT_ENEMY_TABLE.types.crawler;
const GROUND_Y = SANDBOX_ARENA.spawn.y;

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

  it('collides with other Enemies: one behind another queues up', () => {
    const world = createWorld();
    ramp(world, 300, 60); // too steep: the first one stops at it
    world.spawn('crawler');
    runFor(world, 2);
    world.spawn('crawler');

    runFor(world, 14);

    const [first, second] = world.enemies;
    expect(first!.transform.x).toBeLessThan(300);
    expect(second!.transform.x).toBeLessThan(first!.transform.x - CRAWLER.width + 1);
    expect(second!.transform.x).toBeGreaterThan(first!.transform.x - CRAWLER.width - 2);
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

    const xs = world.lines[0]!.segments.flatMap(({ a, b }) => [a.x, b.x]);
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

  it('lets a queue of Crawlers standing on a grey bridge wear it through', () => {
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
    expect(went.filter((what) => what.startsWith(`piece ${bridge}.`))).toHaveLength(3);
    expect(went.filter((what) => what.endsWith(' died'))).toHaveLength(4);
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

/** The sandbox Arena with a Pit: a gap in the ground from x 400 to 520, open to the bottom. */
const PIT_ARENA: Arena = (() => {
  const box = (x1: number, y1: number, x2: number, y2: number): Polygon => [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
  const { height, spawn } = SANDBOX_ARENA;
  const [wall, rightWall, ground, ...rest] = SANDBOX_ARENA.terrain;
  const [left, top, right] = [ground![0]!.x, ground![0]!.y, ground![1]!.x];
  return {
    ...SANDBOX_ARENA,
    terrain: [
      wall!,
      rightWall!,
      box(left, top, 400, height),
      box(520, top, right, height),
      ...rest,
    ],
    spawn,
  };
})();
