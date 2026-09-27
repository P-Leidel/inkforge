import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { drawLine, objectById, runFor, sandboxWorlds } from '../sandbox/test-support';
import { dragAlong, dragBox } from '../stroke/pointer-paths';
import { DrawingInput, ERASER_RADIUS, type DrawingCommands, type Flash } from './drawing-input';

const createWorld = sandboxWorlds();

/**
 * Drawing input over a real Sandbox world, with a count of the refusal
 * previews it asked for and every path it erased along.
 */
function drawingOver(world: SandboxWorld) {
  const asked = { previews: 0, erased: [] as Vec2[][] };
  const commands: DrawingCommands = {
    submitStroke: (samples, colour) => world.submitStroke(samples, colour),
    previewStroke: (samples) => {
      asked.previews++;
      return world.previewStroke(samples);
    },
    fillAt: (point, colour) => world.fillAt(point, colour),
    releaseAt: (point) => world.releaseAt(point),
    eraseAlong: (path, radius) => {
      asked.erased.push([...path]);
      world.eraseAlong(path, radius);
    },
    undo: () => world.undo(),
  };
  return { input: new DrawingInput(commands), asked };
}

/** Presses the left button at the first sample, moves through the rest and lets go. */
function drag(input: DrawingInput, samples: readonly Vec2[]): Flash | null {
  input.press(samples[0]!, 'left');
  for (const sample of samples.slice(1)) input.move(sample);
  return input.release();
}

/** A left click at `point`. */
const click = (input: DrawingInput, point: Vec2) => drag(input, [point]);

/** A 60 px box hanging in mid-air, drawn through drawing input; returns its id. */
function box(world: SandboxWorld, input: DrawingInput): number {
  expect(drag(input, dragBox(370, 400, 60, 60))).toBeNull();
  return world.objects[world.objects.length - 1]!.id;
}

/** Inside the box `box` draws. */
const inBox = { x: 400, y: 430 };

