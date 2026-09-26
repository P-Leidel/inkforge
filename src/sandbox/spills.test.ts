import { describe, expect, it } from 'vitest';
import { polygonContainsPoint } from '../geometry/polygon';
import type { Segment } from '../geometry/segment';
import { transformPoints } from '../geometry/transform';
import { rotate, sub } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { DEFAULT_MATERIAL_TABLE } from '../materials/material-table';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import { dragAlong, dragBox, dragCircle } from '../stroke/pointer-paths';
import type { PatchView, SandboxWorld } from './sandbox-world';
import {
  drawLine,
  drawObject,
  objectById,
  reboundHeight,
  runFor,
  sandboxWorlds,
} from './test-support';

const createWorld = sandboxWorlds();

const GROUND_Y = 880;

/**
 * A world whose blue-outlined Objects break at their first touch, and whose
 * Spills fall straight out (no kick) unless `kick` is set, so each test
 * spills where it wants to.
 */
function spillWorld(kick = false): SandboxWorld {
  const world = createWorld();
  const { blue, green } = world.materials.colours;
  blue.outline.durability = 1;
  blue.outline.damageThreshold = 0;
  if (!kick) {
    blue.fill.kickSpeed = 0;
    green.fill.kickSpeed = 0;
  }
  return world;
}

/**
 * A blue-outlined box of `size` filled with `fill`, centred on x with its
 * bottom at `bottom`: released, it breaks on the first thing it touches.
 */
function spillBox(world: SandboxWorld, x: number, bottom: number, fill: Colour, size = 60): number {
  const box = drawObject(world, dragBox(x - size / 2, bottom - size, size, size), 'blue');
  world.fillAt({ x, y: bottom - size / 2 }, fill);
  return box;
}

/** Starts physics if paused, lets the boxes go and runs until every Droplet has landed. */
function spill(world: SandboxWorld, boxes: readonly number[], seconds = 2): void {
  if (!world.isRunning) world.togglePause();
  for (const box of boxes) world.release(box);
  runFor(world, seconds);
}

const middle = ({ a, b }: Segment) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const lengthOf = ({ a, b }: Segment) => Math.hypot(b.x - a.x, b.y - a.y);
/** Whether a Patch lies flat at `y`, give or take how exactly a drawn box's edge lies there. */
const flatAt = (y: number) => (patch: PatchView) =>
  Math.abs(patch.segment.a.y - y) < 0.05 && Math.abs(patch.segment.b.y - y) < 0.05;

