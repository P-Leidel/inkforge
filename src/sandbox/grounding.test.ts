import { describe, expect, it } from 'vitest';
import { applyTransform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';
import { dragAlong, dragBox, dragCircle } from '../stroke/pointer-paths';
import type { LineView, SandboxWorld } from './sandbox-world';
import {
  drawLine,
  drawObject,
  drawPost,
  entriesOf,
  hear,
  objectById,
  runFor,
  sandboxWorlds,
} from './test-support';

/** The sandbox Arena's flat ground is at this y. */
const GROUND = 880;

const createWorld = sandboxWorlds();

function lineById(world: SandboxWorld, id: number): LineView {
  const line = world.lines.find((l) => l.id === id);
  if (!line) throw new Error(`no Line ${id}`);
  return line;
}

/** Where a Line's first point is now, in the world. */
function startOf(line: LineView): Vec2 {
  return applyTransform(line.segments[0]!.a, line.transform);
}

describe('Grounded Lines', () => {
  it('grounds a Line drawn down to the Terrain, and leaves it fixed', () => {
    const world = createWorld();
    const id = drawLine(world, [
      { x: 400, y: 700 },
      { x: 400, y: GROUND },
    ]);

    const line = lineById(world, id);
    expect(line.grounded).toBe(true);
    expect(line.frozen).toBe(false);
    runFor(world, 1);
    expect(startOf(lineById(world, id))).toEqual({ x: 400, y: 700 });
  });

  it('grounds a Line touching the Terrain within the tolerance, and not one further off', () => {
    const world = createWorld();
    const { groundTolerance } = world.materials;
    // A Line is 8 px thick: its edge is 4 px from its centre line.
    const near = drawLine(world, [
      { x: 300, y: GROUND - 4 - groundTolerance + 1 },
      { x: 500, y: GROUND - 4 - groundTolerance + 1 },
    ]);
    const far = drawLine(world, [
      { x: 600, y: GROUND - 4 - groundTolerance - 2 },
      { x: 800, y: GROUND - 4 - groundTolerance - 2 },
    ]);

    expect(lineById(world, near).grounded).toBe(true);
    expect(lineById(world, far).grounded).toBe(false);
  });

  it('grounds a Line through other Grounded Lines, transitively', () => {
    const world = createWorld();
    const post = drawLine(world, [
      { x: 400, y: GROUND },
      { x: 400, y: 700 },
    ]);
    const arm = drawLine(world, [
      { x: 400, y: 700 },
      { x: 600, y: 700 },
    ]);
    const hook = drawLine(world, [
      { x: 600, y: 700 },
      { x: 600, y: 600 },
    ]);

    for (const id of [post, arm, hook]) expect(lineById(world, id).grounded).toBe(true);
  });

  it('is not grounded by an Object, however it touches it', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(400, GROUND - 60, 60, 60));
    const id = drawLine(world, [
      { x: 380, y: GROUND - 64 },
      { x: 480, y: GROUND - 64 },
    ]);

    expect(objectById(world, box).frozen).toBe(true);
    expect(lineById(world, id).grounded).toBe(false);
  });

  it('grounds a Frozen Line once a Grounded one is drawn to touch it', () => {
    const world = createWorld();
    const shelf = drawLine(world, [
      { x: 400, y: 700 },
      { x: 600, y: 700 },
    ]);
    expect(lineById(world, shelf).grounded).toBe(false);

    drawLine(world, [
      { x: 500, y: GROUND },
      { x: 500, y: 700 },
    ]);

    const line = lineById(world, shelf);
    expect(line.grounded).toBe(true);
    runFor(world, 1);
    expect(startOf(lineById(world, shelf))).toEqual({ x: 400, y: 700 });
  });

  it('says a Frozen Line it grounds is reformed, its Pieces neither going nor coming', () => {
    const world = createWorld();
    const shelf = drawLine(world, [
      { x: 400, y: 700 },
      { x: 600, y: 700 },
    ]);
    const heard = hear(world);

    const post = drawLine(world, [
      { x: 500, y: GROUND },
      { x: 500, y: 700 },
    ]);

    const entries = heard();
    expect(entriesOf(entries, 'went')).toEqual([]);
    expect(entriesOf(entries, 'added').every(({ what }) => what.id === post)).toBe(true);
    expect(entriesOf(entries, 'reformed').map(({ id }) => id)).toEqual([shelf]);
  });
});

