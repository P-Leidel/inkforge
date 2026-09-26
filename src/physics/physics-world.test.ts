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

describe('Circle bodies', () => {
  const circle = (overrides: Partial<Parameters<PhysicsWorld['addCircle']>[0]> = {}) => ({
    position: { x: 500, y: 250 },
    radius: 6,
    surface: DEAD,
    mass: 0.2,
    ...overrides,
  });

  it('fall, weigh what they were given and report their landing', () => {
    const world = createWorld();
    const ground = world.addTerrain([GROUND], DEAD);
    const pebble = world.addCircle(
      circle({ position: { x: 500, y: 470 }, velocity: { x: 0, y: 600 } }),
    );

    expect(world.getMass(pebble)).toBeCloseTo(0.2, 9);
    expect(world.isFrozen(pebble)).toBe(false);
    const [hit] = stepUntilHit(world).hits;

    expect(new Set([hit!.bodyA, hit!.bodyB])).toEqual(new Set([ground, pebble]));
    expect(hit!.impulse / hit!.speed).toBeCloseTo(0.2, 2);
    for (let step = 0; step < 60; step++) world.step();
    expect(world.getTransform(pebble).y).toBeCloseTo(500 - 6, 0); // resting on the ground
  });

  it('report hitting a Line, and hit a moving Object with both masses', () => {
    const world = createWorld();
    world.addLine([{ a: { x: 300, y: 400 }, b: { x: 700, y: 400 } }], 8, DEAD);
    world.addCircle(circle({ position: { x: 400, y: 380 }, velocity: { x: 0, y: 500 } }));
    const [onLine] = stepUntilHit(world).hits;
    expect(onLine!.impulse / onLine!.speed).toBeCloseTo(0.2, 2);

    const other = createWorld();
    other.addObject({
      position: { x: 500, y: 300 },
      parts: [square(20)],
      frozen: false,
      surface: DEAD,
      mass: 0.2,
    });
    other.addCircle(circle({ position: { x: 500, y: 250 }, velocity: { x: 0, y: 400 } }));
    const [onObject] = stepUntilHit(other).hits;
    // Two equal masses, head on: each counts half.
    expect(onObject!.impulse / onObject!.speed).toBeCloseTo(0.1, 1);
  });

  it('wake a Frozen Object light enough, and not one too heavy', () => {
    function wakes(frozenMass: number): boolean {
      const world = createWorld();
      const box = world.addObject({
        position: { x: 500, y: 300 },
        parts: [square(20)],
        frozen: true,
        surface: DEAD,
        mass: frozenMass,
      });
      world.addCircle(circle({ position: { x: 500, y: 270 }, velocity: { x: 0, y: 800 } }));
      stepUntilHit(world);
      return !world.isFrozen(box);
    }

    expect(wakes(0.2)).toBe(true);
    expect(wakes(20)).toBe(false);
  });

  it('wake a Frozen Object of several parts, and every hit between the two plays out as a free collision', () => {
    const world = createWorld();
    const box = world.addObject({
      position: { x: 500, y: 300 },
      // Two halves meeting under the circle: it hits both in one step.
      parts: [
        [
          { x: -20, y: -20 },
          { x: 0, y: -20 },
          { x: 0, y: 20 },
          { x: -20, y: 20 },
        ],
        [
          { x: 0, y: -20 },
          { x: 20, y: -20 },
          { x: 20, y: 20 },
          { x: 0, y: 20 },
        ],
      ],
      frozen: true,
      surface: DEAD,
      mass: 1,
    });
    const ball = world.addCircle(
      circle({ position: { x: 500, y: 260 }, mass: 1, velocity: { x: 0, y: 600 } }),
    );

    const { hits } = stepUntilHit(world);
    const between = hits.filter((hit) => new Set([hit.bodyA, hit.bodyB, box, ball]).size === 2);
    const partsHit = new Set(between.map((hit) => (hit.bodyA === box ? hit.shapeA : hit.shapeB)));

    expect(world.isFrozen(box)).toBe(false);
    expect(partsHit.size).toBe(2);
    // Two equal masses share the hit; against a wall the ratio would be 1.
    for (const hit of between) expect(hit.impulse / hit.speed).toBeCloseTo(0.5, 1);
  });

  it('of one group pass through each other, and hit circles of none', () => {
    function meet(groups: [number | undefined, number | undefined]): boolean {
      const world = createWorld();
      const [a, b] = groups.map((group, k) =>
        world.addCircle(
          circle({
            position: { x: 480 + 40 * k, y: 250 },
            velocity: { x: k === 0 ? 300 : -300, y: 0 },
            ...(group !== undefined && { group }),
          }),
        ),
      );
      for (let step = 0; step < 10; step++) world.step();
      return world.getTransform(a!).x < world.getTransform(b!).x;
    }

    expect(meet([1, 1])).toBe(false); // they passed through each other
    expect(meet([1, undefined])).toBe(true);
    expect(meet([1, 2])).toBe(true);
  });

  it('never wake a Frozen Object if they are made not to, however hard they hit', () => {
    const world = createWorld();
    const box = world.addObject({
      position: { x: 500, y: 300 },
      parts: [square(20)],
      frozen: true,
      surface: DEAD,
      mass: 0.2,
    });
    world.addCircle(
      circle({ position: { x: 500, y: 250 }, velocity: { x: 0, y: 3000 }, wakes: false, mass: 5 }),
    );

    const [hit] = stepUntilHit(world).hits;

    expect(hit!.impulse).toBeGreaterThan(0);
    for (let step = 0; step < 30; step++) world.step();
    expect(world.isFrozen(box)).toBe(true);
  });

  it('roll to a stop on flat ground', () => {
    const world = createWorld();
    world.addTerrain([GROUND], DEAD);
    const pebble = world.addCircle(
      circle({ position: { x: 200, y: 494 }, velocity: { x: 300, y: 0 } }),
    );

    for (let step = 0; step < 60 * 8; step++) world.step();

    expect(Math.abs(world.getVelocity(pebble).x)).toBeLessThan(1);
    expect(world.getTransform(pebble).x).toBeGreaterThan(300); // it did roll
  });

  it('report exactly the pose, velocity and spin they were created with until they move', () => {
    const world = createWorld();
    const def = circle({
      position: { x: 123.456, y: 234.567 },
      angle: 0.7071,
      velocity: { x: -321.1, y: 17.3 },
      angularVelocity: 3.3,
    });
    const pebble = world.addCircle(def);

    expect(world.getTransform(pebble)).toEqual({ ...def.position, angle: def.angle });
    expect(world.getVelocity(pebble)).toEqual(def.velocity);
    expect(world.getAngularVelocity(pebble)).toBe(3.3);
  });
});

