import { describe, expect, it } from 'vitest';
import type { Segment } from '../geometry/segment';
import type { Vec2 } from '../geometry/vec2';
import { dragBox } from '../stroke/pointer-paths';
import type { SandboxWorld } from './sandbox-world';
import { drawLine, drawObject, objectById, runFor, sandboxWorlds } from './test-support';

const createWorld = sandboxWorlds();

/** The Eraser's brush radius in the scene. */
const RADIUS = 12;

/** A click of the Eraser. */
const eraseAt = (world: SandboxWorld, point: Vec2) => world.eraseAlong([point], RADIUS);

/** A horizontal Line at y = 700 from x = 200 to x = 680: ten Pieces of 48 px. */
const shelf = (world: SandboxWorld, colour: 'grey' | 'red' = 'grey') =>
  drawLine(
    world,
    [
      { x: 200, y: 700 },
      { x: 680, y: 700 },
    ],
    colour,
  );

/** The middle of Piece `k` of the shelf. */
const onPiece = (k: number) => ({ x: 200 + 48 * k + 24, y: 700 });

/** A 60 px box resting on the ground, centred on `x`. */
const boxOnGround = (world: SandboxWorld, x: number, colour: 'grey' | 'red' = 'grey') =>
  drawObject(world, dragBox(x - 30, 818, 60, 60), colour);

/** Everything R brings back, to compare. */
function contents(world: SandboxWorld) {
  return {
    objects: world.objects.map((o) => ({ id: o.id, transform: o.transform, fill: o.fill })),
    lines: world.lines.map((l) => ({ id: l.id, pieces: l.pieces.map((p) => p.index) })),
  };
}

