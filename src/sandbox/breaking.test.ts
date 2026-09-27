import { describe, expect, it } from 'vitest';
import { capsuleOverlapsPolygon } from '../geometry/overlap';
import { transformPoints } from '../geometry/transform';
import { DEFAULT_MATERIAL_TABLE } from '../materials/material-table';
import { dragBox, dragCircle, dragPolygon } from '../stroke/pointer-paths';
import type { SandboxWorld } from './sandbox-world';
import {
  drawLine,
  drawObject,
  entriesOf,
  hear,
  objectById,
  runFor,
  sandboxWorlds,
} from './test-support';

const createWorld = sandboxWorlds();

const GREY_DURABILITY = DEFAULT_MATERIAL_TABLE.colours.grey.outline.durability;
const BLUE_DURABILITY = DEFAULT_MATERIAL_TABLE.colours.blue.outline.durability;

const exists = (world: SandboxWorld, id: number) => world.objects.some((o) => o.id === id);

/** Steps until the Object is gone; returns how many steps that took, or null. */
function stepsUntilBroken(world: SandboxWorld, id: number, maxSteps = 600): number | null {
  if (!world.isRunning) world.togglePause();
  for (let step = 1; step <= maxSteps; step++) {
    world.step();
    if (!exists(world, id)) return step;
  }
  return null;
}

/** A 40 × 160 box tilted 0.5 rad, so it lands on a corner and then slams flat. */
function tiltedBox(): ReturnType<typeof dragPolygon> {
  const c = Math.cos(0.5);
  const s = Math.sin(0.5);
  const corners = [
    [-20, -80],
    [20, -80],
    [20, 80],
    [-20, 80],
  ].map(([x, y]) => ({ x: 400 + x! * c - y! * s, y: 700 + x! * s + y! * c }));
  return dragPolygon(corners);
}

