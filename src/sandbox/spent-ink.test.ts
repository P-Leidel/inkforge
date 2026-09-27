import { describe, expect, it } from 'vitest';
import { fillInk, lineInk, outlineInk } from '../materials/ink';
import { dragAlong, dragBox } from '../stroke/pointer-paths';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import type { MadeStroke, SandboxWorld } from './sandbox-world';
import { drawLine, drawObject, hear, objectById, runFor, sandboxWorlds } from './test-support';

const createWorld = sandboxWorlds();

/** A horizontal path at y = 700 from x = 200 to x = 680: a Line of ten Pieces of 48 px. */
const SHELF = [
  { x: 200, y: 700 },
  { x: 680, y: 700 },
];

/** The Line with this id, as the world shows it. */
function lineById(world: SandboxWorld, id: number) {
  const line = world.lines.find((l) => l.id === id);
  if (!line) throw new Error(`no Line ${id}`);
  return line;
}

/** A 60 px box with its top-left corner at (300, 300). */
const box60 = (world: SandboxWorld, colour: 'grey' | 'blue' | 'red' = 'grey') =>
  drawObject(world, dragBox(300, 300, 60, 60), colour);

describe('What a Stroke spends', () => {
  it('reports a Line in its Colour with its Ink: its length × the Line thickness', () => {
    const world = createWorld();

    const outcome = world.submitStroke(dragAlong(SHELF), 'blue');

    expect(outcome.kind).toBe('line');
    if (outcome.kind !== 'line') return;
    const { segments, thickness } = lineById(world, outcome.id);
    expect(thickness).toBe(LINE_THICKNESS);
    expect(outcome).toMatchObject({
      kind: 'line',
      id: outcome.id,
      colour: 'blue',
      ink: lineInk(segments, thickness),
    });
    expect(outcome.ink).toBeCloseTo(480 * LINE_THICKNESS, -1);
  });

  it("reports each Piece's Ink, and the Pieces add up to the Line", () => {
    const world = createWorld();

    const outcome = world.submitStroke(dragAlong(SHELF), 'grey');

    if (outcome.kind !== 'line') throw new Error('expected a Line');
    const { pieces, thickness } = lineById(world, outcome.id);
    expect(outcome.pieces).toHaveLength(10);
    expect(outcome.pieces).toEqual(pieces.map((piece) => lineInk(piece.segments, thickness)));
    const sum = outcome.pieces.reduce((total, ink) => total + ink, 0);
    expect(sum).toBeCloseTo(outcome.ink, 6);
  });

  it('measures a Line by the thickness it was drawn with', () => {
    const world = createWorld();

    const thin = world.submitStroke(dragAlong(SHELF), 'grey', { lineThickness: 4 });
    const normal = world.submitStroke(
      dragAlong(SHELF.map(({ x, y }) => ({ x, y: y - 100 }))),
      'grey',
    );

    if (thin.kind !== 'line' || normal.kind !== 'line') throw new Error('expected two Lines');
    expect(thin.ink).toBe(lineInk(lineById(world, thin.id).segments, 4));
    expect(thin.ink).toBeCloseTo(normal.ink / 2, 6);
  });

  it("reports an Object in its Colour with its Outline's Ink", () => {
    const world = createWorld();

    const outcome = world.submitStroke(dragBox(300, 300, 60, 60), 'red');

    expect(outcome.kind).toBe('object');
    if (outcome.kind !== 'object') return;
    expect(outcome).toEqual({
      kind: 'object',
      id: outcome.id,
      colour: 'red',
      ink: outlineInk(objectById(world, outcome.id).outline),
    });
    expect(outcome.ink).toBeCloseTo(240 * LINE_THICKNESS, -1);
  });

  it("reports a Fill in its Colour with its Ink, the Object's area", () => {
    const world = createWorld();
    const box = box60(world);

    const outcome = world.fillAt({ x: 330, y: 330 }, 'blue');

    expect(outcome).toEqual({
      kind: 'filled',
      id: box,
      colour: 'blue',
      ink: fillInk(objectById(world, box).outline),
    });
    if (outcome.kind === 'filled') expect(outcome.ink).toBeCloseTo(3600, -2);
  });
});

describe('What a declined Stroke would have spent', () => {
  it('adds nothing, and says what the Line would have been with its Ink', () => {
    const world = createWorld();
    const heard = hear(world);
    const offered: MadeStroke[] = [];

    const outcome = world.submitStroke(dragAlong(SHELF), 'red', {
      accept: (made) => {
        offered.push(made);
        return false;
      },
    });

    expect(outcome.kind).toBe('declined');
    if (outcome.kind !== 'declined') return;
    expect(offered).toEqual([outcome.made]);
    expect(outcome.made).toMatchObject({ kind: 'line', colour: 'red' });
    expect(outcome.made.ink).toBeCloseTo(480 * LINE_THICKNESS, -1);
    expect(outcome.path[0]!.x).toBeCloseTo(200, 0);
    expect(outcome.path.at(-1)!.x).toBeCloseTo(680, 0);
    expect(world.lines).toEqual([]);
    expect(world.bodyCount).toBe(1);
    expect(heard()).toEqual([]);
  });

  it('says what the Object would have been, and its Outline as the path', () => {
    const world = createWorld();

    const outcome = world.submitStroke(dragBox(300, 300, 60, 60), 'grey', { accept: () => false });

    expect(outcome.kind).toBe('declined');
    if (outcome.kind !== 'declined') return;
    expect(outcome.made).toMatchObject({ kind: 'object', colour: 'grey' });
    expect(outcome.made.ink).toBeCloseTo(240 * LINE_THICKNESS, -1);
    expect(outcome.path.at(-1)).toEqual(outcome.path[0]);
    expect(world.objects).toEqual([]);
  });

  it('adds the Stroke when it is accepted, as without a check', () => {
    const world = createWorld();

    const outcome = world.submitStroke(dragAlong(SHELF), 'grey', { accept: () => true });

    expect(outcome.kind).toBe('line');
    expect(world.lines).toHaveLength(1);
  });
});