describe('Drawing input', () => {
  describe('a press, a drag and a release', () => {
    it('turns a drag into a Line in the picked Colour', () => {
      const world = createWorld();
      const { input } = drawingOver(world);
      input.pick('blue');

      const flash = drag(
        input,
        dragAlong([
          { x: 200, y: 500 },
          { x: 500, y: 500 },
        ]),
      );

      expect(flash).toBeNull();
      expect(world.lines.map((line) => line.colour)).toEqual(['blue']);
      expect(world.objects).toEqual([]);
    });

    it('turns a closing drag into an Object', () => {
      const world = createWorld();
      const { input } = drawingOver(world);

      box(world, input);

      expect(world.objects.map((object) => object.colour)).toEqual(['grey']);
      expect(world.lines).toEqual([]);
    });

    it('fills the Object under a click in the picked Colour', () => {
      const world = createWorld();
      const { input } = drawingOver(world);
      const id = box(world, input);
      input.pick('red');

      expect(click(input, inBox)).toBeNull();

      expect(objectById(world, id).fill).toBe('red');
    });

    it('draws a Line for a short drag inside an Object, and leaves it hollow', () => {
      const world = createWorld();
      const { input } = drawingOver(world);
      const id = box(world, input);

      drag(
        input,
        dragAlong([
          { x: 385, y: 430 },
          { x: 415, y: 430 },
        ]),
      );

      expect(world.lines).toHaveLength(1);
      expect(objectById(world, id).fill).toBeNull();
    });

    it('carries a Stroke on in a Colour picked while drawing it', () => {
      const world = createWorld();
      const { input } = drawingOver(world);
      const samples = dragAlong([
        { x: 200, y: 500 },
        { x: 500, y: 500 },
      ]);

      input.press(samples[0]!, 'left');
      for (const sample of samples.slice(1, 50)) input.move(sample);
      input.pick('green');
      for (const sample of samples.slice(50)) input.move(sample);
      input.release();

      expect(world.lines.map((line) => line.colour)).toEqual(['green']);
    });

    it('takes back the most recent Stroke on undo', () => {
      const world = createWorld();
      const { input } = drawingOver(world);
      box(world, input);

      input.undo();

      expect(world.objects).toEqual([]);
    });
  });

  describe('flashes', () => {
    it('flashes the Outline of an Object already filled, closed, with "Already filled" at the pointer', () => {
      const world = createWorld();
      const { input } = drawingOver(world);
      const id = box(world, input);
      click(input, inBox);

      const flash = click(input, inBox);

      expect(flash).not.toBeNull();
      expect(flash!.message).toBe('Already filled');
      expect(flash!.pointer).toEqual(inBox);
      expect(flash!.path[flash!.path.length - 1]).toEqual(flash!.path[0]);
      const xs = flash!.path.map((p) => p.x);
      const ys = flash!.path.map((p) => p.y);
      expect(Math.min(...xs)).toBeCloseTo(370, -1);
      expect(Math.max(...xs)).toBeCloseTo(430, -1);
      expect(Math.min(...ys)).toBeCloseTo(400, -1);
      expect(Math.max(...ys)).toBeCloseTo(460, -1);
      expect(objectById(world, id).fill).toBe('grey');
    });

    it('flashes a rejected Stroke along its path, with its reason at the pointer', () => {
      const world = createWorld();
      const { input } = drawingOver(world);
      box(world, input);
      const over = dragBox(390, 420, 60, 60);

      const flash = drag(input, over);

      expect(flash).toEqual({
        path: over,
        message: 'Overlaps Terrain or an Object',
        pointer: over[over.length - 1],
      });
      expect(world.objects).toHaveLength(1);
    });

    it('flashes nothing for a click that misses every Object', () => {
      const world = createWorld();
      const { input } = drawingOver(world);

      expect(click(input, { x: 600, y: 300 })).toBeNull();
    });
  });

  describe('the refusal preview', () => {
    it('shows a closing Stroke over an Object as refused, worked out again only on new samples', () => {
      const world = createWorld();
      const { input, asked } = drawingOver(world);
      box(world, input);
      const over = dragBox(390, 420, 60, 60);
      const half = over.length / 2;

      input.press(over[0]!, 'left');
      for (const sample of over.slice(1, half)) input.move(sample);
      // Still open: nothing to refuse, and nothing asked.
      expect(input.preview()).toMatchObject({ kind: 'stroke', refused: false });
      expect(asked.previews).toBe(0);

      for (const sample of over.slice(half)) input.move(sample);
      expect(input.preview()).toMatchObject({ kind: 'stroke', samples: over, refused: true });
      expect(input.preview()).toMatchObject({ refused: true });
      expect(asked.previews).toBe(1);

      input.move(over[1]!);
      input.preview();
      expect(asked.previews).toBe(2);
    });

    it('shows a closing Stroke in the open as not refused', () => {
      const world = createWorld();
      const { input } = drawingOver(world);

      input.press({ x: 600, y: 300 }, 'left');
      for (const sample of dragBox(600, 300, 60, 60).slice(1)) input.move(sample);

      expect(input.preview()).toMatchObject({ kind: 'stroke', colour: 'grey', refused: false });
    });

    it('shows a dab of the Colour at the pointer between Strokes, and nothing off the canvas', () => {
      const world = createWorld();
      const { input } = drawingOver(world);
      input.pick('black');

      input.move({ x: 300, y: 200 });
      expect(input.preview()).toEqual({
        kind: 'stroke',
        colour: 'black',
        samples: null,
        refused: false,
        pointer: { x: 300, y: 200 },
      });

      input.leave();
      expect(input.preview()).toMatchObject({ pointer: null });
    });
  });

  describe('the Eraser', () => {
    /** A Line at y = 700 from x = 200 to x = 680: ten Pieces of 48 px. */
    const shelf = (world: SandboxWorld) =>
      drawLine(world, [
        { x: 200, y: 700 },
        { x: 680, y: 700 },
      ]);
    /** The middle of Piece `k` of the shelf. */
    const onPiece = (k: number) => ({ x: 200 + 48 * k + 24, y: 700 });
    const piecesLeft = (world: SandboxWorld) => world.lines[0]!.pieces.map((p) => p.index);

    it('shows its brush at the pointer', () => {
      const world = createWorld();
      const { input } = drawingOver(world);
      input.pick('eraser');
      input.move({ x: 300, y: 200 });

      expect(input.preview()).toEqual({ kind: 'brush', pointer: { x: 300, y: 200 } });
    });

    it('erases along its path in chunks, once a frame, and carries on from where it got to', () => {
      const world = createWorld();
      shelf(world);
      const { input, asked } = drawingOver(world);
      input.pick('eraser');

      input.press(onPiece(0), 'left');
      expect(piecesLeft(world)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

      input.move(onPiece(1));
      input.move(onPiece(2));
      expect(piecesLeft(world)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      input.tick();
      expect(piecesLeft(world)).toEqual([3, 4, 5, 6, 7, 8, 9]);

      input.tick(); // held still
      input.move(onPiece(3));
      input.release();
      input.tick(); // let go: nothing more

      expect(piecesLeft(world)).toEqual([4, 5, 6, 7, 8, 9]);
      expect(asked.erased).toEqual([
        [onPiece(0)],
        [onPiece(0), onPiece(1), onPiece(2)],
        [onPiece(2)],
        [onPiece(2), onPiece(3)],
      ]);
    });

    it('erases with its brush radius', () => {
      const world = createWorld();
      shelf(world);
      const { input } = drawingOver(world);
      input.pick('eraser');

      click(input, { x: onPiece(0).x, y: 700 + 4 + ERASER_RADIUS + 1 });
      expect(piecesLeft(world)).toHaveLength(10);
      click(input, { x: onPiece(0).x, y: 700 + 4 + ERASER_RADIUS - 1 });
      expect(piecesLeft(world)).toHaveLength(9);
    });

    it('drops the Stroke being drawn when it is picked', () => {
      const world = createWorld();
      const { input } = drawingOver(world);
      const samples = dragAlong([
        { x: 200, y: 500 },
        { x: 500, y: 500 },
      ]);

      input.press(samples[0]!, 'left');
      for (const sample of samples.slice(1, 50)) input.move(sample);
      input.pick('eraser');
      expect(input.preview()).toMatchObject({ kind: 'brush' });
      input.pick('grey');
      for (const sample of samples.slice(50)) input.move(sample);

      expect(input.release()).toBeNull();
      expect(input.preview()).toMatchObject({ samples: null });
      expect(world.lines).toEqual([]);
    });

    it('stops erasing when a Colour is picked while it is held', () => {
      const world = createWorld();
      shelf(world);
      const { input, asked } = drawingOver(world);
      input.pick('eraser');

      input.press(onPiece(0), 'left');
      input.pick('grey');
      input.move(onPiece(1));
      input.tick();
      input.release();

      expect(asked.erased).toEqual([[onPiece(0)]]);
      expect(world.lines).toHaveLength(1);
    });
  });

  describe('the right button', () => {
    it('Releases the Frozen Object under it while physics runs', () => {
      const world = createWorld();
      const { input } = drawingOver(world);
      const id = box(world, input);
      runFor(world, 0.1);
      expect(objectById(world, id).frozen).toBe(true);

      input.press(inBox, 'right');
      input.release();

      expect(objectById(world, id).frozen).toBe(false);
      expect(objectById(world, id).fill).toBeNull();
    });

    it('neither draws nor erases', () => {
      const world = createWorld();
      const { input, asked } = drawingOver(world);

      input.press({ x: 200, y: 500 }, 'right');
      input.move({ x: 500, y: 500 });
      input.release();
      input.pick('eraser');
      input.press({ x: 200, y: 500 }, 'right');
      input.tick();
      input.release();

      expect(world.lines).toEqual([]);
      expect(asked.erased).toEqual([]);
    });
  });
});