describe('Pushes', () => {
  it('change a free body’s momentum and spin, and leave anything else alone', () => {
    const world = createWorld();
    const terrain = world.addTerrain([GROUND], DEAD);
    const line = world.addLine([{ a: { x: 100, y: 100 }, b: { x: 300, y: 100 } }], 8, DEAD);
    const add = (x: number, frozen: boolean) =>
      world.addObject({
        position: { x, y: 300 },
        parts: [square(20)],
        frozen,
        surface: DEAD,
        mass: 2,
      });
    const moving = add(500, false);
    const frozen = add(700, true);
    const sliding = add(900, false);
    world.slideOut(sliding, { x: 0, y: -40 }, 250);
    const pebble = world.addCircle({
      position: { x: 300, y: 300 },
      radius: 6,
      surface: DEAD,
      mass: 0.5,
    });

    expect([terrain, line, frozen, sliding].map((id) => world.isFree(id))).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect([moving, pebble].map((id) => world.isFree(id))).toEqual([true, true]);

    // A 40 px square of mass 2 turns with 2 × (40² + 40²) / 12.
    expect(world.getInertia(moving)).toBeCloseTo((2 * 3200) / 12, 6);
    world.applyImpulse(moving, { x: 300, y: -100 });
    world.applyAngularImpulse(moving, world.getInertia(moving) * 2);
    world.applyImpulse(frozen, { x: 300, y: -100 });
    expect(world.getVelocity(moving).x).toBeCloseTo(150, 6);
    expect(world.getVelocity(moving).y).toBeCloseTo(-50, 6);
    expect(world.getAngularVelocity(moving)).toBeCloseTo(2, 6);
    expect(world.getVelocity(frozen)).toEqual({ x: 0, y: 0 });
  });
});