describe('Breaking', () => {
  it('a grey Object survives resting on the ground for 60 s', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(300, 819, 60, 60)); // 1 px above the ground
    world.fillAt({ x: 330, y: 849 }, 'grey');
    world.togglePause();
    world.release(box);

    runFor(world, 60);

    expect(objectById(world, box).durability).toBe(GREY_DURABILITY);
  });

  it('a grey Object is cracked by a hard landing and breaks on the next', () => {
    const world = createWorld();
    drawLine(
      world,
      [
        { x: 200, y: 700 },
        { x: 500, y: 700 },
      ],
      'blue', // a bouncy Line gives hard landings again and again
    );
    const box = drawObject(world, dragBox(320, 300, 60, 60));
    world.togglePause();
    world.release(box);

    runFor(world, 1); // it has landed once and is on its way back up

    const cracked = objectById(world, box);
    expect(cracked.durability).toBeLessThan(GREY_DURABILITY);
    expect(cracked.wear).toBeGreaterThan(0.25);
    const heard = hear(world);
    expect(stepsUntilBroken(world, box)).not.toBeNull();
    expect(entriesOf(heard(), 'burst')).toHaveLength(1);
  });

  it('bursts into Debris from where it broke, and adds no body', () => {
    const world = createWorld();
    const ball = drawObject(world, dragCircle({ x: 300, y: 300 }, 20), 'red');
    world.togglePause();
    world.release(ball);
    const heard = hear(world);
    let last = objectById(world, ball);
    while (world.objects.some((o) => o.id === ball)) {
      last = objectById(world, ball);
      world.step();
    }
    const bodies = world.bodyCount;

    runFor(world, 0.5);

    expect(world.bodyCount).toBe(bodies);
    const [burst, ...more] = entriesOf(heard(), 'burst');
    expect(more).toEqual([]);
    expect(burst!.colours).toEqual(['red']);
    // Around the ball as it broke: within a step's fall of where it was the step before.
    const xs = burst!.outline.map((p) => p.x);
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - last.transform.x)).toBeLessThan(3);
  });

  it('a blue Object breaks on its third impact, before its durability runs out', () => {
    const world = createWorld();
    const ball = drawObject(world, dragCircle({ x: 300, y: 300 }, 20), 'blue');
    world.togglePause();
    world.release(ball);

    const seen: number[] = [];
    let durability = BLUE_DURABILITY;
    for (let step = 0; step < 900 && exists(world, ball); step++) {
      const { impacts, durability: left } = objectById(world, ball);
      if (seen[seen.length - 1] !== impacts) seen.push(impacts);
      durability = left;
      world.step();
    }

    expect(exists(world, ball)).toBe(false);
    expect(seen).toEqual([0, 1, 2]);
    expect(durability).toBeGreaterThan(0);
  });

  it('a Frozen Object takes damage without moving', () => {
    const world = createWorld();
    // A black-filled box is too heavy for the ball to wake, not to crack.
    const box = drawObject(world, dragBox(500, 540, 60, 60));
    world.fillAt({ x: 530, y: 570 }, 'black');
    const ball = drawObject(world, dragCircle({ x: 420, y: 566 }, 20));
    const before = objectById(world, box).transform;
    world.togglePause();
    world.release(ball, { x: 900, y: 0 });

    runFor(world, 0.5);

    const after = objectById(world, box);
    expect(after.frozen).toBe(true);
    expect(after.transform).toEqual(before);
    expect(after.durability).toBeLessThan(GREY_DURABILITY);
  });

  it('a Frozen Object can break without moving', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(500, 540, 60, 60), 'red');
    world.fillAt({ x: 530, y: 570 }, 'black');
    const ball = drawObject(world, dragCircle({ x: 420, y: 566 }, 20));
    world.togglePause();
    world.release(ball, { x: 900, y: 0 });

    expect(stepsUntilBroken(world, box, 30)).not.toBeNull();
  });

  it('contacts touching when physics starts deal no damage until they separate', () => {
    /** The tall box's durability after 2 s, pausing and starting again after `pauseAt` steps. */
    function durabilityAfterTipping(pauseAt: number | null): number {
      const world = createWorld();
      const box = drawObject(world, tiltedBox());
      world.togglePause();
      world.release(box);
      for (let step = 0; step < 120; step++) {
        if (step === pauseAt) {
          world.togglePause();
          world.togglePause();
        }
        world.step();
      }
      return objectById(world, box).durability;
    }
    // It lands on a corner at step 27 and slams flat, still touching, a little later.
    const corner = durabilityAfterTipping(30);
    const slam = durabilityAfterTipping(null);

    expect(corner).toBeLessThan(GREY_DURABILITY);
    expect(slam).toBeLessThan(corner);
  });

  it('R and Space replay a start with contacts touching the same way', () => {
    const world = createWorld();
    const box = drawObject(world, tiltedBox());
    world.togglePause();
    world.release(box);
    runFor(world, 0.5);
    world.togglePause();
    world.togglePause(); // the snapshot: landed on a corner, touching the ground
    runFor(world, 1.5);
    const first = objectById(world, box).durability;

    world.reset();
    world.togglePause();
    runFor(world, 1.5);

    expect(first).toBeLessThan(GREY_DURABILITY);
    expect(objectById(world, box).durability).toBe(first);
  });
});

