import { describe, expect, it } from 'vitest';
import { polygonContainsPoint } from '../geometry/polygon';
import { transformPoints } from '../geometry/transform';
import type { Colour } from '../materials/colour';
import { fillMass } from '../materials/mass';
import { createMaterialTable, DEFAULT_MATERIAL_TABLE } from '../materials/material-table';
import { dragBox, dragCircle } from '../stroke/pointer-paths';
import { STEP_SECONDS, type ObjectView, type RubbleView, type SandboxWorld } from './sandbox-world';
import {
  drawLine,
  drawObject,
  entriesOf,
  FIXED_BODIES,
  hear,
  objectById,
  runFor,
  sandboxWorlds,
  wentOf,
} from './test-support';

const createWorld = sandboxWorlds();

interface Smashable {
  /** Height of the anvil. */
  readonly anvilY?: number;
  /** How far the box falls onto it. */
  readonly drop?: number;
  readonly size?: number;
}

/**
 * A grey box filled with `fill` (or hollow), hanging over a short black Line,
 * an anvil, at x. Released, it falls onto the anvil and breaks, and its Fill
 * comes out on top of the anvil and spills over its sides. Neither red
 * explodes nor blue spills in it, so later Colour rules leave it alone.
 */
function smashable(
  world: SandboxWorld,
  x: number,
  fill: Colour | null,
  { anvilY = 500, drop = 250, size = 60 }: Smashable = {},
): number {
  drawLine(
    world,
    [
      { x: x - 20, y: anvilY },
      { x: x + 20, y: anvilY },
    ],
    'black',
  );
  const top = anvilY - 4 - drop - size;
  const box = drawObject(world, dragBox(x - size / 2, top, size, size), 'grey');
  if (fill) world.fillAt({ x, y: top + size / 2 }, fill);
  return box;
}

/** Releases the Objects and steps until they are all gone; returns each as it last was. */
function smash(world: SandboxWorld, ids: readonly number[]): ObjectView[] {
  if (!world.isRunning) world.togglePause();
  for (const id of ids) world.release(id);
  const last = new Map<number, ObjectView>();
  for (let step = 0; step < 600; step++) {
    const present = world.objects.filter((o) => ids.includes(o.id));
    if (present.length === 0) return ids.map((id) => last.get(id)!);
    for (const object of present) last.set(object.id, object);
    world.step();
  }
  throw new Error('not everything broke');
}

const totalMass = (rubble: readonly RubbleView[]) => rubble.reduce((sum, r) => sum + r.mass, 0);

/** Where the Rubble is, oldest first, rounded to 1e-6 px. */
const places = (world: SandboxWorld) =>
  world.rubble.map(({ id, transform: t }) => [id, t.x.toFixed(6), t.y.toFixed(6)]);

