import { describe, expect, it } from 'vitest';
import { applyTransform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec2';
import { dragBox, dragCircle } from '../stroke/pointer-paths';
import type { LineView, SandboxWorld } from './sandbox-world';
import {
  drawLine,
  drawObject,
  drawPost,
  entriesOf,
  hear,
  objectById,
  piecesOf,
  runFor,
  sandboxWorlds,
  wentOf,
  worldSegments,
} from './test-support';

/** The sandbox Arena's flat ground is at this y. */
const GROUND = 880;
/** A Piece is 48 px long. */
const PIECE = 48;

const createWorld = sandboxWorlds();

function lineById(world: SandboxWorld, id: number): LineView {
  const line = world.lines.find((l) => l.id === id);
  if (!line) throw new Error(`no Line ${id}`);
  return line;
}

/** Erases just the Piece under `point`. */
const eraseAt = (world: SandboxWorld, point: Vec2) => world.eraseAlong([point], 4);

/** The lowest point of a Line's centre line where it is now. */
const bottomOf = (line: LineView) =>
  Math.max(...worldSegments(line).flatMap(({ a, b }) => [a.y, b.y]));

/** A wall standing on the ground at `x`, five Pieces tall, drawn up from the ground: Piece 0 at the bottom. */
function wall(world: SandboxWorld, x: number): number {
  return drawLine(world, [
    { x, y: GROUND },
    { x, y: GROUND - 5 * PIECE },
  ]);
}

describe('Collapse: what a Piece that goes held up falls', () => {
  it('lets the rest of a wall fall when the only Piece touching the Terrain goes', () => {
    const world = createWorld();
    const id = wall(world, 400);
    const heard = hear(world);

    eraseAt(world, { x: 400, y: GROUND - PIECE / 2 });

    const line = lineById(world, id);
    expect(line.runs).toMatchObject([{ grounded: false, frozen: false }]);
    expect(piecesOf(line).map((p) => p.index)).toEqual([1, 2, 3, 4]);
    // Its other Pieces stay: it changed form at once, where it stood, to one falling body.
    const entries = heard();
    expect(wentOf(entries)).toEqual([`piece ${id}.0 erased`]);
    expect(entriesOf(entries, 'added')).toEqual([]);
    expect(entriesOf(entries, 'reformed').map((entry) => entry.id)).toEqual([id]);
    expect(bottomOf(line)).toBeCloseTo(GROUND - PIECE, 6);
    runFor(world, 1);
    expect(bottomOf(lineById(world, id))).toBeGreaterThan(GROUND - 10);
  });

  it('lets what a removed Line held up fall', () => {
    const world = createWorld();
    const post = wall(world, 400);
    const shelf = drawLine(world, [
      { x: 400, y: GROUND - 5 * PIECE },
      { x: 600, y: GROUND - 5 * PIECE },
    ]);
    expect(lineById(world, shelf).runs).toMatchObject([{ grounded: true }]);

    world.remove(post);

    expect(lineById(world, shelf).runs).toMatchObject([{ grounded: false, frozen: false }]);
  });

  it('leaves a wall standing when a Piece above its foot goes, and what was above it falls as a Run of the same Line', () => {
    const world = createWorld();
    const id = wall(world, 400);

    eraseAt(world, { x: 400, y: GROUND - 2.5 * PIECE }); // Piece 2

    expect(world.lines.map((l) => l.id)).toEqual([id]);
    const { runs } = lineById(world, id);
    expect(runs).toMatchObject([
      { grounded: true, frozen: false },
      { grounded: false, frozen: false },
    ]);
    expect(runs.map((run) => run.pieces.map((p) => p.index))).toEqual([
      [0, 1],
      [3, 4],
    ]);
    runFor(world, 1);
    // Only the cut-off Run falls, onto what stands.
    const [foot, top] = lineById(world, id).runs;
    expect(Math.max(...foot!.segments.flatMap(({ a, b }) => [a.y, b.y]))).toBe(GROUND);
    expect(top!.transform.y).toBeGreaterThan(runs[1]!.transform.y + PIECE / 2);
  });

  it('says a Line cut in two is reformed, its Pieces neither going nor coming', () => {
    const world = createWorld();
    const id = wall(world, 400);
    const heard = hear(world);

    eraseAt(world, { x: 400, y: GROUND - 2.5 * PIECE });

    const entries = heard();
    expect(wentOf(entries)).toEqual([`piece ${id}.2 erased`]);
    expect(entriesOf(entries, 'added')).toEqual([]);
    expect(entriesOf(entries, 'reformed').map((entry) => entry.id)).toEqual([id]);
  });

  it('takes the whole of a Line cut in two away when it is undone', () => {
    const world = createWorld();
    const id = wall(world, 400);
    eraseAt(world, { x: 400, y: GROUND - 2.5 * PIECE });

    world.removeStroke(id);

    expect(world.lines).toEqual([]);
  });

  it('lets a platform hanging off a wall fall when the wall Piece it touches goes', () => {
    const world = createWorld();
    const post = wall(world, 400);
    const platform = drawLine(world, [
      { x: 400, y: GROUND - 5 * PIECE },
      { x: 600, y: GROUND - 5 * PIECE },
    ]);
    expect(lineById(world, platform).runs).toMatchObject([{ grounded: true }]);

    eraseAt(world, { x: 400, y: GROUND - 4.5 * PIECE }); // the wall's top Piece

    expect(lineById(world, post).runs).toMatchObject([{ grounded: true }]);
    expect(lineById(world, platform).runs).toMatchObject([{ grounded: false, frozen: false }]);
    runFor(world, 0.5);
    expect(bottomOf(lineById(world, platform))).toBeGreaterThan(GROUND - 5 * PIECE + 20);
  });

  it('keeps the platform when another connection still grounds it', () => {
    const world = createWorld();
    wall(world, 400);
    const platform = drawLine(world, [
      { x: 400, y: GROUND - 5 * PIECE },
      { x: 600, y: GROUND - 5 * PIECE },
    ]);
    // A strut, then a post under the platform's far end that grounds both.
    const strut = drawLine(world, [
      { x: 700, y: GROUND - 3 * PIECE },
      { x: 600, y: GROUND - 3 * PIECE },
    ]);
    drawPost(world, { x: 600, y: GROUND - 5 * PIECE });
    expect(lineById(world, strut).runs).toMatchObject([{ grounded: true }]);

    eraseAt(world, { x: 400, y: GROUND - 4.5 * PIECE });

    expect(lineById(world, platform).runs).toMatchObject([{ grounded: true }]);
    expect(lineById(world, strut).runs).toMatchObject([{ grounded: true }]);
    runFor(world, 0.5);
    expect(bottomOf(lineById(world, platform))).toBeCloseTo(GROUND - 5 * PIECE, 6);
  });

  it('lets several Lines cut off together fall, each as its own body, transitively', () => {
    const world = createWorld();
    const post = wall(world, 400);
    const arm = drawLine(world, [
      { x: 400, y: GROUND - 5 * PIECE },
      { x: 600, y: GROUND - 5 * PIECE },
    ]);
    const hook = drawLine(world, [
      { x: 600, y: GROUND - 5 * PIECE },
      { x: 600, y: GROUND - 7 * PIECE },
    ]);
    const bodies = world.bodyCount;
    const pieces = world.lines.reduce((sum, l) => sum + piecesOf(l).length, 0);

    eraseAt(world, { x: 400, y: GROUND - PIECE / 2 });

    for (const id of [post, arm, hook])
      expect(lineById(world, id).runs).toMatchObject([{ grounded: false, frozen: false }]);
    // Every fixed Piece of theirs, but the erased one, became one of three bodies.
    expect(world.bodyCount).toBe(bodies - pieces + 3);
    runFor(world, 2);
    for (const id of [post, arm, hook])
      expect(bottomOf(lineById(world, id))).toBeGreaterThan(GROUND - 3 * PIECE);
  });

  it('collapses what an erased supporting Piece held while running, and R brings it back', () => {
    const world = createWorld();
    const post = wall(world, 400);
    const platform = drawLine(world, [
      { x: 400, y: GROUND - 5 * PIECE },
      { x: 600, y: GROUND - 5 * PIECE },
    ]);
    runFor(world, 0); // the snapshot
    runFor(world, 0.2);

    eraseAt(world, { x: 400, y: GROUND - PIECE / 2 });
    runFor(world, 1);
    expect(lineById(world, platform).runs).toMatchObject([{ grounded: false }]);

    world.reset();

    expect(lineById(world, post).runs).toMatchObject([{ grounded: true }]);
    expect(piecesOf(lineById(world, post))).toHaveLength(5);
    expect(lineById(world, platform).runs).toMatchObject([{ grounded: true }]);
    expect(bottomOf(lineById(world, platform))).toBeCloseTo(GROUND - 5 * PIECE, 6);
  });

  it('lets a cut-off run lie loose, and the Aftermath Freezes it again at rest', () => {
    const world = createWorld();
    const id = wall(world, 400);
    eraseAt(world, { x: 400, y: GROUND - PIECE / 2 });
    runFor(world, 3);
    world.pause();

    world.freezeResting();

    expect(lineById(world, id).runs).toMatchObject([{ grounded: false, frozen: true }]);
    // Fallen, it never becomes Grounded again, even drawn against.
    const end = worldSegments(lineById(world, id)).at(-1)!.b;
    drawLine(world, [
      { x: end.x + 6, y: GROUND },
      { x: end.x + 6, y: end.y - 30 },
    ]);
    expect(lineById(world, id).runs).toMatchObject([{ grounded: false }]);
  });

  it('keeps each Piece’s damage through a collapse', () => {
    const world = createWorld();
    const id = wall(world, 400);
    const before = piecesOf(lineById(world, id)).map((p) => p.durability);

    eraseAt(world, { x: 400, y: GROUND - PIECE / 2 });

    expect(piecesOf(lineById(world, id)).map((p) => p.durability)).toEqual(before.slice(1));
  });

  it('splits a Frozen Line where a Piece in its middle goes: each side hangs on, and Releases alone', () => {
    const world = createWorld();
    const id = drawLine(world, [
      { x: 300, y: 500 },
      { x: 600, y: 500 },
    ]);
    const where = (line: LineView) =>
      line.runs.flatMap((run) =>
        run.pieces.map((piece) => ({
          index: piece.index,
          ends: piece.segments.flatMap(({ a, b }) =>
            [a, b].map((p) => applyTransform(p, run.transform)),
          ),
        })),
      );
    const before = where(lineById(world, id));
    const heard = hear(world);

    eraseAt(world, { x: 300 + 2.5 * PIECE, y: 500 });

    const line = lineById(world, id);
    expect(line.runs).toMatchObject([
      { grounded: false, frozen: true },
      { grounded: false, frozen: true },
    ]);
    expect(line.runs.map((run) => run.pieces.map((p) => p.index))).toEqual([
      [0, 1],
      [3, 4, 5],
    ]);
    // Each hangs where it was.
    for (const { index, ends } of where(line)) {
      const was = before.find((piece) => piece.index === index)!.ends;
      ends.forEach((end, k) => {
        expect(end.x).toBeCloseTo(was[k]!.x, 3);
        expect(end.y).toBeCloseTo(was[k]!.y, 3);
      });
    }
    expect(entriesOf(heard(), 'reformed')).toMatchObject([{ kind: 'reformed', id }]);

    world.togglePause();
    expect(world.releaseAt({ x: 300 + 0.5 * PIECE, y: 500 })).toBe(true);
    runFor(world, 0.5);

    const [left, right] = lineById(world, id).runs;
    expect(left).toMatchObject({ frozen: false });
    expect(left!.transform.y).toBeGreaterThan(500);
    expect(right).toMatchObject({ frozen: true });
  });

  it('splits a falling Line where a Piece in its middle goes: each side falls on as it fell', () => {
    const world = createWorld();
    const id = drawLine(world, [
      { x: 300, y: 300 },
      { x: 600, y: 300 },
    ]);
    world.togglePause();
    world.release(id, { x: 120, y: 0 });
    world.togglePause();
    const velocity = lineById(world, id).runs[0]!.velocity;

    eraseAt(world, { x: 300 + 2.5 * PIECE, y: 300 });

    const runs = lineById(world, id).runs;
    expect(runs).toMatchObject([
      { grounded: false, frozen: false },
      { grounded: false, frozen: false },
    ]);
    for (const run of runs) {
      expect(run.velocity.x).toBeCloseTo(velocity.x, 3);
      expect(run.velocity.y).toBeCloseTo(velocity.y, 3);
    }

    runFor(world, 2);

    // Fallen, they never stand again: not even on the ground.
    expect(lineById(world, id).runs).toMatchObject([{ grounded: false }, { grounded: false }]);
  });

  it('keeps a Frozen Line one body when a Piece of it goes, if what is left still touches', () => {
    const world = createWorld();
    // A hook: its end comes back to rest against its first Piece.
    const id = drawLine(world, [
      { x: 300, y: 300 },
      { x: 492, y: 300 },
      { x: 492, y: 492 },
      { x: 396, y: 492 },
      { x: 396, y: 310 },
    ]);
    expect(lineById(world, id).runs).toHaveLength(1);

    eraseAt(world, { x: 492, y: 300 + 2.5 * PIECE });

    expect(lineById(world, id).runs).toMatchObject([{ grounded: false, frozen: true }]);
  });

  it('collapses what an undone Line held up', () => {
    const world = createWorld();
    const shelf = drawLine(world, [
      { x: 400, y: 600 },
      { x: 600, y: 600 },
    ]);
    const post = drawPost(world, { x: 500, y: 600 });
    expect(lineById(world, shelf).runs).toMatchObject([{ grounded: true }]);

    world.removeStroke(post);

    expect(lineById(world, shelf).runs).toMatchObject([{ grounded: false, frozen: false }]);
  });

  it('keeps a green Object stuck to a Line that collapses, and it rides the Line down', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(530, 460, 40, 40), 'green');
    const post = drawPost(world, { x: 400, y: 400 });
    const shelf = drawLine(world, [
      { x: 400, y: 400 },
      { x: 700, y: 400 },
    ]);
    // Up into the shelf, where it sticks.
    world.togglePause();
    world.release(box, { x: 0, y: -400 });
    runFor(world, 1);
    expect(world.bonds.map((bond) => bond.object)).toEqual([box]);
    const hung = objectById(world, box).transform.y;

    eraseAt(world, { x: 400, y: GROUND - PIECE / 2 }); // the post's foot

    expect(lineById(world, shelf).runs).toMatchObject([{ grounded: false }]);
    expect(lineById(world, post).runs).toMatchObject([{ grounded: false }]);
    expect(world.bonds.map((bond) => bond.object)).toEqual([box]);
    runFor(world, 2);
    expect(world.bonds.map((bond) => bond.object)).toEqual([box]);
    expect(objectById(world, box).transform.y).toBeGreaterThan(hung + 100);
  });

  it('lets a Blast still spreading hurt each Piece of a Line it cuts off only once', () => {
    const world = createWorld();
    const id = wall(world, 560);
    // A red-filled ball dropped beside the wall's foot, fast enough to explode as it lands.
    const bomb = drawObject(world, dragCircle({ x: 500, y: GROUND - 43 }, 40), 'red');
    world.fillAt({ x: 500, y: GROUND - 43 }, 'red');
    world.togglePause();
    world.release(bomb, { x: 0, y: 900 });
    // Until the ring has reached the wall's lowest three Pieces, and not its top two.
    while ((world.blasts[0]?.radius ?? 0) < 100) world.step();
    const durability = () => piecesOf(lineById(world, id)).map((p) => p.durability);
    const struck = durability();
    expect(struck[1]).toBeLessThan(struck[4]!);
    expect(struck[2]).toBeLessThan(struck[4]!);

    eraseAt(world, { x: 560, y: GROUND - PIECE / 2 });
    for (let step = 0; step < 4; step++) world.step();

    expect(lineById(world, id).runs).toMatchObject([{ grounded: false }]);
    expect(durability().slice(0, 2)).toEqual(struck.slice(1, 3));
  });
});