describe('Spills', () => {
  it('throw out 10–15 Droplets from inside a broken blue- or green-filled Object, faster than Rubble', () => {
    for (const fill of ['blue', 'green'] as const) {
      const world = spillWorld(true);
      // A Frozen box broken where it hangs, by a ball dropped on it from just above.
      const box = spillBox(world, 500, 500, fill);
      const outline = objectById(world, box).outline;
      const { transform } = objectById(world, box);
      const ball = drawObject(world, dragCircle({ x: 500, y: 418 }, 20));
      world.togglePause();
      world.release(ball);
      while (world.objects.some((o) => o.id === box)) world.step();

      expect(world.droplets.length).toBeGreaterThanOrEqual(10);
      expect(world.droplets.length).toBeLessThanOrEqual(15);
      const kick = DEFAULT_MATERIAL_TABLE.colours[fill].fill.kickSpeed;
      for (const droplet of world.droplets) {
        const { x, y } = droplet.transform;
        expect(polygonContainsPoint(transformPoints(outline, transform), { x, y })).toBe(true);
        expect(droplet.colour).toBe(fill);
        expect(Math.hypot(droplet.velocity.x, droplet.velocity.y)).toBeCloseTo(kick, 6);
      }
      expect(world.rubble).toHaveLength(0);
    }
    const { colours } = DEFAULT_MATERIAL_TABLE;
    const rubbleKick = Math.max(colours.grey.fill.kickSpeed, colours.black.fill.kickSpeed);
    expect(Math.min(colours.blue.fill.kickSpeed, colours.green.fill.kickSpeed)).toBeGreaterThan(
      rubbleKick,
    );
  });

  it('leave a Patch where each Droplet lands, sharing a length that grows with the Fill', () => {
    const lengths = [60, 100].map((size) => {
      const world = spillWorld();
      spill(world, [spillBox(world, 500, GROUND_Y - 10, 'blue', size)]);

      expect(world.droplets).toHaveLength(0);
      expect(world.patches.length).toBeGreaterThanOrEqual(10);
      for (const patch of world.patches) {
        expect(patch.colour).toBe('blue');
        expect(flatAt(GROUND_Y)(patch)).toBe(true); // on the ground, under the box
        expect(Math.abs(middle(patch.segment).x - 500)).toBeLessThan(size / 2 + 1);
      }
      return world.patches.reduce((sum, patch) => sum + lengthOf(patch.segment), 0);
    });

    expect(lengths[0]).toBeCloseTo(DEFAULT_MATERIAL_TABLE.patchLengthPerArea * 60 * 60, 0);
    expect(lengths[1]).toBeGreaterThan(2.5 * lengths[0]!);
  });

  it('land on a Line’s Piece, an Object and Rubble, and lie on their surfaces', () => {
    const world = spillWorld();
    drawLine(
      world,
      [
        { x: 150, y: 600 },
        { x: 350, y: 600 },
      ],
      'grey',
    );
    const onLine = spillBox(world, 250, 590, 'blue');
    drawObject(world, dragBox(700, 600, 120, 60), 'grey'); // Frozen, and too heavy to wake
    world.fillAt({ x: 760, y: 630 }, 'black');
    const onObject = spillBox(world, 760, 590, 'green');
    // A grey-filled box breaks into a pile of pebbles on the ground first.
    const pebbles = spillBox(world, 1200, GROUND_Y - 10, 'grey', 80);
    world.togglePause();
    world.release(pebbles);
    runFor(world, 2);
    const onRubble = spillBox(world, 1200, 700, 'blue');
    spill(world, [onLine, onObject, onRubble]);

    const near = (x: number) => world.patches.filter((p) => Math.abs(middle(p.segment).x - x) < 60);
    expect(near(250).length).toBeGreaterThan(0);
    for (const patch of near(250)) expect(flatAt(600 - LINE_THICKNESS / 2)(patch)).toBe(true);
    expect(near(760).length).toBeGreaterThan(0);
    for (const patch of near(760)) expect(flatAt(600)(patch)).toBe(true);
    const onPebbles = world.patches.filter((patch) =>
      world.rubble.some((pebble) => {
        const { x, y } = middle(patch.segment);
        const d = Math.hypot(x - pebble.transform.x, y - pebble.transform.y);
        return Math.abs(d - pebble.radius) < 1;
      }),
    );
    expect(onPebbles.length).toBeGreaterThan(0);
  });
});

