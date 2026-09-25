import { afterEach, describe, expect, it } from 'vitest';
import { polygonContainsPoint } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import { dragAlong } from '../stroke/pointer-paths';
import { SandboxWorld } from './sandbox-world';

const worlds: SandboxWorld[] = [];
function createWorld(seed = 1): SandboxWorld {
  const world = new SandboxWorld({ seed });
  worlds.push(world);
  return world;
}
afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

function isTerrain(world: SandboxWorld, point: Vec2): boolean {
  return world.arena.terrain.some((polygon) => polygonContainsPoint(polygon, point));
}

describe('Sandbox world: Arena', () => {
  it('has ground, a wall at each side, a pit and a slope', () => {
    const world = createWorld();

    expect(isTerrain(world, { x: 500, y: 890 }), 'ground').toBe(true);
    expect(isTerrain(world, { x: 500, y: 870 }), 'air above ground').toBe(false);
    expect(isTerrain(world, { x: 20, y: 300 }), 'left wall').toBe(true);
    expect(isTerrain(world, { x: 1900, y: 300 }), 'right wall').toBe(true);
    expect(isTerrain(world, { x: 1000, y: 950 }), 'inside the pit').toBe(false);
    expect(isTerrain(world, { x: 1000, y: 1060 }), 'pit floor').toBe(true);
    // The slope rises towards the right wall.
    expect(isTerrain(world, { x: 1500, y: 850 })).toBe(true);
    expect(isTerrain(world, { x: 1800, y: 850 })).toBe(true);
    expect(isTerrain(world, { x: 1800, y: 700 })).toBe(true);
    expect(isTerrain(world, { x: 1500, y: 700 })).toBe(false);
  });

  it('simulates the Terrain as one fixed body', () => {
    const world = createWorld();
    expect(world.bodyCount).toBe(1);
  });
});

describe('Sandbox world: pause and stepping', () => {
  it('starts paused and does not advance time while paused', () => {
    const world = createWorld();
    expect(world.isRunning).toBe(false);

    world.step();
    world.advance(1);

    expect(world.time).toBe(0);
  });

  it('advances one fixed 1/60 s step at a time while running', () => {
    const world = createWorld();
    world.togglePause();

    world.step();
    world.step();

    expect(world.isRunning).toBe(true);
    expect(world.time).toBeCloseTo(2 / 60, 10);
  });

  it('steps at a fixed 60 Hz whatever the frame rate', () => {
    const world = createWorld();
    world.togglePause();

    // 100 ms of uneven frames: 6 fixed steps.
    for (const frameMs of [7, 16, 33, 5, 20, 19]) world.advance(frameMs / 1000);

    expect(world.time).toBeCloseTo(6 / 60, 10);
  });

  it('toggles back to paused', () => {
    const world = createWorld();
    world.togglePause();
    world.togglePause();

    world.step();

    expect(world.isRunning).toBe(false);
    expect(world.time).toBe(0);
  });
});

describe('Sandbox world: randomness', () => {
  it('gives the same random sequence for the same seed', () => {
    const a = createWorld(42);
    const b = createWorld(42);
    const c = createWorld(43);

    const draw = (w: SandboxWorld) => Array.from({ length: 5 }, () => w.random.next());

    expect(draw(a)).toEqual(draw(b));
    expect(draw(a)).not.toEqual(draw(c));
  });
});

describe('Sandbox world: Lines', () => {
  const horizontal = dragAlong([
    { x: 200, y: 500 },
    { x: 600, y: 500 },
  ]);
  const vertical = dragAlong([
    { x: 400, y: 300 },
    { x: 400, y: 700 },
  ]);

  it('turns an open Stroke into a fixed Line', () => {
    const world = createWorld();

    const outcome = world.submitStroke(horizontal);

    expect(outcome.kind).toBe('line');
    expect(world.lines).toHaveLength(1);
    expect(world.bodyCount).toBe(2); // Terrain + the Line
  });

  it('keeps a Line where it was drawn, even in mid-air, while physics runs', () => {
    const world = createWorld();
    world.submitStroke(horizontal);
    const before = world.lines[0]!.segments;

    world.togglePause();
    for (let i = 0; i < 120; i++) world.step();

    expect(world.lines[0]!.segments).toEqual(before);
  });

  it('lets Lines cross each other', () => {
    const world = createWorld();

    world.submitStroke(horizontal);
    const outcome = world.submitStroke(vertical);

    expect(outcome.kind).toBe('line');
    expect(world.lines).toHaveLength(2);
  });

  it('accepts Strokes both while paused and while running', () => {
    const world = createWorld();
    world.submitStroke(horizontal);
    world.togglePause();
    world.step();

    world.submitStroke(vertical);

    expect(world.lines).toHaveLength(2);
  });

  it('ignores a mis-click', () => {
    const world = createWorld();

    const outcome = world.submitStroke([{ x: 300, y: 300 }]);

    expect(outcome.kind).toBe('dropped');
    expect(world.lines).toHaveLength(0);
    expect(world.bodyCount).toBe(1);
  });
});

describe('Sandbox world: undo and clear', () => {
  const strokeAt = (y: number) =>
    dragAlong([
      { x: 200, y },
      { x: 600, y },
    ]);

  it('undo removes the last Stroke', () => {
    const world = createWorld();
    world.submitStroke(strokeAt(300));
    world.submitStroke(strokeAt(400));

    world.undo();

    expect(world.lines).toHaveLength(1);
    expect(world.lines[0]!.segments[0]!.a.y).toBeCloseTo(300);
    expect(world.bodyCount).toBe(2);
  });

  it('undo works while running', () => {
    const world = createWorld();
    world.submitStroke(strokeAt(300));
    world.togglePause();

    world.undo();

    expect(world.lines).toHaveLength(0);
  });

  it('undo with nothing drawn does nothing', () => {
    const world = createWorld();
    world.undo();
    expect(world.bodyCount).toBe(1);
  });

  it('clear removes every Stroke but keeps the Terrain', () => {
    const world = createWorld();
    world.submitStroke(strokeAt(300));
    world.submitStroke(strokeAt(400));

    world.clear();

    expect(world.lines).toHaveLength(0);
    expect(world.bodyCount).toBe(1);
  });
});
