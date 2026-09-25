import { afterEach, describe, expect, it } from 'vitest';
import type { Polygon } from '../geometry/polygon';
import { createPhysicsWorld, type PhysicsWorld, type StepReport } from '.';

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.destroy();
});

const DEAD: { friction: number; restitution: number } = { friction: 0.6, restitution: 0 };
const GROUND: Polygon = [
  { x: 0, y: 500 },
  { x: 1000, y: 500 },
  { x: 1000, y: 600 },
  { x: 0, y: 600 },
];
const square = (half: number): Polygon => [
  { x: -half, y: -half },
  { x: half, y: -half },
  { x: half, y: half },
  { x: -half, y: half },
];

function createWorld(): PhysicsWorld {
  const world = createPhysicsWorld({
    gravity: { x: 0, y: 1000 },
    timeStep: 1 / 60,
    wakeSpeed: 80,
    minBounceSpeed: 50,
  });
  worlds.push(world);
  return world;
}

/** Steps until a report has hits; returns it. */
function stepUntilHit(world: PhysicsWorld): StepReport {
  for (let step = 0; step < 300; step++) {
    const report = world.step();
    if (report.hits.length > 0) return report;
  }
  throw new Error('nothing hit');
}

describe('Physics step reports', () => {
  it('reports a landing with the impulse that stopped it: mass × approach speed', () => {
    const world = createWorld();
    const ground = world.addTerrain([GROUND], DEAD);
    const box = world.addObject({
      position: { x: 500, y: 470 },
      parts: [square(20)],
      frozen: false,
      surface: DEAD,
      mass: 2,
      velocity: { x: 0, y: 600 },
    });

    const [hit] = stepUntilHit(world).hits;

    expect(new Set([hit!.bodyA, hit!.bodyB])).toEqual(new Set([ground, box]));
    expect(hit!.shapeA).not.toBe(hit!.shapeB);
    expect(hit!.speed).toBeGreaterThan(600);
    expect(hit!.impulse / hit!.speed).toBeCloseTo(2, 1);
    expect(Math.abs(hit!.normal.y)).toBeCloseTo(1, 5);
  });

  it('doubles the impulse of a full bounce', () => {
    function impulse(restitution: number): number {
      const world = createWorld();
      world.addTerrain([GROUND], { friction: 0.6, restitution });
      world.addObject({
        position: { x: 500, y: 470 },
        parts: [square(20)],
        frozen: false,
        surface: DEAD,
        mass: 2,
        velocity: { x: 0, y: 600 },
      });
      const [hit] = stepUntilHit(world).hits;
      return hit!.impulse / hit!.speed;
    }

    expect(impulse(0.9) / impulse(0)).toBeCloseTo(1.9, 1);
  });

  it('counts a Frozen Object the hit does not wake as immovable, and one it wakes by its mass', () => {
    function hitOnFrozen(mass: number) {
      const world = createWorld();
      world.addObject({
        position: { x: 500, y: 300 },
        parts: [square(20)],
        frozen: true,
        surface: DEAD,
        mass,
      });
      world.addObject({
        position: { x: 500, y: 250 },
        parts: [square(10)],
        frozen: false,
        surface: DEAD,
        mass: 1,
        velocity: { x: 0, y: 400 },
      });
      const [hit] = stepUntilHit(world).hits;
      return { ratio: hit!.impulse / hit!.speed };
    }
    const heavy = hitOnFrozen(1000); // doesn't wake: a wall
    const light = hitOnFrozen(1); // wakes: two equal masses share the hit

    expect(heavy.ratio).toBeCloseTo(1, 1);
    expect(light.ratio).toBeCloseTo(0.5, 1);
  });

  it('reports contacts beginning and ending per shape, and which are touching', () => {
    const world = createWorld();
    world.addTerrain([GROUND], DEAD);
    const box = world.addObject({
      position: { x: 500, y: 470 },
      parts: [square(20)],
      frozen: false,
      surface: DEAD,
      mass: 1,
    });

    const begins = [];
    for (let step = 0; step < 60; step++) begins.push(...world.step().begins);
    expect(begins).toHaveLength(1);
    expect(world.touchingPairs()).toEqual(begins);

    world.removeBody(box);
    const { ends } = world.step();
    expect(ends).toEqual(begins);
    expect(world.touchingPairs()).toEqual([]);
  });

  it('keeps shape ids and contacts when a Frozen Object is released', () => {
    const world = createWorld();
    world.addTerrain([GROUND], DEAD);
    const resting = world.addObject({
      position: { x: 300, y: 470 },
      parts: [square(20)],
      frozen: false,
      surface: DEAD,
      mass: 1,
    });
    const pinned = world.addObject({
      position: { x: 500, y: 400 },
      parts: [square(20)],
      frozen: true,
      surface: DEAD,
      mass: 1,
    });
    for (let step = 0; step < 30; step++) world.step();
    const before = world.touchingPairs();

    world.release(pinned);
    const reports = Array.from({ length: 5 }, () => world.step());

    // The resting box's contact carries on; the released one hasn't landed yet.
    expect(reports.flatMap((r) => [...r.begins, ...r.ends])).toEqual([]);
    expect(world.touchingPairs()).toEqual(before);
    expect(before.every((pair) => pair.bodyA === resting || pair.bodyB === resting)).toBe(true);
  });

  it('slides a moving Object through Lines, then restarts it from rest', () => {
    const world = createWorld();
    world.addLine([{ a: { x: 300, y: 300 }, b: { x: 700, y: 300 } }], 8, DEAD);
    const box = world.addObject({
      position: { x: 500, y: 300 },
      parts: [square(20)],
      frozen: false,
      surface: DEAD,
      mass: 1,
      velocity: { x: 100, y: 0 },
    });

    world.slideOut(box, { x: 0, y: -30 }, 250);
    expect(world.getSlide(box)!.y).toBeCloseTo(-30, 5);
    let steps = 0;
    while (world.getSlide(box) && steps < 20) {
      world.step();
      steps++;
    }

    expect(steps).toBe(9); // 30 px at 250 px/s is 7.2 steps; the next hands it back
    expect(world.getTransform(box).y).toBeCloseTo(270, 0);
    expect(world.getVelocity(box).x).toBe(0); // it lost its 100 px/s
  });
});

describe('Physics placement', () => {
  it('reports exactly the transform and velocity an Object was created with until it moves', () => {
    const world = createWorld();
    const placed = Array.from({ length: 50 }, (_, k) => ({
      position: { x: 100.1 + 17.3 * k, y: 200.7 + 3.1 * k },
      angle: -1.5 + 0.0613 * k,
      velocity: { x: 33.3 * k - 700, y: 12.7 * k },
    }));
    const bodies = placed.map((p) =>
      world.addObject({
        ...p,
        parts: [square(10)],
        frozen: false,
        surface: DEAD,
        mass: 1,
      }),
    );

    bodies.forEach((body, k) => {
      const { position, angle, velocity } = placed[k]!;
      expect(world.getTransform(body)).toEqual({ ...position, angle });
      expect(world.getVelocity(body)).toEqual(velocity);
    });

    world.step();
    expect(world.getTransform(bodies[1]!)).not.toEqual({
      ...placed[1]!.position,
      angle: placed[1]!.angle,
    });
  });
});