describe('Patches', () => {
  /** A blue Spill laid on the ground around x = 500. */
  function blueGround(): SandboxWorld {
    const world = spillWorld();
    spill(world, [spillBox(world, 500, GROUND_Y - 10, 'blue', 80)]);
    return world;
  }

  it('bounce a ball off a blue Patch on the ground, and wear by the bounce', () => {
    const world = blueGround();
    const onPatch = drawObject(world, dragCircle({ x: 500, y: 600 }, 20));
    const onGround = drawObject(world, dragCircle({ x: 250, y: 600 }, 20));
    const worn = () => world.patches.reduce((sum, patch) => sum + patch.wear, 0);
    expect(worn()).toBe(0);

    world.release(onPatch);
    world.release(onGround);
    const bouncy = reboundHeight(world, onPatch);
    const dead = reboundHeight(world, onGround);

    expect(bouncy).toBeGreaterThan(100);
    expect(dead).toBeLessThan(0.1 * bouncy);
    expect(worn()).toBeGreaterThan(0);
  });

  it('vanish in a puff of Debris once used up', () => {
    const world = blueGround();
    world.materials.patchCapacity = 10;
    const count = world.patches.length;
    const ball = drawObject(world, dragCircle({ x: 500, y: 600 }, 20));
    world.fillAt({ x: 500, y: 600 }, 'black');
    world.release(ball);
    runFor(world, 1);

    expect(world.patches.length).toBeLessThan(count);
    expect(world.debrisParticles.some((p) => p.colour === 'blue')).toBe(true);
  });

  it('slow a ball rolling over green, and wear as they work', () => {
    const world = spillWorld();
    spill(world, [spillBox(world, 500, GROUND_Y - 10, 'green', 160)]);
    const onGreen = drawObject(world, dragCircle({ x: 330, y: GROUND_Y - 22 }, 20));
    const onGround = drawObject(world, dragCircle({ x: 1130, y: GROUND_Y - 22 }, 20));
    world.release(onGreen, { x: 400, y: 0 });
    world.release(onGround, { x: 400, y: 0 });

    runFor(world, 0.6);

    const speed = (id: number) => objectById(world, id).velocity.x;
    expect(speed(onGreen)).toBeLessThan(0.5 * speed(onGround));
    expect(world.patches.some((patch) => patch.wear > 0)).toBe(true);
  });

  it('move with their host and last through a Frozen host waking, without weighing it', () => {
    const world = spillWorld();
    const host = drawObject(world, dragBox(400, 500, 200, 40), 'grey');
    const mass = objectById(world, host).mass;
    spill(world, [spillBox(world, 500, 498, 'blue')]);
    /** Where each Patch is on the host, in the host's own coordinates. */
    const onHost = () => {
      const { x, y, angle } = objectById(world, host).transform;
      return world.patches.map((patch) => rotate(sub(middle(patch.segment), { x, y }), -angle));
    };
    const before = onHost();
    expect(before.length).toBeGreaterThan(0);
    expect(objectById(world, host).frozen).toBe(true);
    expect(objectById(world, host).mass).toBe(mass);

    world.release(host);
    runFor(world, 1.5);

    expect(objectById(world, host).transform.y).toBeGreaterThan(800); // fell to the ground
    expect(objectById(world, host).mass).toBe(mass);
    const after = onHost();
    expect(after).toHaveLength(before.length);
    after.forEach((p, k) => {
      expect(p.x).toBeCloseTo(before[k]!.x, 6);
      expect(p.y).toBeCloseTo(before[k]!.y, 6);
    });
  });

  it('pass hits on to their host, which takes damage by the normal rule', () => {
    const world = spillWorld();
    world.materials.colours.grey.outline.damageThreshold = 50;
    // Too heavy for the ball to wake.
    const host = drawObject(world, dragBox(400, 500, 200, 40), 'grey');
    world.fillAt({ x: 500, y: 520 }, 'black');
    spill(world, [spillBox(world, 500, 498, 'blue')]);
    const durability = objectById(world, host).durability;
    const ball = drawObject(world, dragCircle({ x: 500, y: 300 }, 20));
    world.release(ball);

    const height = reboundHeight(world, ball);

    expect(height).toBeGreaterThan(100); // a grey ball bounces off blue
    expect(objectById(world, host).durability).toBeLessThan(durability);
    expect(objectById(world, host).frozen).toBe(true);
  });

  it('go with their host when it breaks or is undone, and stay on the rest', () => {
    const world = spillWorld();
    const line = drawLine(
      world,
      [
        { x: 350, y: 700 },
        { x: 650, y: 700 },
      ],
      'grey',
    );
    const shelf = drawObject(world, dragBox(1000, 700, 200, 40), 'grey');
    spill(world, [
      spillBox(world, 500, 690, 'blue', 160),
      spillBox(world, 1100, 690, 'green', 100),
      spillBox(world, 200, GROUND_Y - 10, 'blue'),
    ]);
    const on = (x1: number, x2: number) =>
      world.patches.filter((p) => middle(p.segment).x > x1 && middle(p.segment).x < x2).length;
    expect(on(350, 650)).toBeGreaterThan(0);
    expect(on(1000, 1200)).toBeGreaterThan(0);
    const onGround = on(100, 300);
    expect(onGround).toBeGreaterThan(0);

    // The shelf breaks under a boulder; the Line is undone.
    world.materials.colours.grey.outline.durability = 1;
    const boulder = drawObject(world, dragBox(1080, 560, 40, 40), 'black');
    world.release(boulder);
    runFor(world, 0.5);
    expect(world.objects.some((o) => o.id === shelf)).toBe(false);
    expect(on(1000, 1200)).toBe(0);
    world.undo(); // the boulder
    world.undo(); // the Line
    expect(world.lines.some((l) => l.id === line)).toBe(false);
    expect(on(350, 650)).toBe(0);
    expect(on(100, 300)).toBe(onGround);
  });

  it('are capped: over the cap, the oldest go first', () => {
    const world = spillWorld();
    world.materials.patchCap = 5;
    spill(world, [spillBox(world, 500, GROUND_Y - 10, 'blue')]);

    expect(world.patches).toHaveLength(5);
    const ids = world.patches.map((patch) => patch.id);
    const last = Math.max(...ids);
    expect(ids).toEqual([last - 4, last - 3, last - 2, last - 1, last]);
  });
});

