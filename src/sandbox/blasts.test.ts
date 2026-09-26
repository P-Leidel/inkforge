import { describe, expect, it } from 'vitest';
import { createMaterialTable, DEFAULT_MATERIAL_TABLE } from '../materials/material-table';
import { dragBox, dragCircle } from '../stroke/pointer-paths';
import { blastInk, blastSize, blastStrength } from './blasts';
import { MaterialRules, type Breakable } from './material-rules';
import type { SandboxWorld } from './sandbox-world';
import { drawLine, drawObject, objectById, runFor, sandboxWorlds } from './test-support';

const createWorld = sandboxWorlds();
const TABLE = DEFAULT_MATERIAL_TABLE;
const GREY_DURABILITY = TABLE.colours.grey.outline.durability;

describe('Blast size and falloff', () => {
  const size = { reach: 120, strength: 1000 };

  it('is full strength at the centre, a quarter at half its reach and nothing at its reach', () => {
    expect(blastStrength(size, 0)).toBe(1000);
    expect(blastStrength(size, 60)).toBe(250);
    expect(blastStrength(size, 90)).toBeCloseTo(62.5, 9);
    expect(blastStrength(size, 120)).toBe(0);
    expect(blastStrength(size, 500)).toBe(0);
  });

  it('grows with the square root of the red ink, clamped to a minimum and maximum', () => {
    const { blast } = TABLE;
    const at = (ink: number) => blastSize(ink, TABLE);

    expect(at(400)).toEqual({
      reach: blast.radiusPerRootInk * 20,
      strength: blast.strengthPerRootInk * 20,
    });
    expect(at(1600).reach).toBeCloseTo(2 * at(400).reach, 9);
    expect(at(1)).toEqual({ reach: blast.radiusMin, strength: blast.strengthMin });
    expect(at(1e7)).toEqual({ reach: blast.radiusMax, strength: blast.strengthMax });
  });

  it('counts red Outline ink by length × Line thickness and red Fill ink by area, as one Blast', () => {
    const outline = { length: 100 };
    const fill = { area: 2000 };

    expect(blastInk({ ...outline, colour: 'red' }, null, TABLE)).toBe(800);
    expect(blastInk({ ...outline, colour: 'red' }, { ...fill, colour: 'red' }, TABLE)).toBe(2800);
    expect(blastInk({ ...outline, colour: 'grey' }, { ...fill, colour: 'red' }, TABLE)).toBe(2000);
    expect(blastInk({ ...outline, colour: 'red' }, { ...fill, colour: 'grey' }, TABLE)).toBe(800);
    expect(blastInk({ ...outline, colour: 'grey' }, { ...fill, colour: 'blue' }, TABLE)).toBe(0);
  });
});

describe('Blast damage', () => {
  it('beats the receiver’s own threshold and never counts as an impact', () => {
    const table = createMaterialTable();
    const rules = new MaterialRules(table);
    const { damageThreshold } = table.colours.blue.outline;
    const blue: Breakable = { colour: 'blue', role: 'outline', damage: 0, impacts: 0 };

    expect(rules.applyBlast(blue, damageThreshold)).toBe(false);
    expect(blue.damage).toBe(0);
    for (let k = 0; k < 5; k++) rules.applyBlast(blue, damageThreshold + 100);

    expect(blue.damage).toBe(500);
    expect(blue.impacts).toBe(0);
  });
});

/** Ground level in the sandbox Arena. */
const GROUND = 880;

/**
 * Drops a red 40 px ball onto the ground at `x`, fast enough to explode as
 * it lands, within a step or two: its Blast starts at about (x, 860).
 */
function detonate(world: SandboxWorld, x: number): number {
  const bomb = drawObject(world, dragCircle({ x, y: GROUND - 23 }, 20), 'red');
  if (!world.isRunning) world.togglePause();
  world.release(bomb, { x: 0, y: 900 });
  return bomb;
}

/** A Frozen 40 px red ball resting just above the ground at `x`. */
const bombAt = (world: SandboxWorld, x: number) =>
  drawObject(world, dragCircle({ x, y: GROUND - 22 }, 20), 'red');

const exists = (world: SandboxWorld, id: number) => world.objects.some((o) => o.id === id);