describe('Squeezing', () => {
  function overlapsAnyLine(world: SandboxWorld, id: number): boolean {
    const object = objectById(world, id);
    return world.lines.some((line) =>
      line.segments.some((s) =>
        object.parts.some((part) =>
          capsuleOverlapsPolygon(
            s.a,
            s.b,
            line.thickness / 2 - 1, // resting on a Line isn't overlapping it
            transformPoints(part, object.transform),
          ),
        ),
      ),
    );
  }

  it('squeezes a moving Object off a Line drawn through it, without jamming or damage', () => {
    const world = createWorld();
    const box = drawObject(world, dragPolygon(lShape(360, 300)));
    world.togglePause();
    world.release(box);
    runFor(world, 0.3); // falling
    const { y } = objectById(world, box).transform;

    drawLine(world, [
      { x: 250, y: y + 10 },
      { x: 550, y: y + 10 },
    ]);
    runFor(world, 3);

    const object = objectById(world, box);
    expect(overlapsAnyLine(world, box)).toBe(false);
    expect(Math.abs(object.transform.x - 400)).toBeLessThan(150);
    expect(Math.hypot(object.velocity.x, object.velocity.y)).toBeLessThan(5); // at rest, not jammed
    expect(object.durability).toBe(GREY_DURABILITY);
  });

  it('leaves an Object resting on a Line alone when physics starts again', () => {
    const world = createWorld();
    drawLine(world, [
      { x: 250, y: 500 },
      { x: 550, y: 500 },
    ]);
    const ball = drawObject(world, dragCircle({ x: 300, y: 474 }, 20));
    world.togglePause();
    world.release(ball, { x: 200, y: 0 });
    runFor(world, 0.5);
    const rolling = objectById(world, ball).velocity.x;
    expect(rolling).toBeGreaterThan(50);

    world.togglePause();
    world.togglePause();

    expect(objectById(world, ball).velocity.x).toBeCloseTo(rolling, 5);
  });
});

/** An L of two convex parts, 80 px tall, its top-left corner at (x, y). */
function lShape(x: number, y: number) {
  return [
    { x, y },
    { x: x + 30, y },
    { x: x + 30, y: y + 50 },
    { x: x + 80, y: y + 50 },
    { x: x + 80, y: y + 80 },
    { x, y: y + 80 },
  ];
}

describe('Taking back, Clear and Reset after breaking', () => {
  /** A box that stays whole, then a red ball filled grey that breaks when it lands. */
  function breakSomething(world: SandboxWorld) {
    const box = drawObject(world, dragBox(600, 819, 60, 60));
    const ball = drawObject(world, dragCircle({ x: 300, y: 300 }, 20), 'red');
    world.fillAt({ x: 300, y: 300 }, 'grey');
    world.togglePause();
    world.release(ball);
    expect(stepsUntilBroken(world, ball)).not.toBeNull();
    return { box, ball };
  }

  it('taking back a broken Object or its Fill finds it gone; one still there is taken back', () => {
    const world = createWorld();
    const { box, ball } = breakSomething(world);

    expect(world.removeFill(ball)).toEqual({ kind: 'gone', id: ball });
    expect(world.removeStroke(ball)).toEqual({ kind: 'gone', id: ball });
    expect(world.removeStroke(box)).toMatchObject({ kind: 'object', id: box });

    expect(exists(world, box)).toBe(false);
    expect(world.objects).toHaveLength(0);
  });

  it('Clear removes everything after things have broken, and starts over', () => {
    const world = createWorld();
    breakSomething(world);
    const heard = hear(world);

    world.clear();

    expect(world.objects).toHaveLength(0);
    expect(heard().map((entry) => entry.kind)).toEqual(['start-over']);
    expect(world.bodyCount).toBe(1); // the Terrain
  });

  it('Reset brings back what broke, and its damage and blue counter', () => {
    const world = createWorld();
    const ball = drawObject(world, dragCircle({ x: 300, y: 300 }, 20), 'blue');
    world.togglePause();
    world.release(ball);
    while (objectById(world, ball).impacts < 2) world.step();
    world.togglePause();
    world.togglePause(); // the snapshot: two impacts in
    const saved = objectById(world, ball);
    const steps = stepsUntilBroken(world, ball);
    expect(steps).not.toBeNull();
    const heard = hear(world);

    world.reset();

    const restored = objectById(world, ball);
    expect(restored.impacts).toBe(2);
    expect(restored.durability).toBe(saved.durability);
    // It starts over, and the ball comes back as added.
    expect(heard()).toMatchObject([
      { kind: 'start-over' },
      { kind: 'added', what: { thing: 'object', id: ball } },
    ]);
    expect(stepsUntilBroken(world, ball)).toBe(steps);
  });
});
