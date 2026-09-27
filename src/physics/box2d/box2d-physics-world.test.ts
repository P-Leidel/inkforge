import { afterEach, describe, expect, it } from 'vitest';
import type { Polygon } from '../../geometry/polygon';
import type { PhysicsWorld, Surface } from '../physics-world';
import { circleDef, lineDef, objectDef, terrainDef } from '../test-bodies';
import { createBox2dPhysicsWorld, readEngineBody, type EngineBody } from './box2d-physics-world';

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.destroy();
});

const DEAD: Surface = { friction: 0.6, restitution: 0 };
const BOUNCY: Surface = { friction: 0.2, restitution: 0.9 };
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
  const world = createBox2dPhysicsWorld({
    gravity: { x: 0, y: 1000 },
    timeStep: 1 / 60,
    wakeSpeed: 80,
    minBounceSpeed: 50,
  });
  worlds.push(world);
  return world;
}

/** What a rebuild must keep: everything the engine holds but the body's type and pose. */
function attachments(body: EngineBody) {
  return {
    bullet: body.bullet,
    angularDamping: body.angularDamping,
    upright: body.upright,
    shapes: body.shapes,
    joints: body.joints,
  };
}

describe('Rebuilt bodies', () => {
  it('stay upright when they are described upright', () => {
    const world = createWorld();
    const walker = world.addBody({
      shapes: { kind: 'polygons', polygons: [square(20)] },
      surface: DEAD,
      position: { x: 300, y: 300 },
      motion: { mass: 2, frozen: true, upright: true, driven: true },
    });
    expect(readEngineBody(world, walker).upright).toBe(true);

    world.release(walker); // rebuilt
    expect(readEngineBody(world, walker)).toMatchObject({ type: 'moving', upright: true });
  });

  it('keep every attachment, after a Release and after a slide ends', () => {
    const world = createWorld();
    const terrain = world.addBody(terrainDef([GROUND], DEAD));
    // A Frozen Object with a Patch, bonded to a moving one.
    const frozen = world.addBody(
      objectDef({
        position: { x: 300, y: 300 },
        parts: [square(20)],
        frozen: true,
        surface: { friction: 0.3, restitution: 0.2 },
        mass: 2,
        angle: 0.4,
      }),
    );
    world.addCapsule(frozen, { a: { x: -20, y: -20 }, b: { x: 20, y: -20 } }, 1.5, BOUNCY);
    const partner = world.addBody(
      objectDef({
        position: { x: 300, y: 250 },
        parts: [square(10)],
        frozen: false,
        surface: DEAD,
        mass: 1,
      }),
    );
    world.addBond(partner, frozen, {
      onA: { x: 0, y: 10 },
      onB: { x: 0, y: -40 },
      angle: 0.4,
    });
    // A circle with every option, a Patch and a bond to the Terrain.
    const circle = world.addBody(
      circleDef({
        position: { x: 700, y: 300 },
        radius: 6,
        surface: { friction: 0.1, restitution: 0.5 },
        mass: 1,
        group: 3,
        wakes: false,
        bullet: true,
      }),
    );
    world.addCapsule(circle, { a: { x: -4, y: -6 }, b: { x: 4, y: -6 } }, 1, BOUNCY);
    const bond = world.addBond(circle, terrain, {
      onA: { x: 0, y: 0 },
      onB: { x: 700, y: 300 },
      angle: 0,
    });
    const frozenBefore = readEngineBody(world, frozen);
    const circleBefore = readEngineBody(world, circle);
    expect(frozenBefore.shapes).toHaveLength(2);
    expect(frozenBefore.joints).toBe(1);
    expect(circleBefore).toMatchObject({ bullet: true, joints: 1 });
    expect(circleBefore.angularDamping).toBeGreaterThan(0);
    expect(circleBefore.shapes[0]!.groupIndex).toBe(-3);

    world.release(frozen);
    const released = readEngineBody(world, frozen);
    world.slideOut(circle, { x: 0, y: -50 }, 250);
    for (let step = 0; world.getSlide(circle) && step < 60; step++) world.step();
    const slid = readEngineBody(world, circle);

    expect(released.type).toBe('moving');
    expect(released.transform.x).toBeCloseTo(frozenBefore.transform.x, 6);
    expect(released.transform.y).toBeCloseTo(frozenBefore.transform.y, 6);
    expect(released.transform.angle).toBeCloseTo(frozenBefore.transform.angle, 6);
    expect(attachments(released)).toEqual(attachments(frozenBefore));
    expect(slid.type).toBe('moving');
    expect(slid.transform.y).toBeCloseTo(250, 0);
    expect(attachments(slid)).toEqual(attachments(circleBefore));

    // Let go, the circle drops onto a light Frozen Object and doesn't wake it.
    world.removeBond(bond);
    const light = world.addBody(
      objectDef({
        position: { x: 700, y: 400 },
        parts: [square(20)],
        frozen: true,
        surface: DEAD,
        mass: 0.01,
      }),
    );
    let hit = false;
    for (let step = 0; step < 60 && !hit; step++) {
      hit = world
        .step()
        .hits.some(
          (h) =>
            (h.bodyA === circle && h.bodyB === light) || (h.bodyA === light && h.bodyB === circle),
        );
    }
    expect(hit).toBe(true);
    expect(world.isFrozen(light)).toBe(true);
  });
});

describe('Surfaces', () => {
  it('are the body’s own: editing the one given changes nothing until it is set again', () => {
    const world = createWorld();
    const table = { friction: 0.5, restitution: 0.1 };
    const terrain = world.addBody(terrainDef([GROUND], table));
    const line = world.addBody(
      lineDef([{ a: { x: 100, y: 200 }, b: { x: 200, y: 200 } }], 8, table),
    );
    const frozen = world.addBody(
      objectDef({
        position: { x: 300, y: 300 },
        parts: [square(20)],
        frozen: true,
        surface: table,
        mass: 1,
      }),
    );
    const moving = world.addBody(
      objectDef({
        position: { x: 500, y: 300 },
        parts: [square(20)],
        frozen: false,
        surface: table,
        mass: 1,
      }),
    );
    const circle = world.addBody(
      circleDef({
        position: { x: 700, y: 300 },
        radius: 6,
        surface: table,
        mass: 1,
      }),
    );
    const patch = world.addCapsule(
      frozen,
      { a: { x: -20, y: -20 }, b: { x: 20, y: -20 } },
      1.5,
      table,
    );
    const bodies = [terrain, line, frozen, moving, circle];
    const surfaces = () =>
      bodies.flatMap((body) =>
        readEngineBody(world, body).shapes.map(({ id, friction, restitution }) => ({
          id,
          friction,
          restitution,
        })),
      );
    const surfaceOf = (id: number) => surfaces().find((shape) => shape.id === id)!;
    const given = surfaces();
    expect(given.every((s) => s.friction === 0.5 && s.restitution === 0.1)).toBe(true);

    table.friction = 0.9;
    table.restitution = 0.8;
    world.release(frozen); // rebuilt
    world.step();

    expect(surfaces()).toEqual(given);

    world.setSurface(frozen, table);
    const own = readEngineBody(world, frozen).shapes.find((shape) => shape.id !== patch)!;
    expect(own).toMatchObject({ friction: 0.9, restitution: 0.8 });
    expect(surfaceOf(patch)).toMatchObject({ friction: 0.5, restitution: 0.1 });

    world.setShapeSurface(patch, table);
    table.friction = 0.2; // an edit after the call changes nothing either
    expect(surfaceOf(patch)).toMatchObject({ friction: 0.9, restitution: 0.8 });
  });
});