describe('Blasts in the Sandbox world', () => {
  it('damage a weakly hit Frozen Object without moving it, and wake and push one hit strongly', () => {
    const world = createWorld();
    // Heavy, and near: 35 px from the Blast's centre. Hollow, and further: 60 px.
    const heavy = drawObject(world, dragBox(535, GROUND - 61, 60, 60));
    world.fillAt({ x: 565, y: GROUND - 31 }, 'black');
    const hollow = drawObject(world, dragBox(380, GROUND - 61, 60, 60));
    const before = objectById(world, heavy).transform;
    const hollowAt = objectById(world, hollow).transform;
    const bomb = detonate(world, 500);

    runFor(world, 0.2);

    expect(exists(world, bomb)).toBe(false);
    const struck = objectById(world, heavy);
    expect(struck.frozen).toBe(true);
    expect(struck.transform).toEqual(before);
    expect(struck.durability).toBeLessThan(GREY_DURABILITY);
    const pushed = objectById(world, hollow);
    expect(pushed.frozen).toBe(false);
    expect(pushed.velocity.x).toBeLessThan(-50); // away from the Blast
    expect(pushed.transform.x).toBeLessThan(hollowAt.x);
    expect(pushed.durability).toBe(GREY_DURABILITY); // too weak there to damage it
  });

  it('set off nearby red in a chain, through a Line, but not red beyond reach', () => {
    const world = createWorld();
    const chain = [300, 360, 420, 480].map((x) => bombAt(world, x));
    // A black Line between two bombs of the chain: Blasts pass through it.
    drawLine(
      world,
      [
        { x: 390, y: GROUND - 80 },
        { x: 390, y: GROUND - 2 },
      ],
      'black',
    );
    const beyond = bombAt(world, 640);
    detonate(world, 240);

    const brokeAt = new Map<number, number>();
    for (let step = 0; step < 120; step++) {
      world.step();
      for (const id of chain) if (!exists(world, id) && !brokeAt.has(id)) brokeAt.set(id, step);
    }

    const steps = chain.map((id) => brokeAt.get(id));
    expect(steps.every((step) => step !== undefined)).toBe(true);
    // Each goes off after the one before it: the ring takes time to travel.
    for (let k = 1; k < steps.length; k++) expect(steps[k]!).toBeGreaterThan(steps[k - 1]!);
    expect(objectById(world, beyond).durability).toBe(TABLE.colours.red.outline.durability);
    expect(objectById(world, beyond).frozen).toBe(true);
    expect(world.lines[0]!.pieces.length).toBeGreaterThan(0);
    expect(world.blasts).toHaveLength(0);
  });

  it('show the ring spreading at the table’s speed up to its reach', () => {
    const world = createWorld();
    detonate(world, 500);
    while (world.blasts.length === 0) world.step();
    const [start] = world.blasts;

    world.step();

    const [next] = world.blasts;
    expect(next!.radius - start!.radius).toBeCloseTo(TABLE.blast.speed / 60, 6);
    expect(next!.centre).toEqual(start!.centre);
    expect(next!.reach).toBeCloseTo(blastSize(20 * 2 * Math.PI * 8, TABLE).reach, -1);
  });

  it('throw a grey-filled bomb’s pebbles', () => {
    /** The fastest pebble 0.1 s after a grey-filled box of `colour` breaks on landing. */
    function fastestPebble(colour: 'red' | 'grey'): number {
      const world = createWorld();
      const box = drawObject(world, dragBox(470, GROUND - 63, 60, 60), colour);
      world.fillAt({ x: 500, y: GROUND - 33 }, 'grey');
      world.togglePause();
      // Fast enough to break even a grey box.
      world.release(box, { x: 0, y: 2000 });
      while (exists(world, box)) world.step();
      runFor(world, 0.1);
      const speeds = world.rubble.map((r) => Math.hypot(r.velocity.x, r.velocity.y));
      expect(speeds.length).toBeGreaterThan(5);
      return Math.max(...speeds);
    }

    const thrown = fastestPebble('red');
    const kicked = fastestPebble('grey');

    expect(thrown).toBeGreaterThan(2 * kicked);
    expect(thrown).toBeLessThanOrEqual(TABLE.blast.maxPushSpeed + 400); // kick, fall and push
  });

  it('leave Patches alone and the Terrain whole', () => {
    const world = createWorld();
    // A green-filled box breaks on landing and leaves Patches on the ground.
    const box = drawObject(world, dragBox(470, GROUND - 63, 60, 60));
    world.fillAt({ x: 500, y: GROUND - 33 }, 'green');
    world.togglePause();
    world.release(box, { x: 0, y: 2000 });
    runFor(world, 2);
    const patches = world.patches.length;
    expect(patches).toBeGreaterThan(0);

    detonate(world, 500);
    runFor(world, 0.5);

    expect(world.patches).toHaveLength(patches);
    expect(world.patches.every((p) => p.wear === 0)).toBe(true);
  });
});

describe('Blasts and Reset', () => {
  /** Everything in the Arena, ids left out: what a replay must play out the same. */
  function played(world: SandboxWorld): unknown {
    const strip = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(strip);
      if (typeof value !== 'object' || value === null) return value;
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => key !== 'id')
          .map(([key, field]) => [key, strip(field)]),
      );
    };
    return strip(world.contents);
  }

  /** A chain of red bombs, one grey-filled, among Frozen hollow boxes, set off by a dropped one. */
  function buildChain(world: SandboxWorld): void {
    for (const x of [300, 360, 420, 480, 540]) bombAt(world, x);
    world.fillAt({ x: 420, y: GROUND - 22 }, 'grey');
    for (const x of [600, 140]) drawObject(world, dragBox(x, GROUND - 61, 50, 60));
    drawObject(world, dragBox(400, 500, 60, 60));
    detonate(world, 240);
    world.togglePause();
    world.togglePause(); // R returns to the bomb dropping
  }

  it('a run, R and the same run again end identically', () => {
    const world = createWorld();
    buildChain(world);
    runFor(world, 2);
    const first = played(world);

    world.reset();
    runFor(world, 2);

    expect(played(world)).toEqual(first);
  });

  it('pausing mid-chain keeps the rings spreading and what they acted on, and R replays from there', () => {
    const world = createWorld();
    buildChain(world);
    while (world.blasts.length < 2 || world.blasts.every((b) => b.radius < 40)) world.step();
    world.togglePause();
    const paused = world.blasts;
    world.togglePause(); // a snapshot mid-chain
    expect(world.blasts).toEqual(paused);
    runFor(world, 2);
    const first = played(world);

    world.reset();
    expect(world.blasts).toEqual(paused);
    runFor(world, 2);

    expect(played(world)).toEqual(first);
  });

  it('Clear removes the rings', () => {
    const world = createWorld();
    detonate(world, 500);
    while (world.blasts.length === 0) world.step();

    world.clear();

    expect(world.blasts).toHaveLength(0);
    expect(world.contents.blasts).toHaveLength(0);
  });
});
