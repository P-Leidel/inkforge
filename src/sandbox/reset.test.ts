import { describe, expect, it } from 'vitest';
import { dragAlong, dragBox, dragCircle } from '../stroke/pointer-paths';
import type { SandboxWorld } from './sandbox-world';
import { drawLine, drawObject, objectById, runFor, sandboxWorlds } from './test-support';

const createWorld = sandboxWorlds();

/** Every Object's pose and motion, to compare runs exactly. */
function state(world: SandboxWorld) {
  return world.objects.map((o) => ({
    id: o.id,
    transform: o.transform,
    velocity: o.velocity,
    frozen: o.frozen,
    fill: o.fill,
  }));
}

/**
 * A busy scene: a ramp, a stack of boxes, a ball rolling down into them, a
 * Frozen box it knocks awake, and Strokes drawn and undone before physics
 * starts, so the engine has some history.
 */
function busyScene(world: SandboxWorld): void {
  drawLine(world, [
    { x: 100, y: 500 },
    { x: 500, y: 700 },
  ]);
  for (let k = 0; k < 3; k++) drawObject(world, dragBox(600, 818 - k * 62, 60, 60));
  world.fillAt({ x: 630, y: 848 }, 'black');
  drawObject(world, dragBox(700, 600, 60, 60));
  drawObject(world, dragBox(300, 200, 40, 40));
  world.undo();
  drawObject(world, dragBox(300, 200, 50, 50), 'blue');
  world.undo();
  const ball = drawObject(world, dragCircle({ x: 150, y: 460 }, 20), 'blue');
  world.togglePause();
  world.release(ball, { x: 100, y: 0 });
  for (const object of world.objects) if (object.id !== ball) world.release(object.id);
}

describe('Reset', () => {
  it('does nothing before physics has first started', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(300, 300, 60, 60));

    world.reset();

    expect(world.objects.map((o) => o.id)).toEqual([box]);
    expect(world.isRunning).toBe(false);
  });

  it('takes the world back to the moment physics started, and pauses', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(300, 300, 60, 60));
    world.togglePause();
    world.release(box);
    world.togglePause();
    world.togglePause(); // started again: this is the moment R goes back to
    const start = state(world);
    runFor(world, 1);
    expect(objectById(world, box).transform.y).toBeGreaterThan(400);

    world.reset();

    expect(world.isRunning).toBe(false);
    expect(state(world)).toEqual(start);
  });

  it('replays a run exactly: N steps, R, and the same N steps end identically', () => {
    const world = createWorld();
    busyScene(world);
    // Pause and start at once, so the snapshot already has the ball let go.
    world.togglePause();
    world.togglePause();
    runFor(world, 3);
    const first = state(world);

    world.reset();
    runFor(world, 3);

    expect(state(world)).toEqual(first);
  });

  it('replays exactly after pausing mid-run and starting again', () => {
    const world = createWorld();
    busyScene(world);
    runFor(world, 1.5);
    world.togglePause();
    world.togglePause(); // a new snapshot, mid-run
    runFor(world, 2);
    const first = state(world);

    world.reset();
    runFor(world, 2);

    expect(state(world)).toEqual(first);
  });

  it('keeps Strokes, Fills, Colours, velocities and Frozen state in the snapshot', () => {
    const world = createWorld();
    const frozen = drawObject(world, dragBox(300, 300, 60, 60), 'red');
    world.fillAt({ x: 330, y: 330 }, 'green');
    const thrown = drawObject(world, dragCircle({ x: 600, y: 300 }, 20), 'blue');
    drawLine(
      world,
      [
        { x: 100, y: 600 },
        { x: 400, y: 650 },
      ],
      'black',
    );
    world.togglePause();
    world.release(thrown, { x: 250, y: -300 });
    world.togglePause();
    world.togglePause();
    const start = state(world);
    runFor(world, 1);

    world.reset();

    expect(state(world)).toEqual(start);
    expect(objectById(world, frozen)).toMatchObject({ colour: 'red', fill: 'green', frozen: true });
    expect(objectById(world, thrown)).toMatchObject({ colour: 'blue', frozen: false });
    expect(objectById(world, thrown).velocity.x).toBeCloseTo(250, 6);
    expect(world.lines.map((line) => line.colour)).toEqual(['black']);
  });

  it('forgets Strokes and Fills made after the snapshot, and undo carries on from it', () => {
    const world = createWorld();
    const first = drawObject(world, dragBox(300, 300, 60, 60));
    const second = drawObject(world, dragBox(500, 300, 60, 60));
    world.togglePause();
    drawObject(world, dragBox(700, 300, 60, 60));
    world.fillAt({ x: 330, y: 330 }, 'black');
    runFor(world, 0.5);

    world.reset();

    expect(world.objects.map((o) => o.id)).toEqual([first, second]);
    expect(objectById(world, first).fill).toBeNull();
    world.undo();
    expect(world.objects.map((o) => o.id)).toEqual([first]);
  });

  it('gives new Strokes after R fresh ids', () => {
    const world = createWorld();
    drawObject(world, dragBox(300, 300, 60, 60));
    world.togglePause();
    const later = drawObject(world, dragBox(500, 300, 60, 60));
    world.reset();

    const again = drawObject(world, dragBox(500, 300, 60, 60));

    expect(again).not.toBe(later);
    expect(world.objects).toHaveLength(2);
  });

  it('restores the random generator: the same numbers come out after R', () => {
    const world = createWorld();
    world.togglePause();
    const draw = () => Array.from({ length: 5 }, () => world.random.next());
    const first = draw();

    world.reset();

    expect(draw()).toEqual(first);
  });

  it('restores simulated time', () => {
    const world = createWorld();
    runFor(world, 1);
    world.togglePause();
    world.togglePause();
    runFor(world, 1);

    world.reset();

    expect(world.time).toBeCloseTo(1, 9);
  });

  it('replays a slide in progress: an Object half way off a Line when the snapshot is taken', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(370, 400, 60, 60));
    world.submitStroke(
      dragAlong([
        { x: 250, y: 440 },
        { x: 550, y: 440 },
      ]),
      'grey',
    );
    world.togglePause();
    for (let step = 0; step < 4; step++) world.step(); // it slides 25 px up at 250 px/s: 6 steps
    world.togglePause();
    world.togglePause(); // snapshot mid-slide
    const sliding = objectById(world, box).transform;
    runFor(world, 2);
    const first = state(world);

    world.reset();
    expect(objectById(world, box).transform).toEqual(sliding);
    runFor(world, 2);

    expect(state(world)).toEqual(first);
    // It finished its slide and came to rest on the Line (top at y = 436).
    expect(objectById(world, box).transform.y + 30).toBeCloseTo(436, 0);
  });

  it('is forgotten by Clear: R does nothing until physics starts again', () => {
    const world = createWorld();
    drawObject(world, dragBox(300, 300, 60, 60));
    world.togglePause();
    world.togglePause();

    world.clear();
    const box = drawObject(world, dragBox(500, 300, 60, 60));
    world.reset();

    expect(world.objects.map((o) => o.id)).toEqual([box]);
  });

  it('keeps Frozen Objects exactly where they were drawn through every start', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(300, 300, 60, 60));
    const drawn = objectById(world, box).transform;

    for (let k = 0; k < 5; k++) {
      runFor(world, 0.1);
      world.togglePause();
    }

    expect(objectById(world, box).transform).toEqual(drawn);
  });
});
