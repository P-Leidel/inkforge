import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import type { LineView, SandboxWorld } from './sandbox-world';
import {
  drawLine,
  drawPost,
  entriesOf,
  hear,
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
    expect(line).toMatchObject({ grounded: false, frozen: false });
    expect(line.pieces.map((p) => p.index)).toEqual([1, 2, 3, 4]);
    expect(wentOf(heard())).toEqual([
      `piece ${id}.0 erased`,
      ...[1, 2, 3, 4].map((index) => `piece ${id}.${index} cut-off`),
    ]);
    // It came back at once, where it stood, as one falling body.
    expect(entriesOf(heard(), 'added').map(({ what }) => what)).toHaveLength(4);
    expect(bottomOf(line)).toBeCloseTo(GROUND - PIECE, 6);
    runFor(world, 1);
    expect(bottomOf(lineById(world, id))).toBeGreaterThan(GROUND - 10);
  });

  it('leaves a wall standing when a Piece above its foot goes, and what was above it falls', () => {
    const world = createWorld();
    const id = wall(world, 400);

    eraseAt(world, { x: 400, y: GROUND - 2.5 * PIECE }); // Piece 2

    expect(lineById(world, id)).toMatchObject({ grounded: true });
    expect(lineById(world, id).pieces.map((p) => p.index)).toEqual([0, 1]);
    const top = world.lines.find((l) => l.id !== id)!;
    expect(top).toMatchObject({ grounded: false, frozen: false });
    expect(top.id).toBeGreaterThan(id);
    expect(top.pieces.map((p) => p.index)).toEqual([3, 4]);
  });

  it('says a Line split before its cut-off run comes back under its new id', () => {
    const world = createWorld();
    const id = wall(world, 400);
    const heard = hear(world);

    eraseAt(world, { x: 400, y: GROUND - 2.5 * PIECE });

    const top = world.lines.find((l) => l.id !== id)!;
    const order = heard().map((entry) =>
      entry.kind === 'split'
        ? `split ${entry.id} into ${entry.into}`
        : entry.kind === 'added' && entry.what.thing === 'piece'
          ? `added ${entry.what.id}.${entry.what.index}`
          : entry.kind,
    );
    expect(order.filter((e) => e.startsWith('split') || e.startsWith('added'))).toEqual([
      `split ${id} into ${top.id}`,
      `added ${top.id}.3`,
      `added ${top.id}.4`,
    ]);
  });

  it('lets a platform hanging off a wall fall when the wall Piece it touches goes', () => {
    const world = createWorld();
    const post = wall(world, 400);
    const platform = drawLine(world, [
      { x: 400, y: GROUND - 5 * PIECE },
      { x: 600, y: GROUND - 5 * PIECE },
    ]);
    expect(lineById(world, platform).grounded).toBe(true);

    eraseAt(world, { x: 400, y: GROUND - 4.5 * PIECE }); // the wall's top Piece

    expect(lineById(world, post)).toMatchObject({ grounded: true });
    expect(lineById(world, platform)).toMatchObject({ grounded: false, frozen: false });
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
    expect(lineById(world, strut).grounded).toBe(true);

    eraseAt(world, { x: 400, y: GROUND - 4.5 * PIECE });

    expect(lineById(world, platform)).toMatchObject({ grounded: true });
    expect(lineById(world, strut)).toMatchObject({ grounded: true });
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
    const pieces = world.lines.reduce((sum, l) => sum + l.pieces.length, 0);

    eraseAt(world, { x: 400, y: GROUND - PIECE / 2 });

    for (const id of [post, arm, hook])
      expect(lineById(world, id)).toMatchObject({ grounded: false, frozen: false });
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
    expect(lineById(world, platform).grounded).toBe(false);

    world.reset();

    expect(lineById(world, post)).toMatchObject({ grounded: true });
    expect(lineById(world, post).pieces).toHaveLength(5);
    expect(lineById(world, platform)).toMatchObject({ grounded: true });
    expect(bottomOf(lineById(world, platform))).toBeCloseTo(GROUND - 5 * PIECE, 6);
  });

  it('lets a cut-off run lie loose, and the Aftermath Freezes it again at rest', () => {
    const world = createWorld();
    const id = wall(world, 400);
    eraseAt(world, { x: 400, y: GROUND - PIECE / 2 });
    runFor(world, 3);
    world.pause();

    world.freezeResting();

    expect(lineById(world, id)).toMatchObject({ grounded: false, frozen: true });
    // Fallen, it never becomes Grounded again, even drawn against.
    const end = worldSegments(lineById(world, id)).at(-1)!.b;
    drawLine(world, [
      { x: end.x + 6, y: GROUND },
      { x: end.x + 6, y: end.y - 30 },
    ]);
    expect(lineById(world, id).grounded).toBe(false);
  });

  it('keeps each Piece’s damage through a collapse', () => {
    const world = createWorld();
    const id = wall(world, 400);
    const before = lineById(world, id).pieces.map((p) => p.durability);

    eraseAt(world, { x: 400, y: GROUND - PIECE / 2 });

    expect(lineById(world, id).pieces.map((p) => p.durability)).toEqual(before.slice(1));
  });

  it('leaves a Line that isn’t Grounded one body when a Piece in its middle goes', () => {
    const world = createWorld();
    const id = drawLine(world, [
      { x: 300, y: 500 },
      { x: 600, y: 500 },
    ]);

    eraseAt(world, { x: 300 + 2.5 * PIECE, y: 500 });

    expect(world.lines.map((l) => l.id)).toEqual([id]);
    expect(lineById(world, id)).toMatchObject({ grounded: false, frozen: true });
  });

  it('collapses what an undone Line held up', () => {
    const world = createWorld();
    const shelf = drawLine(world, [
      { x: 400, y: 600 },
      { x: 600, y: 600 },
    ]);
    const post = drawPost(world, { x: 500, y: 600 });
    expect(lineById(world, shelf).grounded).toBe(true);

    world.removeStroke(post);

    expect(lineById(world, shelf)).toMatchObject({ grounded: false, frozen: false });
  });
});
