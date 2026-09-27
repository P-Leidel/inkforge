import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import type { Game } from '../game/game';
import { inLineLength } from '../game/ink-table';
import { games } from '../game/test-support';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { drawLine, objectById } from '../sandbox/test-support';
import { dragAlong, dragBox } from '../stroke/pointer-paths';
import { DrawingInput, ERASER_RADIUS, type DrawingCommands, type Flash } from './drawing-input';

const createGame = games();

/**
 * Drawing input over a real Game, with a count of the refusal previews it
 * asked for and every path it erased along.
 */
function drawingOver(game: Game) {
  const asked = { previews: 0, estimates: 0, erased: [] as Vec2[][] };
  const commands: DrawingCommands = {
    submitStroke: (samples, colour) => game.submitStroke(samples, colour),
    previewStroke: (samples) => {
      asked.previews++;
      return game.previewStroke(samples);
    },
    fillAt: (point, colour) => game.fillAt(point, colour),
    estimateStroke: (samples, colour) => {
      asked.estimates++;
      return game.estimateStroke(samples, colour);
    },
    estimateFill: (point, colour) => game.estimateFill(point, colour),
    releaseAt: (point) => game.releaseAt(point),
    eraseAlong: (path, radius) => {
      asked.erased.push([...path]);
      game.eraseAlong(path, radius);
    },
    undo: () => game.undo(),
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
      const game = createGame(false);
      const world = game.world;
      const { input } = drawingOver(game);
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
      const game = createGame(false);
      const world = game.world;
      const { input } = drawingOver(game);

      box(world, input);

      expect(world.objects.map((object) => object.colour)).toEqual(['grey']);
      expect(world.lines).toEqual([]);
    });

    it('fills the Object under a click in the picked Colour', () => {
      const game = createGame(false);
      const world = game.world;
      const { input } = drawingOver(game);
      const id = box(world, input);
      input.pick('red');

      expect(click(input, inBox)).toBeNull();

      expect(objectById(world, id).fill).toBe('red');
    });

    it('draws a Line for a short drag inside an Object, and leaves it hollow', () => {
      const game = createGame(false);
      const world = game.world;
      const { input } = drawingOver(game);
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
      const game = createGame(false);
      const world = game.world;
      const { input } = drawingOver(game);
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
      const game = createGame(false);
      const world = game.world;
      const { input } = drawingOver(game);
      box(world, input);

      input.undo();

      expect(world.objects).toEqual([]);
    });
  });

  describe('flashes', () => {
    it('flashes the Outline of an Object already filled, closed, with "Already filled" at the pointer', () => {
      const game = createGame(false);
      const world = game.world;
      const { input } = drawingOver(game);
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
      const game = createGame(false);
      const world = game.world;
      const { input } = drawingOver(game);
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

    it('flashes "Not enough <Colour>" along a Stroke its Tank can\'t pay for, and draws nothing', () => {
      const game = createGame(true);
      const world = game.world;
      const { input } = drawingOver(game);
      input.pick('red');
      const long = dragAlong([
        { x: 200, y: 300 },
        { x: 1400, y: 300 },
      ]); // 1200 of red's 1000

      const flash = drag(input, long);

      expect(flash).toMatchObject({ message: 'Not enough red', pointer: long[long.length - 1] });
      expect(flash!.path[0]!.x).toBeCloseTo(200, 0);
      expect(flash!.path[flash!.path.length - 1]!.x).toBeCloseTo(1400, 0);
      expect(world.lines).toEqual([]);
      expect(game.tank('red')).toBe(game.maximum('red'));
    });

    it('flashes "Not enough <Colour>" around an Object its Fill\'s Tank can\'t pay for', () => {
      const game = createGame(true);
      const world = game.world;
      const { input } = drawingOver(game);
      expect(drag(input, dragBox(300, 200, 300, 300))).toBeNull(); // in grey
      input.pick('red'); // a Fill of about 2800 of red's 1000

      const flash = click(input, { x: 450, y: 350 });

      expect(flash).toMatchObject({ message: 'Not enough red', pointer: { x: 450, y: 350 } });
      expect(flash!.path[flash!.path.length - 1]).toEqual(flash!.path[0]);
      expect(world.objects[0]!.fill).toBeNull();
    });

    it('flashes nothing for a click that misses every Object', () => {
      const game = createGame(false);
      const { input } = drawingOver(game);

      expect(click(input, { x: 600, y: 300 })).toBeNull();
    });
  });

  describe('the refusal preview', () => {
    it('shows a closing Stroke over an Object as refused, worked out again only on new samples', () => {
      const game = createGame(false);
      const world = game.world;
      const { input, asked } = drawingOver(game);
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
      const game = createGame(false);
      const { input } = drawingOver(game);

      input.press({ x: 600, y: 300 }, 'left');
      for (const sample of dragBox(600, 300, 60, 60).slice(1)) input.move(sample);

      expect(input.preview()).toMatchObject({ kind: 'stroke', colour: 'grey', refused: false });
    });

    it('shows a dab of the Colour at the pointer between Strokes, and nothing off the canvas', () => {
      const game = createGame(false);
      const { input } = drawingOver(game);
      input.pick('black');

      input.move({ x: 300, y: 200 });
      expect(input.preview()).toEqual({
        kind: 'stroke',
        colour: 'black',
        samples: null,
        refused: false,
        pointer: { x: 300, y: 200 },
        cost: null,
      });

      input.leave();
      expect(input.preview()).toMatchObject({ pointer: null });
    });
  });

  describe('the cost preview', () => {
    const line = dragAlong([
      { x: 200, y: 300 },
      { x: 800, y: 300 },
    ]);
    const costOf = (input: DrawingInput) => {
      const preview = input.preview();
      return preview.kind === 'stroke' ? preview.cost : null;
    };

    it('grows with the path while drawing', () => {
      const game = createGame(true);
      const { input } = drawingOver(game);
      input.press(line[0]!, 'left');
      for (const sample of line.slice(1, 100)) input.move(sample);
      const early = costOf(input)!;
      for (const sample of line.slice(100)) input.move(sample);
      const late = costOf(input)!;

      expect(early.colour).toBe('grey');
      expect(late.price).toBeGreaterThan(early.price);
      expect(inLineLength(late.price)).toBeCloseTo(600, -1);
      expect(late.over).toBe(false);
    });

    it('prices a closing path as an Object', () => {
      const game = createGame(true);
      const { input } = drawingOver(game);
      const samples = dragBox(370, 400, 100, 100);
      input.press(samples[0]!, 'left');
      for (const sample of samples.slice(1)) input.move(sample);

      // An open path of the same samples would cost its length, not the ring's perimeter.
      expect(inLineLength(costOf(input)!.price)).toBeCloseTo(400, -1);
    });

    it('is worked out again only on new samples', () => {
      const game = createGame(true);
      const { input, asked } = drawingOver(game);
      input.press(line[0]!, 'left');
      input.move(line[1]!);
      input.preview();
      input.preview();
      expect(asked.estimates).toBe(1);
      input.move(line[2]!);
      input.preview();
      expect(asked.estimates).toBe(2);
    });

    it("shows a hollow Object's Fill cost on hover, and none over a filled one or nothing", () => {
      const game = createGame(true);
      const world = game.world;
      const { input } = drawingOver(game);
      box(world, input);

      input.move(inBox);
      const hover = costOf(input)!;
      const flash = click(input, inBox);
      expect(flash).toBeNull();
      expect(hover.price).toBeCloseTo(game.ink.fillPrice * 3600, -2);

      input.move(inBox);
      expect(costOf(input)).toBeNull();
      input.move({ x: 900, y: 200 });
      expect(costOf(input)).toBeNull();
    });

    it('is red when it is more than the Tank holds', () => {
      const game = createGame(true);
      const { input } = drawingOver(game);
      input.pick('red');
      const long = dragAlong([
        { x: 200, y: 300 },
        { x: 1400, y: 300 },
      ]);
      input.press(long[0]!, 'left');
      for (const sample of long.slice(1, 200)) input.move(sample);
      expect(costOf(input)!.over).toBe(false);
      for (const sample of long.slice(200)) input.move(sample);
      expect(costOf(input)!.over).toBe(true);
      expect(input.release()!.message).toBe('Not enough red');
    });

    it('shows nothing with Ink costs off', () => {
      const game = createGame(false);
      const { input } = drawingOver(game);
      input.press(line[0]!, 'left');
      for (const sample of line.slice(1)) input.move(sample);
      expect(costOf(input)).toBeNull();
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
      const game = createGame(false);
      const { input } = drawingOver(game);
      input.pick('eraser');
      input.move({ x: 300, y: 200 });

      expect(input.preview()).toEqual({ kind: 'brush', pointer: { x: 300, y: 200 } });
    });

    it('erases along its path in chunks, once a frame, and carries on from where it got to', () => {
      const game = createGame(false);
      const world = game.world;
      shelf(world);
      const { input, asked } = drawingOver(game);
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
      const game = createGame(false);
      const world = game.world;
      shelf(world);
      const { input } = drawingOver(game);
      input.pick('eraser');

      click(input, { x: onPiece(0).x, y: 700 + 4 + ERASER_RADIUS + 1 });
      expect(piecesLeft(world)).toHaveLength(10);
      click(input, { x: onPiece(0).x, y: 700 + 4 + ERASER_RADIUS - 1 });
      expect(piecesLeft(world)).toHaveLength(9);
    });

    it('drops the Stroke being drawn when it is picked', () => {
      const game = createGame(false);
      const world = game.world;
      const { input } = drawingOver(game);
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
      const game = createGame(false);
      const world = game.world;
      shelf(world);
      const { input, asked } = drawingOver(game);
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
      const game = createGame(false);
      const world = game.world;
      const { input } = drawingOver(game);
      const id = box(world, input);
      game.togglePause();
      for (let k = 0; k < 6; k++) game.step();
      expect(objectById(world, id).frozen).toBe(true);

      input.press(inBox, 'right');
      input.release();

      expect(objectById(world, id).frozen).toBe(false);
      expect(objectById(world, id).fill).toBeNull();
    });

    it('neither draws nor erases', () => {
      const game = createGame(false);
      const world = game.world;
      const { input, asked } = drawingOver(game);

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