describe('Eraser', () => {
  it('erases a red Object quietly: no Blast, no Debris, nothing let out, nothing damaged', () => {
    const world = createWorld();
    const red = boxOnGround(world, 500, 'red');
    world.fillAt({ x: 500, y: 848 }, 'red');
    const neighbour = boxOnGround(world, 580);
    const durability = objectById(world, neighbour).durability;
    runFor(world, 0.5);

    eraseAt(world, { x: 500, y: 848 });
    runFor(world, 1);

    expect(world.objects.map((o) => o.id)).toEqual([neighbour]);
    expect(world.objects.some((o) => o.id === red)).toBe(false);
    expect(world.blasts).toEqual([]);
    expect(world.debrisParticles).toEqual([]);
    expect(world.rubble).toEqual([]);
    expect(world.droplets).toEqual([]);
    expect(objectById(world, neighbour).durability).toBe(durability);
  });

  it('erases only the Pieces it touches; the rest of the Line stays fixed, and a red one sets off nothing', () => {
    const world = createWorld();
    const line = shelf(world, 'red');
    const before = world.lines[0]!.pieces;
    runFor(world, 0.2);

    eraseAt(world, onPiece(4));
    runFor(world, 1);

    const pieces = world.lines.find((l) => l.id === line)!.pieces;
    expect(pieces.map((p) => p.index)).toEqual([0, 1, 2, 3, 5, 6, 7, 8, 9]);
    expect(pieces).toEqual(before.filter((p) => p.index !== 4));
    expect(world.blasts).toEqual([]);
    expect(world.debrisParticles).toEqual([]);
  });

  it('erases every Piece a drag passes over, and the Line with its last', () => {
    const world = createWorld();
    const line = shelf(world);
    world.eraseAlong([onPiece(0), onPiece(2)], RADIUS);
    expect(world.lines[0]!.pieces.map((p) => p.index)).toEqual([3, 4, 5, 6, 7, 8, 9]);

    world.eraseAlong([onPiece(3), onPiece(9)], RADIUS);
    expect(world.lines.some((l) => l.id === line)).toBe(false);
  });

  it('lets a green Object stuck to what was erased fall free', () => {
    const world = createWorld();
    // A green box thrown up under a grey Line sticks to its underside.
    const box = drawObject(world, dragBox(530, 460, 40, 40), 'green');
    drawLine(
      world,
      [
        { x: 400, y: 400 },
        { x: 700, y: 400 },
      ],
      'grey',
    );
    world.togglePause();
    world.release(box, { x: 0, y: -400 });
    runFor(world, 1);
    expect(world.bonds.map((b) => b.object)).toEqual([box]);

    // Along the top of the Line, clear of the box.
    world.eraseAlong(
      [
        { x: 500, y: 388 },
        { x: 600, y: 388 },
      ],
      RADIUS,
    );
    runFor(world, 2);

    expect(world.bonds).toEqual([]);
    expect(world.lines).toHaveLength(1); // what the brush didn't touch stays
    expect(objectById(world, box).transform.y).toBeGreaterThan(800); // it fell to the ground
  });

  it('erases Rubble, Droplets in flight and Patches it touches, without a puff', () => {
    const world = createWorld();
    const { blue } = world.materials.colours;
    blue.outline.durability = 1;
    blue.outline.damageThreshold = 0;
    // Two boxes that break on the ground: one lets out Rubble, one a Spill.
    const pebbles = drawObject(world, dragBox(300, 700, 60, 60), 'blue');
    world.fillAt({ x: 330, y: 730 }, 'grey');
    const spill = drawObject(world, dragBox(600, 700, 60, 60), 'blue');
    world.fillAt({ x: 630, y: 730 }, 'blue');
    world.togglePause();
    world.release(pebbles);
    world.release(spill);
    while (world.droplets.length === 0) world.step();
    runFor(world, 3);
    expect(world.rubble.length).toBeGreaterThan(0);
    const patches = world.patches.length;
    expect(patches).toBeGreaterThan(0);
    expect(world.debrisParticles).toEqual([]);

    // Over the whole ground, but not down in the pit.
    world.eraseAlong(
      [
        { x: 0, y: 860 },
        { x: 1920, y: 860 },
      ],
      60,
    );

    expect(world.rubble).toEqual([]);
    // Some Droplets landed on the pit's wall, out of reach: those Patches stay.
    const lowest = ({ a, b }: Segment) => Math.min(a.y, b.y);
    expect(world.patches.length).toBeLessThan(patches);
    expect(world.patches.every((p) => lowest(p.segment) > 920)).toBe(true);
    expect(world.debrisParticles).toEqual([]);

    // A Spill caught in flight lays no Patches.
    const another = drawObject(world, dragBox(600, 500, 60, 60), 'blue');
    world.fillAt({ x: 630, y: 530 }, 'blue');
    world.release(another);
    while (world.droplets.length === 0) world.step();
    world.eraseAlong(
      [
        { x: 0, y: 700 },
        { x: 1920, y: 700 },
      ],
      400,
    );
    expect(world.droplets).toEqual([]);
    const left = world.patches;
    runFor(world, 2);
    expect(world.patches).toEqual(left);
  });

  it('takes erased Strokes out of the undo history', () => {
    const world = createWorld();
    const first = boxOnGround(world, 300);
    boxOnGround(world, 500);
    const line = shelf(world);

    eraseAt(world, { x: 500, y: 848 });
    eraseAt(world, onPiece(0));
    world.undo(); // what is left of the Line
    expect(world.lines).toEqual([]);
    world.undo(); // not the erased box, but the one before it
    expect(world.objects).toEqual([]);
    expect(line).toBeGreaterThan(first);
  });

  it('brings back what was erased while running with R', () => {
    const world = createWorld();
    shelf(world);
    const box = boxOnGround(world, 900);
    world.fillAt({ x: 900, y: 848 }, 'black');
    boxOnGround(world, 1100);
    world.togglePause();
    const start = contents(world);
    runFor(world, 0.5);

    eraseAt(world, onPiece(3));
    eraseAt(world, { x: 900, y: 848 });
    runFor(world, 0.5);
    expect(world.objects.some((o) => o.id === box)).toBe(false);
    world.reset();

    expect(contents(world)).toEqual(start);
  });

  it('keeps what was erased while paused erased through the next start and R', () => {
    const world = createWorld();
    shelf(world);
    boxOnGround(world, 900);
    runFor(world, 0.5);
    world.togglePause();

    eraseAt(world, onPiece(3));
    eraseAt(world, { x: 900, y: 848 });
    const erased = contents(world);
    runFor(world, 0.5);
    world.reset();

    expect(contents(world)).toEqual(erased);
    expect(world.objects).toEqual([]);
    expect(world.lines[0]!.pieces).toHaveLength(9);
  });
});