describe('Droplets', () => {
  it('never damage or wake a Frozen Object, however hard they hit it', () => {
    const world = spillWorld(true);
    const { grey, blue } = world.materials.colours;
    grey.outline.durability = 1;
    grey.outline.damageThreshold = 0;
    blue.fill.kickSpeed = 1500;
    world.materials.dropletMass = 50;
    const target = drawObject(world, dragBox(350, 600, 300, 40), 'grey');
    drawLine(
      world,
      [
        { x: 490, y: 560 },
        { x: 510, y: 560 },
      ],
      'black',
    );
    spill(world, [spillBox(world, 500, 550, 'blue')], 1);

    const box = objectById(world, target);
    expect(box.frozen).toBe(true);
    expect(box.durability).toBe(1);
    expect(world.patches.filter(flatAt(600)).length).toBeGreaterThan(0);
  });

  it('don’t pass through a thin Line, however fast they fly', () => {
    const world = spillWorld(true);
    world.materials.colours.blue.fill.kickSpeed = 3000;
    // A thin cage of Lines around a shelf the box breaks on.
    const cage = [
      [
        { x: 300, y: 300 },
        { x: 700, y: 300 },
      ],
      [
        { x: 700, y: 300 },
        { x: 700, y: 700 },
      ],
      [
        { x: 700, y: 700 },
        { x: 300, y: 700 },
      ],
      [
        { x: 300, y: 700 },
        { x: 300, y: 300 },
      ],
    ];
    for (const side of cage) {
      const outcome = world.submitStroke(dragAlong(side), 'black', { lineThickness: 2 });
      expect(outcome.kind).toBe('line');
    }
    drawLine(
      world,
      [
        { x: 480, y: 560 },
        { x: 520, y: 560 },
      ],
      'black',
    );
    spill(world, [spillBox(world, 500, 550, 'blue')], 1);

    expect(world.droplets).toHaveLength(0);
    for (const patch of world.patches) {
      const { x, y } = middle(patch.segment);
      expect(x).toBeGreaterThan(295);
      expect(x).toBeLessThan(705);
      expect(y).toBeGreaterThan(295);
      expect(y).toBeLessThan(705);
    }
  });

  it('vanish when they leave the Arena', () => {
    const world = spillWorld(true);
    world.materials.colours.blue.fill.kickSpeed = 2000;
    const box = spillBox(world, 500, 90, 'blue');
    drawLine(
      world,
      [
        { x: 480, y: 100 },
        { x: 520, y: 100 },
      ],
      'black',
    );
    spill(world, [box], 0.3);

    expect(world.droplets.length + world.patches.length).toBeLessThan(10);
  });
});