describe('Fill release: Rubble', () => {
  it("a broken grey-filled Object releases up to 18 pebbles with the Fill's total mass, in the same step", () => {
    const world = createWorld();
    const box = smashable(world, 500, 'grey');

    const [broken] = smash(world, [box]);

    const pebbles = world.rubble;
    expect(pebbles.length).toBeGreaterThanOrEqual(1);
    expect(pebbles.length).toBeLessThanOrEqual(18);
    expect(pebbles.every((p) => p.colour === 'grey')).toBe(true);
    expect(totalMass(pebbles)).toBeCloseTo(fillMass(broken!.outline, 'grey', world.materials), 9);
    // Out in the step it broke: still inside its Outline as it last was,
    // give or take one step's fall.
    const outline = transformPoints(broken!.outline, broken!.transform);
    for (const { transform } of pebbles) {
      const near = [-10, -5, 0, 5, 10].some((dy) =>
        polygonContainsPoint(outline, { x: transform.x, y: transform.y + dy }),
      );
      expect(near).toBe(true);
    }
  });

  it('flings Rubble outward from the centre at the Fill kick speed, within the spread', () => {
    const world = createWorld();
    // A Frozen black-filled blue box, too heavy for a bouncing ball to wake:
    // blue breaks on its third impact, so it breaks where it hangs, at rest,
    // and what moves its stones is the kick alone.
    const box = drawObject(world, dragBox(420, 400, 160, 40), 'blue');
    world.fillAt({ x: 500, y: 420 }, 'black');
    const ball = drawObject(world, dragCircle({ x: 500, y: 280 }, 20), 'grey');
    world.togglePause();
    world.release(ball);
    let last = objectById(world, box);
    for (let step = 0; step < 300 && world.objects.some((o) => o.id === box); step++) {
      last = objectById(world, box);
      world.step();
    }

    expect(last.frozen).toBe(true);
    expect(world.rubble.length).toBeGreaterThan(0);
    const { kickSpeed } = DEFAULT_MATERIAL_TABLE.colours.black.fill;
    for (const { transform, velocity } of world.rubble) {
      const out = { x: transform.x - last.transform.x, y: transform.y - last.transform.y };
      const turn = Math.atan2(
        out.x * velocity.y - out.y * velocity.x,
        out.x * velocity.x + out.y * velocity.y,
      );
      expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(kickSpeed, 6);
      expect(Math.abs(turn)).toBeLessThanOrEqual(DEFAULT_MATERIAL_TABLE.kickSpread + 1e-9);
    }
  });

  it('a black-filled Object releases at most 8 stones, each heavier than grey’s pebbles', () => {
    const world = createWorld();
    const grey = smashable(world, 400, 'grey');
    const black = smashable(world, 800, 'black');

    smash(world, [grey, black]);

    const pebbles = world.rubble.filter((r) => r.colour === 'grey');
    const stones = world.rubble.filter((r) => r.colour === 'black');
    expect(stones).toHaveLength(8); // a 60 px box is enough for all 8
    expect(pebbles.length).toBeGreaterThan(stones.length);
    expect(Math.min(...stones.map((s) => s.mass))).toBeGreaterThan(
      Math.max(...pebbles.map((p) => p.mass)),
    );
  });

  it('releases no Rubble from a hollow Object or a blue, green or red Fill', () => {
    const world = createWorld();
    const green = smashable(world, 200, 'green');
    const red = smashable(world, 450, 'red');
    const blue = smashable(world, 700, 'blue', { anvilY: 700, drop: 500 }); // lighter
    const hollow = drawObject(world, dragCircle({ x: 1250, y: 300 }, 20), 'blue'); // bounces thrice

    const heard = hear(world);
    smash(world, [green, red, blue, hollow]);

    expect(world.rubble).toHaveLength(0);
    expect(entriesOf(heard(), 'burst').length).toBeGreaterThanOrEqual(4);
    expect(entriesOf(heard(), 'added').some(({ what }) => what.thing === 'rubble')).toBe(false);
  });

  it('Rubble rolls and piles up, never breaks, and is not Frozen, filled or Released', () => {
    const materials = createMaterialTable();
    materials.rubbleLifetime = 60; // long enough to come to rest
    const world = createWorld({ materials });
    smash(world, [smashable(world, 500, 'black'), smashable(world, 700, 'grey')]);
    const released = world.rubble.map((r) => r.id);

    runFor(world, 10);

    expect(world.rubble.map((r) => r.id)).toEqual(released);
    const ground = world.arena.height - 1;
    for (const { transform, velocity, radius } of world.rubble) {
      expect(transform.y + radius).toBeLessThan(ground); // on the ground or on each other
      expect(Math.hypot(velocity.x, velocity.y)).toBeLessThan(5); // come to rest
    }
    const pebble = world.rubble[world.rubble.length - 1]!;
    const at = { x: pebble.transform.x, y: pebble.transform.y };
    expect(world.fillAt(at, 'grey')).toEqual({ kind: 'missed' });
    expect(world.releaseAt(at)).toBe(false);
  });

  it('deals damage by the normal rule: falling stones crack a grey Line', () => {
    const world = createWorld();
    const shelf = drawLine(
      world,
      [
        { x: 350, y: 750 },
        { x: 670, y: 750 },
      ],
      'grey',
    );
    smash(world, [smashable(world, 510, 'black')]);

    runFor(world, 2);

    // Nothing but the stones reached it.
    expect(world.objects).toHaveLength(0);
    const line = world.lines.find((l) => l.id === shelf)!;
    const whole = DEFAULT_MATERIAL_TABLE.colours.grey.line.durability;
    expect(line.pieces.some((p) => p.durability < whole)).toBe(true);
  });

  it('a pebble does not wake a Frozen black Object that a same-mass hit would', () => {
    function hitsFrozenBlack(dropped: 'pebbles' | 'same mass'): boolean {
      const world = createWorld();
      const target = drawObject(world, dragBox(470, 760, 80, 80), 'black');
      world.fillAt({ x: 510, y: 800 }, 'black');
      if (dropped === 'pebbles') {
        smash(world, [smashable(world, 510, 'grey')]);
      } else {
        // An Object as heavy as the target, released from where the pebbles are.
        const twin = drawObject(world, dragBox(470, 400, 80, 80), 'black');
        world.fillAt({ x: 510, y: 440 }, 'black');
        world.togglePause();
        world.release(twin);
      }
      let fastest = 0;
      for (let step = 0; step < 90; step++) {
        world.step();
        for (const { velocity } of world.rubble) fastest = Math.max(fastest, velocity.y);
      }
      if (dropped === 'pebbles') {
        expect(fastest).toBeGreaterThan(400);
        // Some came to rest on top of it: they hit it.
        const onTop = world.rubble.filter(
          ({ transform: t }) => t.y < 760 && t.x > 470 && t.x < 550,
        );
        expect(onTop.length).toBeGreaterThan(0);
      }
      return !objectById(world, target).frozen;
    }

    expect(hitsFrozenBlack('same mass')).toBe(true);
    expect(hitsFrozenBlack('pebbles')).toBe(false);
  });
});

