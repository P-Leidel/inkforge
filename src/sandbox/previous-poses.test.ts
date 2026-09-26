import { describe, expect, it } from 'vitest';
import { DEMOLITION_DEMO } from '../gallery/gallery';
import { dragBox } from '../stroke/pointer-paths';
import { STEP_SECONDS, type Poses, type SandboxWorld } from './sandbox-world';
import { drawObject, objectById, runFor, sandboxWorlds } from './test-support';

const createWorld = sandboxWorlds();

/** Draws a box in mid-air, starts physics and lets it fall; returns its id. */
function fallingBox(world: SandboxWorld): number {
  const id = drawObject(world, dragBox(900, 200, 60, 60));
  world.togglePause();
  world.release(id);
  return id;
}

/** The poses of every body the renderer draws between two poses, or by one. */
function everyPoses(world: SandboxWorld): Poses[] {
  return [
    ...world.objects,
    ...world.rubble,
    ...world.droplets,
    ...world.patches.map((patch) => patch.hostPoses),
    ...world.bonds.map((bond) => bond.objectPoses),
  ];
}

/** The poses that differ from the previous ones. */
const moved = (poses: readonly Poses[]) =>
  poses.filter(
    ({ transform: now, previousTransform: then }) =>
      now.x !== then.x || now.y !== then.y || now.angle !== then.angle,
  );

describe('Sandbox world: how far into the next step', () => {
  it('is 1 while paused, before and after running', () => {
    const world = createWorld();
    expect(world.stepFraction).toBe(1);

    world.togglePause();
    world.advance(1.5 * STEP_SECONDS);
    world.togglePause();

    expect(world.stepFraction).toBe(1);
  });

  it('is the time `advance` carried over, in steps', () => {
    const world = createWorld();
    world.togglePause();
    expect(world.stepFraction).toBe(0);

    expect(world.advance(1.5 * STEP_SECONDS)).toBe(1);
    expect(world.stepFraction).toBeCloseTo(0.5, 9);

    expect(world.advance(0.25 * STEP_SECONDS)).toBe(0);
    expect(world.stepFraction).toBeCloseTo(0.75, 9);

    expect(world.advance(0.25 * STEP_SECONDS)).toBe(1);
    expect(world.stepFraction).toBeCloseTo(0, 9);
  });
});

describe('Sandbox world: previous poses', () => {
  it("keeps a falling Object's pose as the latest step began", () => {
    const world = createWorld();
    const id = fallingBox(world);
    world.step();
    const before = objectById(world, id).transform;

    world.step();

    const object = objectById(world, id);
    expect(object.previousTransform).toEqual(before);
    expect(object.transform.y).toBeGreaterThan(before.y);
  });

  it('has none for a body added since the latest step: it is drawn where it is', () => {
    const world = createWorld();
    fallingBox(world);
    runFor(world, 0.2);

    const id = drawObject(world, dragBox(1200, 200, 60, 60));
    world.release(id, { x: 300, y: 0 });

    const object = objectById(world, id);
    expect(object.previousTransform).toEqual(object.transform);
  });

  it('forgets every pose at R, where Stroke ids come back, and until the first step after Space', () => {
    const world = createWorld();
    DEMOLITION_DEMO.build(world);
    runFor(world, 1.25); // the Spills' Droplets are flying
    expect(moved(world.droplets).length).toBeGreaterThan(0);
    runFor(world, 1); // the Fills' Rubble is falling
    expect(moved(world.rubble).length).toBeGreaterThan(0);

    world.reset();
    expect(moved(everyPoses(world))).toEqual([]);

    world.togglePause();
    expect(moved(everyPoses(world))).toEqual([]);
    world.step();
    expect(moved(everyPoses(world)).length).toBeGreaterThan(0);
  });

  it('forgets every pose at Clear and when a demo is loaded', () => {
    const world = createWorld();
    DEMOLITION_DEMO.build(world);
    runFor(world, 0.5);
    expect(moved(everyPoses(world)).length).toBeGreaterThan(0);

    world.clear();
    DEMOLITION_DEMO.build(world);

    expect(everyPoses(world).length).toBeGreaterThan(0);
    expect(moved(everyPoses(world))).toEqual([]);
  });

  it('never changes what the simulation does', () => {
    const play = (read: boolean) => {
      const world = createWorld();
      DEMOLITION_DEMO.build(world);
      for (let step = 0; step < 90; step++) {
        world.step();
        if (read) everyPoses(world);
      }
      return world.contents;
    };

    expect(play(true)).toEqual(play(false));
  });
});
