import { afterEach, describe, expect, it } from 'vitest';
import { polygonArea, polygonContainsPoint } from '../geometry/polygon';
import type { Vec2 } from '../geometry/vec2';
import { dragAlong, dragBox, dragCircle } from '../stroke/pointer-paths';
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

function runFor(world: SandboxWorld, seconds: number): void {
  if (!world.isRunning) world.togglePause();
  for (let t = 0; t < seconds * 60; t++) world.step();
}

function objectById(world: SandboxWorld, id: number) {
  const object = world.objects.find((o) => o.id === id);
  if (!object) throw new Error(`no Object ${id}`);
  return object;
}

function drawObject(world: SandboxWorld, samples: Vec2[]): number {
  const outcome = world.submitStroke(samples);
  if (outcome.kind !== 'object') throw new Error(`expected an Object, got ${outcome.kind}`);
  return outcome.id;
}

describe('Sandbox world: Objects', () => {
  it('turns a closed Stroke into a Frozen Object', () => {
    const world = createWorld();

    const id = drawObject(world, dragBox(300, 300, 60, 60));

    expect(world.objects).toHaveLength(1);
    expect(objectById(world, id).frozen).toBe(true);
    expect(world.bodyCount).toBe(2);
  });

  it('keeps a Frozen Object where it was drawn while physics runs', () => {
    const world = createWorld();
    const id = drawObject(world, dragBox(300, 300, 60, 60));
    const before = objectById(world, id).transform;

    runFor(world, 1);

    expect(objectById(world, id).transform).toEqual(before);
    expect(objectById(world, id).frozen).toBe(true);
  });

  it('Releases a Frozen Object under the pointer while running, and it falls', () => {
    const world = createWorld();
    const id = drawObject(world, dragBox(300, 300, 60, 60));
    world.togglePause();

    const released = world.releaseAt({ x: 330, y: 330 });
    runFor(world, 0.5);

    expect(released).toBe(true);
    expect(objectById(world, id).frozen).toBe(false);
    expect(objectById(world, id).transform.y).toBeGreaterThan(330 + 50);
  });

  it('does not Release while paused', () => {
    const world = createWorld();
    const id = drawObject(world, dragBox(300, 300, 60, 60));

    expect(world.releaseAt({ x: 330, y: 330 })).toBe(false);
    expect(objectById(world, id).frozen).toBe(true);
  });

  it('does not Release anything when the pointer misses', () => {
    const world = createWorld();
    const id = drawObject(world, dragBox(300, 300, 60, 60));
    world.togglePause();

    expect(world.releaseAt({ x: 500, y: 330 })).toBe(false);
    expect(objectById(world, id).frozen).toBe(true);
  });

  it('lands a dropped Object on a Line, which stays put', () => {
    const world = createWorld();
    world.submitStroke(
      dragAlong([
        { x: 200, y: 500 },
        { x: 600, y: 500 },
      ]),
    );
    const line = world.lines[0]!.segments;
    const id = drawObject(world, dragBox(380, 400, 40, 40));
    world.togglePause();
    world.releaseAt({ x: 400, y: 420 });

    runFor(world, 2);

    const box = objectById(world, id);
    // The box's bottom rests on the Line's top surface (y = 500 - 4).
    expect(box.transform.y + 20).toBeCloseTo(496, 0);
    expect(world.lines[0]!.segments).toEqual(line);
  });

  it('collides as a solid shape: a ball rests on a drawn square outline, not inside it', () => {
    const world = createWorld();
    drawObject(world, dragBox(320, 520, 160, 160));
    // A gentle drop (5 px), too soft to wake the Frozen square.
    const ball = drawObject(world, dragCircle({ x: 400, y: 500 }, 15));
    world.togglePause();
    world.releaseAt({ x: 400, y: 500 });

    runFor(world, 1);

    expect(objectById(world, ball).transform.y).toBeCloseTo(520 - 15, -1);
  });

  it('undo and clear remove Objects too', () => {
    const world = createWorld();
    drawObject(world, dragBox(300, 300, 60, 60));
    drawObject(world, dragBox(500, 300, 60, 60));

    world.undo();
    expect(world.objects).toHaveLength(1);

    world.clear();
    expect(world.objects).toHaveLength(0);
    expect(world.bodyCount).toBe(1);
  });
});

describe('Sandbox world: Frozen Objects wake on hits', () => {
  /** A Frozen 60 × 60 box in mid-air and a ball of radius 15 just left of it. */
  function boxAndBall(gap: number) {
    const world = createWorld();
    const box = drawObject(world, dragBox(600, 400, 60, 60));
    const ball = drawObject(world, dragCircle({ x: 600 - gap - 15, y: 430 }, 15));
    world.togglePause();
    return { world, box, ball };
  }

  it('wakes when a moving body hits it faster than the wake speed', () => {
    const { world, box, ball } = boxAndBall(5);
    world.release(ball, { x: 300, y: 0 });

    runFor(world, 0.2);

    expect(objectById(world, box).frozen).toBe(false);
  });

  it('stays Frozen when touched more slowly than the wake speed', () => {
    const { world, box, ball } = boxAndBall(5);
    world.release(ball, { x: 100, y: 0 });

    runFor(world, 0.2);

    expect(objectById(world, box).frozen).toBe(true);
  });

  it('moves the woken Object in the direction of the hit, sharing momentum as if it had been free', () => {
    const { world, box, ball } = boxAndBall(100);
    const speed = 600;
    world.release(ball, { x: speed, y: 0 });

    runFor(world, 0.3);

    const b = objectById(world, box);
    const c = objectById(world, ball);
    expect(b.frozen).toBe(false);
    expect(b.velocity.x).toBeGreaterThan(0);
    // The ball carries on forwards rather than stopping dead as at a wall.
    expect(c.velocity.x).toBeGreaterThan(0);
    // Uniform density: mass is proportional to area. Momentum is conserved.
    const massBall = polygonArea(c.outline);
    const massBox = polygonArea(b.outline);
    const after = massBall * c.velocity.x + massBox * b.velocity.x;
    expect(after / (massBall * speed)).toBeCloseTo(1, 1);
  });

  it('stays Frozen under resting contact', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(320, 520, 160, 160));
    const ball = drawObject(world, dragCircle({ x: 400, y: 500 }, 15)); // 5 px above the box
    world.togglePause();
    world.release(ball);

    runFor(world, 2);

    expect(objectById(world, box).frozen).toBe(true);
  });

  it('is never woken by Terrain or a Line it touches', () => {
    const world = createWorld();
    world.submitStroke(
      dragAlong([
        { x: 600, y: 500 },
        { x: 900, y: 500 },
      ]),
    );
    const onGround = drawObject(world, dragBox(200, 820, 60, 60));
    const onLine = drawObject(world, dragBox(700, 436, 60, 60)); // bottom touches the Line's top

    runFor(world, 2);

    expect(objectById(world, onGround).frozen).toBe(true);
    expect(objectById(world, onLine).frozen).toBe(true);
  });

  it('keeps Frozen Objects that touch each other Frozen', () => {
    const world = createWorld();
    const upper = drawObject(world, dragBox(400, 300, 60, 60));
    const lower = drawObject(world, dragBox(400, 360, 60, 60));

    runFor(world, 2);

    expect(objectById(world, upper).frozen).toBe(true);
    expect(objectById(world, lower).frozen).toBe(true);
  });
});
