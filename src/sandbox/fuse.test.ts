import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import { DEFAULT_MATERIAL_TABLE } from '../materials/material-table';
import { dragBox, dragCircle } from '../stroke/pointer-paths';
import type { SandboxWorld } from './sandbox-world';
import { STEP_SECONDS } from './sandbox-world';
import { drawLine, drawObject, objectById, runFor, sandboxWorlds } from './test-support';

const createWorld = sandboxWorlds();
const TABLE = DEFAULT_MATERIAL_TABLE;
const RED_LINE = TABLE.colours.red.line;

/** A straight red Line from `from` to `to`; returns its id. */
const fuse = (world: SandboxWorld, from: Vec2, to: Vec2) => drawLine(world, [from, to], 'red');

/** The Line's Pieces still there, by their place along it; none once it is gone. */
function piecesOf(world: SandboxWorld, id: number): number[] {
  return world.lines.find((line) => line.id === id)?.pieces.map((piece) => piece.index) ?? [];
}

/** A grey ball thrown down onto `at`, hard enough to break the red Piece it lands on. */
function light(world: SandboxWorld, at: Vec2): number {
  const ball = drawObject(world, dragCircle({ x: at.x, y: at.y - 30 }, 20));
  if (!world.isRunning) world.togglePause();
  world.release(ball, { x: 0, y: 900 });
  return ball;
}

/** Steps until the Line is gone, at most `seconds`; returns the step each Piece went at, by index. */
function burn(world: SandboxWorld, id: number, seconds: number): Map<number, number> {
  const whole = piecesOf(world, id);
  const wentAt = new Map<number, number>();
  for (let step = 0; step < seconds / STEP_SECONDS && wentAt.size < whole.length; step++) {
    world.step();
    const left = piecesOf(world, id);
    for (const index of whole)
      if (!left.includes(index) && !wentAt.has(index)) wentAt.set(index, step);
  }
  return wentAt;
}

const exists = (world: SandboxWorld, id: number) => world.objects.some((o) => o.id === id);