describe('Bonds', () => {
  const box = (world: PhysicsWorld, x: number, y: number, frozen = false) =>
    world.addObject({
      position: { x, y },
      parts: [square(20)],
      frozen,
      surface: DEAD,
      mass: 1,
    });
  /** Anchors that hold two unrotated bodies at `a` and `b` together at `point`. */
  const at = (a: { x: number; y: number }, b: { x: number; y: number }, point = a) => ({
    onA: { x: point.x - a.x, y: point.y - a.y },
    onB: { x: point.x - b.x, y: point.y - b.y },
    angle: 0,
  });

  it('hold a moving Object where it is when bonded to the Terrain', () => {
    const world = createWorld();
    const terrain = world.addTerrain([GROUND], DEAD);
    const hanging = box(world, 500, 300);

    world.addBond(hanging, terrain, at({ x: 500, y: 300 }, { x: 0, y: 0 }));
    for (let step = 0; step < 120; step++) world.step();

    expect(world.getTransform(hanging).x).toBeCloseTo(500, 0);
    expect(world.getTransform(hanging).y).toBeCloseTo(300, 0);
  });

  it('stop the two touching, and let go when removed', () => {
    const world = createWorld();
    const terrain = world.addTerrain([GROUND], DEAD);
    const resting = box(world, 500, 480);
    for (let step = 0; step < 30; step++) world.step();
    const touching = world.touchingPairs();
    expect(touching).toHaveLength(1);

    const bond = world.addBond(resting, terrain, at({ x: 500, y: 480 }, { x: 0, y: 0 }));
    expect(world.step().ends).toEqual(touching);
    expect(world.touchingPairs()).toEqual([]);

    world.removeBond(bond);
    expect(world.getBond(bond)).toBeNull();
    world.removeBond(bond); // already gone: nothing happens
    for (let step = 0; step < 30; step++) world.step();
    expect(world.touchingPairs()).toHaveLength(1); // it rests on the ground again
  });

  it('last through a Frozen host waking, and the two then move as one', () => {
    const world = createWorld();
    const host = box(world, 500, 300, true);
    const stuck = box(world, 540, 300);
    world.addBond(stuck, host, at({ x: 540, y: 300 }, { x: 500, y: 300 }, { x: 520, y: 300 }));
    for (let step = 0; step < 30; step++) world.step();
    expect(world.getTransform(stuck).y).toBeCloseTo(300, 0); // held by the Frozen host

    world.release(host);
    for (let step = 0; step < 30; step++) world.step();

    const a = world.getTransform(host);
    const b = world.getTransform(stuck);
    expect(a.y).toBeGreaterThan(400); // they fell
    expect(b.x - a.x).toBeCloseTo(40, 0);
    expect(b.y - a.y).toBeCloseTo(0, 0);
  });

  it('are carried along by a slide, and go with either body', () => {
    const world = createWorld();
    const terrain = world.addTerrain([GROUND], DEAD);
    const stuck = box(world, 500, 300);
    const bond = world.addBond(stuck, terrain, at({ x: 500, y: 300 }, { x: 0, y: 0 }));

    world.slideOut(stuck, { x: 0, y: -50 }, 250);
    for (let step = 0; step < 60; step++) world.step();

    // Held where the slide left it, not pulled back.
    expect(world.getTransform(stuck).y).toBeCloseTo(250, 0);
    expect(world.getBond(bond)!.onB.y).toBeCloseTo(250, 0);

    world.removeBody(stuck);
    expect(world.getBond(bond)).toBeNull();
  });
});

describe('Added capsules', () => {
  const BOUNCY = { friction: 0.6, restitution: 0.9 };
  const strip = { a: { x: -20, y: -20 }, b: { x: 20, y: -20 } };

  it('bounce with their own surface where they lie, and go when removed', () => {
    const world = createWorld();
    const ground = world.addTerrain([GROUND], DEAD);
    const patch = world.addCapsule(
      ground,
      { a: { x: 400, y: 500 }, b: { x: 600, y: 500 } },
      1.5,
      BOUNCY,
    );
    const drop = () =>
      world.addObject({
        position: { x: 500, y: 400 },
        parts: [square(20)],
        frozen: false,
        surface: DEAD,
        mass: 1,
        velocity: { x: 0, y: 500 },
      });

    const box = drop();
    const [hit] = stepUntilHit(world).hits;
    expect([hit!.shapeA, hit!.shapeB]).toContain(patch);
    world.step();
    expect(world.getVelocity(box).y).toBeLessThan(-300); // bounced back up

    world.removeBody(box);
    world.removeShape(patch);
    world.removeShape(patch); // already gone: nothing happens
    const dead = drop();
    stepUntilHit(world);
    world.step();
    expect(Math.abs(world.getVelocity(dead).y)).toBeLessThan(50);
  });

  it('leave a body’s mass alone, keep their surface through setSurface, and stay through a wake', () => {
    const world = createWorld();
    const ground = world.addTerrain([GROUND], DEAD);
    const box = world.addObject({
      position: { x: 500, y: 300 },
      parts: [square(20)],
      frozen: true,
      surface: DEAD,
      mass: 1,
    });
    const patch = world.addCapsule(box, strip, 1.5, BOUNCY);
    world.setSurface(box, DEAD);
    world.setMass(box, 2);
    expect(world.getMass(box)).toBe(2);

    world.release(box);
    expect(world.getMass(box)).toBe(2);
    expect(world.getInertia(box)).toBeCloseTo((2 * 40 * 40) / 6, 6);
    // Turned over, it lands on the patch, which bounces it off the ground.
    world.removeBody(box);
    const flipped = world.addObject({
      position: { x: 500, y: 400 },
      parts: [square(20)],
      frozen: true,
      surface: DEAD,
      mass: 1,
      angle: Math.PI,
    });
    const onFlipped = world.addCapsule(flipped, strip, 1.5, BOUNCY);
    world.setSurface(flipped, DEAD);
    world.setMass(flipped, 1);
    world.release(flipped);
    world.setVelocity(flipped, { x: 0, y: 500 });
    const [hit] = stepUntilHit(world).hits;

    expect(new Set([hit!.bodyA, hit!.bodyB])).toEqual(new Set([ground, flipped]));
    expect([hit!.shapeA, hit!.shapeB]).toContain(onFlipped);
    expect(onFlipped).not.toBe(patch);
    world.step();
    expect(world.getVelocity(flipped).y).toBeLessThan(-300);
  });

  it('end their contacts when removed', () => {
    const world = createWorld();
    const ground = world.addTerrain([GROUND], DEAD);
    const patch = world.addCapsule(
      ground,
      { a: { x: 400, y: 500 }, b: { x: 600, y: 500 } },
      1.5,
      DEAD,
    );
    world.addObject({
      position: { x: 500, y: 470 },
      parts: [square(20)],
      frozen: false,
      surface: DEAD,
      mass: 1,
    });
    for (let step = 0; step < 30; step++) world.step();
    const onPatch = () =>
      world.touchingPairs().some((pair) => pair.shapeA === patch || pair.shapeB === patch);
    expect(onPatch()).toBe(true);

    world.removeShape(patch);
    const { ends } = world.step();

    expect(onPatch()).toBe(false);
    expect(ends.some((pair) => pair.shapeA === patch || pair.shapeB === patch)).toBe(true);
  });
});