describe('Spills and Reset', () => {
  it('bring back Droplets in flight and Patches, and play the same again', () => {
    const world = spillWorld(true);
    spill(
      world,
      [spillBox(world, 500, GROUND_Y - 200, 'blue'), spillBox(world, 900, 700, 'green')],
      0,
    );
    drawLine(
      world,
      [
        { x: 480, y: GROUND_Y - 190 },
        { x: 520, y: GROUND_Y - 190 },
      ],
      'black',
    );
    runFor(world, 0.35);
    expect(world.droplets.length).toBeGreaterThan(0);
    expect(world.patches.length).toBeGreaterThan(0);

    world.togglePause();
    world.togglePause(); // a snapshot mid-Spill
    const started = world.contents;
    runFor(world, 1.5);
    const played = world.contents;
    world.reset();
    expect(world.contents).toEqual(started);
    runFor(world, 1.5);

    // Ids aside: a Droplet or Patch made after the snapshot gets a new id each time.
    const withoutIds = <T extends { id: number }>(views: readonly T[]) =>
      views.map(({ id: _id, ...view }) => view);
    expect(withoutIds(world.contents.droplets)).toEqual(withoutIds(played.droplets));
    expect(withoutIds(world.contents.patches)).toEqual(withoutIds(played.patches));
  });

  it('don’t land a Droplet again that was already touching something at the snapshot', () => {
    const world = spillWorld();
    // A wide Frozen box squeezed sideways by a Line through its middle. A
    // green Spill rains on it as it slides: Droplets touching a Squeezed
    // Object don't land, so they ride it and rest on it once it stops.
    const box = drawObject(world, dragBox(300, 500, 400, 200), 'grey');
    drawLine(
      world,
      [
        { x: 490, y: 445 },
        { x: 510, y: 445 },
      ],
      'black',
    );
    const spiller = spillBox(world, 500, 440, 'green');
    drawLine(
      world,
      [
        { x: 500, y: 512 },
        { x: 500, y: 720 },
      ],
      'grey',
    );
    drawLine(
      world,
      [
        { x: 60, y: 706 },
        { x: 940, y: 706 },
      ],
      'black',
    );
    spill(world, [spiller], 1.2);
    const { transform } = objectById(world, box);
    expect(Math.abs(transform.x - 500)).toBeGreaterThan(200); // it slid off the Line
    const onBox = world.droplets.filter(
      (d) =>
        Math.abs(d.transform.x - transform.x) < 200 &&
        Math.abs(d.transform.y - (transform.y - 103)) < 1,
    );
    expect(onBox.length).toBeGreaterThan(0);
    const resting = world.droplets.length;

    world.togglePause();
    world.togglePause(); // the rebuilt engine finds the Droplets touching the box again
    for (let step = 0; step < 3; step++) world.step();

    expect(world.droplets).toHaveLength(resting);
  });

  it('are removed by Clear', () => {
    const world = spillWorld(true);
    spill(world, [spillBox(world, 500, GROUND_Y - 100, 'green')], 0);
    drawLine(
      world,
      [
        { x: 480, y: GROUND_Y - 90 },
        { x: 520, y: GROUND_Y - 90 },
      ],
      'black',
    );
    runFor(world, 0.3);
    expect(world.droplets.length + world.patches.length).toBeGreaterThan(0);

    world.clear();

    expect(world.droplets).toHaveLength(0);
    expect(world.patches).toHaveLength(0);
    expect(world.bodyCount).toBe(1); // the Terrain
  });
});