describe('A red Line', () => {
  it('burns end to end at the ring’s speed once one end is lit', () => {
    const world = createWorld();
    // 480 px: ten Pieces of 48 px.
    const line = fuse(world, { x: 300, y: 600 }, { x: 780, y: 600 });
    expect(piecesOf(world, line)).toHaveLength(10);
    light(world, { x: 305, y: 600 });

    const wentAt = burn(world, line, 2);

    expect(wentAt.size).toBe(10);
    expect(piecesOf(world, line)).toEqual([]);
    // Piece by Piece from the lit end, each after the one before it...
    const steps = [...Array(10).keys()].map((index) => wentAt.get(index)!);
    for (let k = 1; k < steps.length; k++) expect(steps[k]).toBeGreaterThan(steps[k - 1]!);
    // ...and no slower than the ring takes to cross the Line.
    const burnt = (steps.at(-1)! - steps[0]!) * STEP_SECONDS;
    expect(burnt).toBeLessThanOrEqual(480 / TABLE.blast.speed);
  });

  it('burns round a bend and on both sides of where it was lit', () => {
    const world = createWorld();
    const line = drawLine(
      world,
      [
        { x: 300, y: 450 },
        { x: 500, y: 600 },
        { x: 700, y: 450 },
      ],
      'red',
    );
    light(world, { x: 500, y: 600 });

    burn(world, line, 2);

    expect(piecesOf(world, line)).toEqual([]);
  });

  it('keeps its Pieces when an Object is drawn over it and physics starts', () => {
    // A hollow red box, and a heavy one: a 100 px red box filled black.
    for (const [size, fill] of [
      [60, null],
      [100, 'black'],
    ] as const) {
      const world = createWorld();
      const line = fuse(world, { x: 300, y: 600 }, { x: 540, y: 600 });
      // Crossed by the Line 10 px above its bottom: squeezed up off it.
      const box = drawObject(world, dragBox(420 - size / 2, 610 - size, size, size), 'red');
      if (fill) world.fillAt({ x: 420, y: 600 - size / 2 }, fill);

      runFor(world, 2); // squeezed off, it settles onto the Line it was drawn over

      const object = objectById(world, box);
      expect(object.durability).toBe(TABLE.colours.red.outline.durability);
      expect(object.transform.y).toBeCloseTo(596 - size / 2, 0);
      expect(piecesOf(world, line)).toHaveLength(5);
      expect(world.lines[0]!.pieces.every((p) => p.durability === RED_LINE.durability)).toBe(true);
      expect(world.blasts).toHaveLength(0);
    }
  });

  it('keeps its Pieces under a heavy Object drawn over it while physics runs', () => {
    const world = createWorld();
    const line = fuse(world, { x: 300, y: 600 }, { x: 540, y: 600 });
    world.togglePause();
    runFor(world, 0.2);
    const box = drawObject(world, dragBox(370, 510, 100, 100));
    world.fillAt({ x: 420, y: 560 }, 'black');

    runFor(world, 2);

    expect(objectById(world, box).durability).toBe(TABLE.colours.grey.outline.durability);
    expect(piecesOf(world, line)).toHaveLength(5);
    expect(world.lines[0]!.pieces.every((p) => p.durability === RED_LINE.durability)).toBe(true);
  });

  it('keeps its Pieces under an Object resting on it when physics starts again', () => {
    const world = createWorld();
    const line = fuse(world, { x: 300, y: 600 }, { x: 540, y: 600 });
    // Its bottom 1 px above the Line's surface.
    const box = drawObject(world, dragBox(390, 535, 60, 60));
    world.fillAt({ x: 420, y: 565 }, 'black');
    world.togglePause();
    world.release(box);
    runFor(world, 1);
    world.togglePause();
    world.togglePause(); // the box rests on the Line as physics starts

    runFor(world, 1);
    world.reset();
    runFor(world, 1);

    expect(exists(world, box)).toBe(true);
    expect(piecesOf(world, line)).toHaveLength(5);
  });

  it('sets off a bomb at its end', () => {
    const world = createWorld();
    const line = fuse(world, { x: 300, y: 600 }, { x: 540, y: 600 });
    // A Frozen 40 px red ball just past the end of the fuse.
    const bomb = drawObject(world, dragCircle({ x: 570, y: 600 }, 20), 'red');
    light(world, { x: 305, y: 600 });

    burn(world, line, 2);
    runFor(world, 0.2);

    expect(piecesOf(world, line)).toEqual([]);
    expect(exists(world, bomb)).toBe(false);
  });

  it('damages a grey Piece of another Line nearby, and leaves one beyond its reach alone', () => {
    const world = createWorld();
    fuse(world, { x: 300, y: 600 }, { x: 540, y: 600 });
    const near = drawLine(world, [
      { x: 300, y: 630 },
      { x: 540, y: 630 },
    ]);
    const far = drawLine(world, [
      { x: 300, y: 600 + TABLE.blast.pieceRadius + 20 },
      { x: 540, y: 600 + TABLE.blast.pieceRadius + 20 },
    ]);
    light(world, { x: 305, y: 600 });

    runFor(world, 2);

    const durabilities = (id: number) =>
      world.lines.find((l) => l.id === id)!.pieces.map((p) => p.durability);
    const grey = TABLE.colours.grey.line.durability;
    expect(durabilities(near).every((d) => d < grey)).toBe(true);
    expect(durabilities(far).every((d) => d === grey)).toBe(true);
  });
});

describe('A red Line and Reset', () => {
  /** A fuse lit at its left end, with a hollow box on a grey shelf beside it. */
  function build(world: SandboxWorld): number {
    const line = fuse(world, { x: 300, y: 600 }, { x: 780, y: 600 });
    drawLine(world, [
      { x: 500, y: 560 },
      { x: 620, y: 560 },
    ]);
    const box = drawObject(world, dragBox(530, 499, 60, 60));
    light(world, { x: 305, y: 600 });
    world.togglePause();
    world.togglePause(); // R returns to the ball thrown
    world.release(box);
    return line;
  }

  it('restores the unburnt Pieces, the rings spreading and what they acted on, mid-burn', () => {
    const world = createWorld();
    const line = build(world);
    while (piecesOf(world, line).length > 6) world.step();
    world.togglePause();
    const pieces = world.lines.map((l) => l.pieces);
    const blasts = world.blasts;
    expect(blasts.length).toBeGreaterThan(0);
    world.togglePause(); // a snapshot mid-burn
    runFor(world, 2);
    expect(piecesOf(world, line)).toEqual([]);
    const first = world.contents;

    world.reset();
    expect(world.lines.map((l) => l.pieces)).toEqual(pieces);
    expect(world.blasts).toEqual(blasts);
    runFor(world, 2);

    expect(world.contents).toEqual(first);
  });

  it('restores the whole Line from before it was lit', () => {
    const world = createWorld();
    const line = build(world);
    runFor(world, 2);
    expect(piecesOf(world, line)).toEqual([]);

    world.reset();

    expect(piecesOf(world, line)).toHaveLength(10);
    expect(world.blasts).toHaveLength(0);
  });
});
