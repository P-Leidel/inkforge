import { describe, expect, it } from 'vitest';
import { fillInk, lineInk, outlineInk } from '../materials/ink';
import { dragAlong, dragBox } from '../stroke/pointer-paths';
import { LINE_THICKNESS } from '../stroke/stroke-rules';
import type { SandboxWorld } from './sandbox-world';
import { drawLine, drawObject, objectById, sandboxWorlds } from './test-support';

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
    expect(outcome).toEqual({
      kind: 'line',
      id: outcome.id,
      colour: 'blue',
      ink: lineInk(segments, thickness),
    });
    expect(outcome.ink).toBeCloseTo(480 * LINE_THICKNESS, -1);
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

describe('What undo takes back', () => {
  it('reports nothing with an empty history', () => {
    const world = createWorld();

    expect(world.undo()).toEqual({ kind: 'nothing' });
  });

  it('reports an undone Object with its Colour and its Outline’s Ink', () => {
    const world = createWorld();
    const drawn = world.submitStroke(dragBox(300, 300, 60, 60), 'red');

    expect(world.undo()).toEqual(drawn);
    expect(world.objects).toEqual([]);
    expect(world.undo()).toEqual({ kind: 'nothing' });
  });

  it("reports a Fill's Ink apart from its Outline's: the Fill first, then the Object", () => {
    const world = createWorld();
    const drawn = world.submitStroke(dragBox(300, 300, 60, 60), 'grey');
    const filled = world.fillAt({ x: 330, y: 330 }, 'blue');
    if (drawn.kind !== 'object' || filled.kind !== 'filled') throw new Error('expected a Fill');

    expect(world.undo()).toEqual({
      kind: 'fill',
      id: drawn.id,
      colour: 'blue',
      ink: filled.ink,
    });
    expect(objectById(world, drawn.id).fill).toBeNull();
    expect(world.undo()).toEqual(drawn);
  });

  it('reports a whole Line with its Ink as drawn, and all of it still standing', () => {
    const world = createWorld();
    const drawn = world.submitStroke(dragAlong(SHELF), 'green');
    if (drawn.kind !== 'line') throw new Error('expected a Line');

    expect(world.undo()).toEqual({ ...drawn, standing: drawn.ink });
    expect(world.lines).toEqual([]);
  });

  it('reports a partly gone Line with its Ink as drawn and the Ink of its Pieces still there', () => {
    const world = createWorld();
    const line = drawLine(world, SHELF, 'grey');
    const drawn = lineById(world, line);
    const ink = lineInk(drawn.segments, drawn.thickness);
    world.eraseAlong([{ x: 200 + 48 * 4 + 24, y: 700 }], 12); // Piece 4
    const left = lineById(world, line);
    expect(left.pieces).toHaveLength(9);

    const undone = world.undo();

    expect(undone).toEqual({
      kind: 'line',
      id: line,
      colour: 'grey',
      ink,
      standing: lineInk(left.segments, left.thickness),
    });
    if (undone.kind === 'line') expect(undone.standing).toBeCloseTo((ink * 9) / 10, 6);
  });
});