describe('Lines that are not Grounded', () => {
  it('hang Frozen where they are drawn, until Released', () => {
    const world = createWorld();
    const id = drawLine(world, [
      { x: 400, y: 500 },
      { x: 600, y: 500 },
    ]);

    expect(lineById(world, id)).toMatchObject({ grounded: false, frozen: true });
    runFor(world, 1);
    expect(startOf(lineById(world, id)).y).toBeCloseTo(500, 6);

    expect(world.releaseAt({ x: 500, y: 502 })).toBe(true);
    runFor(world, 0.3);
    const line = lineById(world, id);
    expect(line.frozen).toBe(false);
    expect(startOf(line).y).toBeGreaterThan(520);
  });

  it('fall as one rigid body in their drawn shape, every Piece kept', () => {
    const world = createWorld();
    const id = drawLine(world, [
      { x: 400, y: 500 },
      { x: 500, y: 450 },
      { x: 600, y: 500 },
    ]);
    const before = lineById(world, id);
    runFor(world, 0);
    world.release(id);
    runFor(world, 0.3);

    const after = lineById(world, id);
    expect(after.pieces.length).toBe(before.pieces.length);
    expect(after.segments).toEqual(before.segments);
    // The shape stays: the distance between its two ends is as drawn.
    const first = applyTransform(after.segments[0]!.a, after.transform);
    const last = applyTransform(after.segments.at(-1)!.b, after.transform);
    expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeCloseTo(200, 0);
    expect(first.y).toBeGreaterThan(520);
  });

  it('are freed by a hard hit, as a Frozen Object is', () => {
    const world = createWorld();
    const id = drawLine(world, [
      { x: 400, y: 600 },
      { x: 600, y: 600 },
    ]);
    const boulder = drawObject(world, dragBox(470, 300, 60, 60), 'black');
    world.fillAt({ x: 500, y: 330 }, 'black');
    runFor(world, 0);
    world.release(boulder);
    runFor(world, 1);

    expect(lineById(world, id).frozen).toBe(false);
  });

  it('are freed by a strong enough Blast', () => {
    const world = createWorld();
    const id = drawLine(world, [
      { x: 440, y: GROUND - 50 },
      { x: 560, y: GROUND - 50 },
    ]);
    expect(lineById(world, id).grounded).toBe(false);
    // A red ball dropped hard onto the ground under it explodes as it lands.
    const bomb = drawObject(world, dragCircle({ x: 500, y: GROUND - 23 }, 15), 'red');
    runFor(world, 0);
    world.release(bomb, { x: 0, y: 900 });
    runFor(world, 0.3);

    expect(world.objects.find((o) => o.id === bomb)).toBeUndefined();
    expect(lineById(world, id).frozen).toBe(false);
  });

  it('are separate bodies when they touch: Releasing one leaves the other Frozen', () => {
    const world = createWorld();
    const first = drawLine(world, [
      { x: 400, y: 400 },
      { x: 600, y: 400 },
    ]);
    const second = drawLine(world, [
      { x: 600, y: 400 },
      { x: 800, y: 400 },
    ]);
    runFor(world, 0);

    expect(world.release(first)).toBe(true);
    runFor(world, 0.2);

    expect(lineById(world, first).frozen).toBe(false);
    expect(lineById(world, second).frozen).toBe(true);
  });

  it('damage the Enemies they fall on, a black bar more than a grey one', () => {
    const hurt = (colour: 'grey' | 'black'): number => {
      const world = createWorld();
      const enemy = world.spawn('crawler', { x: 500, y: GROUND - 40 });
      const before = world.enemies.find((e) => e.id === enemy)!.hp;
      const id = drawLine(
        world,
        [
          { x: 440, y: 500 },
          { x: 560, y: 500 },
        ],
        colour,
      );
      runFor(world, 0);
      world.release(id);
      runFor(world, 1.2);
      const after = world.enemies.find((e) => e.id === enemy);
      return before - (after?.hp ?? 0);
    };

    const grey = hurt('grey');
    const black = hurt('black');
    expect(black).toBeGreaterThan(0);
    expect(black).toBeGreaterThan(grey);
  });

  it('stay loose once fallen, and are Frozen again in the Aftermath when at rest', () => {
    const world = createWorld();
    const id = drawLine(world, [
      { x: 400, y: 700 },
      { x: 600, y: 700 },
    ]);
    runFor(world, 0);
    world.release(id);
    runFor(world, 2);

    const landed = lineById(world, id);
    expect(landed.grounded).toBe(false);
    expect(landed.frozen).toBe(false);
    world.pause();
    world.freezeResting();
    expect(lineById(world, id)).toMatchObject({ grounded: false, frozen: true });

    // Touching a Grounded Line now doesn't ground it: it fell.
    const resting = lineById(world, id);
    const end = applyTransform(resting.segments.at(-1)!.b, resting.transform);
    drawLine(world, [
      { x: end.x + 2, y: GROUND },
      { x: end.x + 2, y: end.y - 30 },
    ]);
    expect(lineById(world, id).grounded).toBe(false);
  });

  it('lose a Piece that breaks off, and the rest stays one body', () => {
    const world = createWorld();
    const id = drawLine(world, [
      { x: 300, y: 500 },
      { x: 600, y: 500 },
    ]);
    const pieces = lineById(world, id).pieces.length;
    const heard = hear(world);

    world.eraseAlong([{ x: 310, y: 500 }], 4);

    expect(lineById(world, id).pieces.length).toBe(pieces - 1);
    expect(entriesOf(heard(), 'went').map(({ why }) => why)).toEqual(['erased']);
    runFor(world, 0);
    expect(world.release(id)).toBe(true);
    runFor(world, 0.3);
    expect(lineById(world, id).pieces.length).toBe(pieces - 1);
  });

  it('come back from R as they were when physics started', () => {
    const world = createWorld();
    const id = drawLine(world, [
      { x: 400, y: 500 },
      { x: 600, y: 500 },
    ]);
    runFor(world, 0);
    world.release(id);
    runFor(world, 0.5);
    world.reset();

    expect(lineById(world, id)).toMatchObject({ frozen: true, grounded: false });
    expect(startOf(lineById(world, id))).toEqual({ x: 400, y: 500 });
  });

  it('say whether they will be Grounded before they are drawn', () => {
    const world = createWorld();
    const grounded = world.submitStroke(
      dragAlong([
        { x: 400, y: 700 },
        { x: 400, y: GROUND },
      ]),
      'grey',
      { accept: () => false },
    );
    const loose = world.submitStroke(
      dragAlong([
        { x: 400, y: 500 },
        { x: 600, y: 500 },
      ]),
      'grey',
      { accept: () => false },
    );

    expect(
      grounded.kind === 'declined' && grounded.made.kind === 'line' && grounded.made.grounded,
    ).toBe(true);
    expect(loose.kind === 'declined' && loose.made.kind === 'line' && loose.made.grounded).toBe(
      false,
    );
  });

  it('keeps a green Object stuck to a Frozen Line when a Grounded one grounds it, where it hangs', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(530, 460, 40, 40), 'green');
    const shelf = drawLine(world, [
      { x: 400, y: 400 },
      { x: 700, y: 400 },
    ]);
    // Up into the Frozen shelf, too gently to wake it, where it sticks.
    world.togglePause();
    world.release(box, { x: 0, y: -400 });
    runFor(world, 1);
    expect(world.bonds.map((bond) => bond.object)).toEqual([box]);
    expect(lineById(world, shelf)).toMatchObject({ grounded: false, frozen: true });
    const hung = objectById(world, box).transform;

    drawPost(world, { x: 400, y: 400 });

    expect(lineById(world, shelf)).toMatchObject({ grounded: true });
    expect(world.bonds.map((bond) => bond.object)).toEqual([box]);
    runFor(world, 2);
    expect(world.bonds.map((bond) => bond.object)).toEqual([box]);
    expect(objectById(world, box).transform.x).toBeCloseTo(hung.x, 0);
    expect(objectById(world, box).transform.y).toBeCloseTo(hung.y, 0);
  });
});