describe('Touch points', () => {
  it('say where two shapes began touching in the last step, and nothing for others', () => {
    const world = createWorld();
    world.addTerrain([GROUND], DEAD);
    world.addObject({
      position: { x: 500, y: 470 },
      parts: [square(20)],
      frozen: false,
      surface: DEAD,
      mass: 1,
    });

    let report = world.step();
    for (let step = 0; step < 60 && report.begins.length === 0; step++) report = world.step();
    const [pair] = report.begins;

    const point = world.touchPoint(pair!)!;
    expect(point.x).toBeCloseTo(500, 0);
    expect(point.y).toBeCloseTo(500, 0);
    world.step();
    expect(world.touchPoint(pair!)).toBeNull();
  });
});

describe('Bodies within a radius', () => {
  it('are measured to their nearest point, of any kind, leaving out added capsules', () => {
    const world = createWorld();
    const ground = world.addTerrain([GROUND], DEAD);
    const line = world.addLine(
      [
        { a: { x: 100, y: 300 }, b: { x: 200, y: 300 } },
        { a: { x: 200, y: 300 }, b: { x: 300, y: 300 } },
      ],
      8,
      DEAD,
    );
    const frozen = world.addObject({
      position: { x: 500, y: 300 },
      parts: [square(20)],
      frozen: true,
      surface: DEAD,
      mass: 1,
    });
    const pebble = world.addCircle({
      position: { x: 400, y: 200 },
      radius: 5,
      surface: DEAD,
      mass: 1,
    });
    // A capsule added to the Terrain, reaching up near the centre: not the Terrain's own.
    world.addCapsule(ground, { a: { x: 300, y: 480 }, b: { x: 300, y: 380 } }, 2, DEAD);

    const near = (radius: number) =>
      new Map(world.bodiesWithin({ x: 300, y: 300 }, radius).map((b) => [b.body, b]));

    const within = near(210);
    expect([...within.keys()].sort()).toEqual([ground, line, frozen, pebble].sort());
    // Inside the Line's capsule: the centre itself, at 0.
    expect(within.get(line)!.distance).toBe(0);
    expect(within.get(line)!.point).toEqual({ x: 300, y: 300 });
    // The Frozen box's nearest point is its left edge.
    expect(within.get(frozen)!.distance).toBeCloseTo(180, 3);
    expect(within.get(frozen)!.point.x).toBeCloseTo(480, 3);
    expect(within.get(frozen)!.point.y).toBeCloseTo(300, 3);
    expect(within.get(pebble)!.distance).toBeCloseTo(Math.hypot(100, 100) - 5, 3);
    // The Terrain by its own surface at y = 500, not by the capsule at y = 378.
    expect(within.get(ground)!.distance).toBeCloseTo(200, 3);

    expect([...near(179).keys()].sort()).toEqual([line, pebble].sort());
  });
});