describe('Release: a Line cut in two Runs', () => {
  /**
   * A shelf on a post, its Piece over the post erased, both halves fallen
   * and Frozen again where they rest: one Line, two Frozen Runs.
   */
  function twoFrozenRuns(world: SandboxWorld): number {
    // Eight Pieces; the post under the middle of Piece 4.
    const shelf = drawLine(world, [
      { x: 300, y: 600 },
      { x: 300 + 8 * PIECE, y: 600 },
    ]);
    drawPost(world, { x: 300 + 4.5 * PIECE, y: 600 });
    eraseAt(world, { x: 300 + 4.5 * PIECE, y: 600 });
    runFor(world, 3);
    world.pause();
    world.freezeResting();
    world.togglePause();
    expect(lineById(world, shelf).runs).toMatchObject([
      { grounded: false, frozen: true },
      { grounded: false, frozen: true },
    ]);
    return shelf;
  }

  it('Releases only the Run under the pointer', () => {
    const world = createWorld();
    const shelf = twoFrozenRuns(world);
    const [left] = lineById(world, shelf).runs;
    const { a, b } = worldSegments({ ...lineById(world, shelf), runs: [left!] })[0]!;
    const heard = hear(world);

    expect(world.releaseAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })).toBe(true);

    expect(lineById(world, shelf).runs).toMatchObject([{ frozen: false }, { frozen: true }]);
    expect(entriesOf(heard(), 'released').map((entry) => entry.id)).toEqual([shelf]);
  });

  it('Releases every Frozen Run of a Line Released by its id', () => {
    const world = createWorld();
    const shelf = twoFrozenRuns(world);

    expect(world.release(shelf)).toBe(true);

    expect(lineById(world, shelf).runs).toMatchObject([{ frozen: false }, { frozen: false }]);
  });
});