describe('The Rubble cap', () => {
  it('keeps at most 150 Rubble by default', () => {
    expect(DEFAULT_MATERIAL_TABLE.rubbleCap).toBe(150);
  });

  it('removes the oldest Rubble when a release would go over it', () => {
    const materials = createMaterialTable();
    materials.rubbleCap = 20;
    const world = createWorld({ materials });
    // Dropped from high enough to break for certain.
    const first = smashable(world, 300, 'grey', { drop: 350 });
    const second = smashable(world, 700, 'grey', { drop: 350 });

    smash(world, [first]);
    const older = world.rubble.map((r) => r.id);
    const bodies = world.bodyCount;
    const heard = hear(world);
    smash(world, [second]);

    const kept = world.rubble.map((r) => r.id);
    expect(kept).toHaveLength(20);
    const newer = kept.filter((id) => !older.includes(id));
    // The oldest went first: what is left of the first release is its newest.
    expect(kept).toEqual([...older.slice(older.length - (20 - newer.length)), ...newer]);
    const gone = older.filter((id) => !kept.includes(id));
    // Capped, oldest first: the renderer fades it out where it was.
    expect(wentOf(heard()).filter((went) => went.startsWith('rubble'))).toEqual(
      gone.map((id) => `rubble ${id} capped`),
    );
    // The cap is a limit on bodies. (The second box broke too.)
    expect(world.bodyCount).toBe(bodies - 1 + newer.length - gone.length);
  });
});

describe('Rubble and the Sandbox controls', () => {
  it('refuses an Object drawn over Rubble, and shows it red while drawing', () => {
    const world = createWorld();
    smash(world, [smashable(world, 500, 'black')]);
    runFor(world, 3);
    const stone = world.rubble[0]!;
    const over = dragCircle({ x: stone.transform.x, y: stone.transform.y - 25 }, 25);

    expect(world.previewStroke(over)).toMatchObject({ kind: 'rejected', reason: 'overlaps' });
    expect(world.submitStroke(over, 'grey')).toMatchObject({
      kind: 'rejected',
      reason: 'overlaps',
    });
    const clear = dragCircle({ x: stone.transform.x, y: stone.transform.y - 200 }, 25);
    expect(world.submitStroke(clear, 'grey').kind).toBe('object');
  });

  it('taking back a Stroke leaves released Rubble in place, and Clear removes it', () => {
    const world = createWorld();
    const older = drawObject(world, dragBox(100, 100, 40, 40));
    smash(world, [smashable(world, 500, 'grey')]);
    const pebbles = world.rubble.length;

    world.removeStroke(older);

    expect(world.objects).toHaveLength(0);
    expect(world.rubble).toHaveLength(pebbles);

    world.clear();
    expect(world.rubble).toHaveLength(0);
    expect(world.bodyCount).toBe(FIXED_BODIES);
  });

  it('Reset brings back Rubble released before physics last started, where it was', () => {
    const world = createWorld();
    smash(world, [smashable(world, 500, 'grey')]);
    runFor(world, 0.3); // mid-flight
    world.togglePause();
    world.togglePause(); // the snapshot holds the Rubble in flight
    const snapped = places(world);
    runFor(world, 1);
    const first = places(world);

    world.reset();
    expect(places(world)).toEqual(snapped);
    runFor(world, 1);
    expect(places(world)).toEqual(first);
  });

  it('Reset takes back Rubble released since physics last started, and replays its release', () => {
    const world = createWorld();
    const box = smashable(world, 500, 'black');
    world.togglePause();
    world.release(box);
    world.togglePause();
    world.togglePause(); // the snapshot has the box falling
    runFor(world, 1.5);
    const first = world.rubble.map(({ colour, mass, transform }) => ({ colour, mass, transform }));
    expect(first.length).toBeGreaterThan(0);

    world.reset();
    expect(world.rubble).toHaveLength(0);
    expect(world.objects).toHaveLength(1);
    runFor(world, 1.5);

    expect(
      world.rubble.map(({ colour, mass, transform }) => ({ colour, mass, transform })),
    ).toEqual(first);
  });
});