describe('What taking back a Stroke or a Fill gives back', () => {
  it('reports a taken back Object with its Colour and its Outline’s Ink', () => {
    const world = createWorld();
    const drawn = world.submitStroke(dragBox(300, 300, 60, 60), 'red');
    if (drawn.kind !== 'object') throw new Error('expected an Object');

    expect(world.removeStroke(drawn.id)).toEqual({ ...drawn, fill: null });
    expect(world.objects).toEqual([]);
  });

  it("reports a Fill's Ink apart from its Outline's, and the Object stays", () => {
    const world = createWorld();
    const drawn = world.submitStroke(dragBox(300, 300, 60, 60), 'grey');
    const filled = world.fillAt({ x: 330, y: 330 }, 'blue');
    if (drawn.kind !== 'object' || filled.kind !== 'filled') throw new Error('expected a Fill');

    expect(world.removeFill(drawn.id)).toEqual({
      kind: 'fill',
      id: drawn.id,
      colour: 'blue',
      ink: filled.ink,
    });
    expect(objectById(world, drawn.id).fill).toBeNull();
    expect(world.removeStroke(drawn.id)).toEqual({ ...drawn, fill: null });
  });

  it('reports the Fill that went with an Object taken back whole', () => {
    const world = createWorld();
    const box = box60(world);
    const filled = world.fillAt({ x: 330, y: 330 }, 'black');
    if (filled.kind !== 'filled') throw new Error('expected a Fill');

    expect(world.removeStroke(box)).toMatchObject({
      kind: 'object',
      fill: { colour: 'black', ink: filled.ink },
    });
  });

  it('reports a whole Line with all of its Ink', () => {
    const world = createWorld();
    const drawn = world.submitStroke(dragAlong(SHELF), 'green');
    if (drawn.kind !== 'line') throw new Error('expected a Line');

    expect(world.removeStroke(drawn.id)).toEqual({
      kind: 'line',
      id: drawn.id,
      colour: 'green',
      ink: drawn.ink,
    });
    expect(world.lines).toEqual([]);
  });

  it('reports a partly erased Line with the Ink of its Pieces still there', () => {
    const world = createWorld();
    const line = drawLine(world, SHELF, 'grey');
    const drawn = lineById(world, line);
    const ink = lineInk(drawn.segments, drawn.thickness);
    world.eraseAlong([{ x: 200 + 48 * 4 + 24, y: 700 }], 12); // Piece 4
    const left = lineById(world, line);
    expect(left.pieces).toHaveLength(9);

    const taken = world.removeStroke(line);

    expect(taken).toEqual({
      kind: 'line',
      id: line,
      colour: 'grey',
      ink: lineInk(left.segments, left.thickness),
    });
    if (taken.kind === 'line') expect(taken.ink).toBeCloseTo((ink * 9) / 10, 6);
  });

  it('reports a Line with broken Pieces with only the Ink of its Pieces still standing', () => {
    const world = createWorld();
    const drawn = world.submitStroke(dragAlong(SHELF), 'grey');
    if (drawn.kind !== 'line') throw new Error('expected a Line');
    const rock = drawObject(world, dragBox(410, 220, 60, 60), 'black');
    world.fillAt({ x: 440, y: 250 }, 'black');
    runFor(world, 0);
    world.release(rock);
    runFor(world, 1.5);
    world.remove(rock);
    const left = lineById(world, drawn.id);
    expect(left.pieces.length).toBeLessThan(10);
    const standing = left.pieces.reduce((sum, piece) => sum + drawn.pieces[piece.index]!, 0);

    const taken = world.removeStroke(drawn.id);

    expect(taken.kind).toBe('line');
    if (taken.kind === 'line') expect(taken.ink).toBeCloseTo(standing, 6);
  });

  it('says a Stroke or a Fill that is already gone is gone', () => {
    const world = createWorld();
    const box = box60(world);
    const hollow = drawObject(world, dragBox(500, 300, 60, 60));
    world.fillAt({ x: 330, y: 330 }, 'grey');
    world.removeStroke(box);
    const heard = hear(world);

    expect(world.removeStroke(box)).toEqual({ kind: 'gone', id: box });
    expect(world.removeFill(box)).toEqual({ kind: 'gone', id: box });
    expect(world.removeFill(hollow)).toEqual({ kind: 'gone', id: hollow });
    expect(world.removeStroke(999)).toEqual({ kind: 'gone', id: 999 });
    expect(heard()).toEqual([]);
    expect(world.objects.map((o) => o.id)).toEqual([hollow]);
  });
});