describe("Rubble's lifetime", () => {
  /** Smashes a black-filled box and returns the world with its stones just released. */
  function released(materials = createMaterialTable()): SandboxWorld {
    const world = createWorld({ materials });
    smash(world, [smashable(world, 500, 'black')]);
    return world;
  }

  it('is 5 s by default', () => {
    expect(DEFAULT_MATERIAL_TABLE.rubbleLifetime).toBe(5);
  });

  it('despawns every piece quietly exactly its lifetime after its Object broke', () => {
    const world = released();
    const stones = world.rubble.map((r) => r.id);
    expect(stones.length).toBeGreaterThan(0);
    // Its age counts the step its Object broke in.
    for (const stone of world.rubble) expect(stone.remaining).toBeCloseTo(5 - STEP_SECONDS, 9);
    const heard = hear(world);

    const steps = Math.round(5 / STEP_SECONDS) - 1;
    for (let k = 0; k < steps - 1; k++) world.step();
    expect(world.rubble.map((r) => r.id)).toEqual(stones);
    for (const stone of world.rubble) expect(stone.remaining).toBeCloseTo(STEP_SECONDS, 9);
    expect(wentOf(heard())).toEqual([]);

    world.step();
    expect(world.rubble).toHaveLength(0);
    // Quietly: no Debris, nothing else went.
    expect(wentOf(heard())).toEqual(stones.map((id) => `rubble ${id} expired`));
    expect(entriesOf(heard(), 'burst')).toEqual([]);
  });

  it('despawns at rest as well as moving, after a lifetime set in the table', () => {
    const materials = createMaterialTable();
    materials.rubbleLifetime = 1;
    const world = released(materials);
    runFor(world, 0.9);
    expect(world.rubble.length).toBeGreaterThan(0);
    runFor(world, 0.1);
    expect(world.rubble).toHaveLength(0);
  });

  it('does not tick while paused', () => {
    const world = released();
    runFor(world, 1);
    const before = world.rubble.map((r) => r.remaining);
    world.pause();
    world.step();
    world.advance(10);
    expect(world.rubble.map((r) => r.remaining)).toEqual(before);
    world.resume();
    runFor(world, 3.9);
    expect(world.rubble.length).toBeGreaterThan(0);
  });

  it('is saved and restored with each piece: Reset replays its despawning exactly', () => {
    const world = released();
    runFor(world, 2);
    world.togglePause();
    world.togglePause(); // starts again: the snapshot holds the stones 2 s old
    const atStart = world.rubble.map(({ id, remaining }) => ({ id, remaining }));
    const heard = hear(world);
    let steps = 0;
    while (world.rubble.length > 0) {
      world.step();
      steps++;
    }
    const firstRun = wentOf(heard());

    world.reset();
    expect(world.rubble.map(({ id, remaining }) => ({ id, remaining }))).toEqual(atStart);
    world.togglePause();
    const again = hear(world);
    for (let k = 0; k < steps - 1; k++) world.step();
    expect(world.rubble.length).toBeGreaterThan(0);
    world.step();
    expect(world.rubble).toHaveLength(0);
    expect(wentOf(again()).filter((went) => went.endsWith('expired'))).toEqual(
      firstRun.filter((went) => went.endsWith('expired')),
    );
  });
});
