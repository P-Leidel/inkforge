import { describe, expect, it, vi } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import { DEFAULT_RULES } from '../game/defence-loop';
import type { Game } from '../game/game';
import { inLineLength } from '../game/ink-table';
import { createEnemyTable } from '../materials/enemy-table';
import { games } from '../game/test-support';
import { SANDBOX_ARENA } from '../sandbox/arena';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { drawLine, objectById } from '../sandbox/test-support';
import { dragAlong, dragBox } from '../stroke/pointer-paths';
import type { EraseOutcome, UndoOutcome } from '../game/game';
import { DrawingInput, ERASER_RADIUS, type DrawingCommands, type Flash } from './drawing-input';

const createGame = games();

/**
 * Drawing input over a real Game, with a count of the looks it took, of the
 * Stroke pipeline's runs behind them, and every path it erased along.
 */
function drawingOver(game: Game) {
  const asked = { strokeLooks: 0, fillLooks: 0, erased: [] as Vec2[][] };
  const pipeline = vi.spyOn(game.world, 'previewStroke');
  const commands: DrawingCommands = {
    submitStroke: (samples, colour) => game.submitStroke(samples, colour),
    fillAt: (point, colour) => game.fillAt(point, colour),
    lookAtStroke: (samples) => {
      asked.strokeLooks++;
      return game.lookAtStroke(samples);
    },
    lookAtFill: (point) => {
      asked.fillLooks++;
      return game.lookAtFill(point);
    },
    prospect: (look, colour) => game.prospect(look, colour),
    world: game.world,
    releaseAt: (point) => game.releaseAt(point),
    eraseAlong: (path, radius) => {
      asked.erased.push([...path]);
      return game.eraseAlong(path, radius);
    },
    undo: () => game.undo(),
    get allowed() {
      return game.allowed;
    },
  };
  return {
    input: new DrawingInput(commands),
    asked,
    /** How many times the Stroke pipeline ran for a preview. */
    pipelineRuns: () => pipeline.mock.calls.length,
  };
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

/** The sandbox Arena's ground, where its Spawn stands. */
const GROUND = SANDBOX_ARENA.spawn.y;

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
      expect(game.tanks.red.spendable).toBe(game.tanks.red.maximum);
    });

    for (const inkCosts of [true, false]) {
      it(`flashes "Not in this Level" for a blue Stroke and Fill where the Level has no blue, Ink costs ${inkCosts ? 'on' : 'off'}`, () => {
        const game = createGame(inkCosts);
        game.editInk((table) => (table.tanks.blue = 0));
        const { input } = drawingOver(game);
        expect(drag(input, dragBox(300, 200, 300, 300))).toBeNull(); // in grey
        input.pick('blue');
        const line = dragAlong([
          { x: 200, y: 700 },
          { x: 300, y: 700 },
        ]);

        input.press(line[0]!, 'left');
        for (const sample of line.slice(1)) input.move(sample);
        expect(input.preview()).toMatchObject({ kind: 'stroke', refused: true });
        const stroke = input.release();
        const fill = click(input, { x: 450, y: 350 });

        expect(stroke).toMatchObject({ message: 'Not in this Level' });
        expect(fill).toMatchObject({ message: 'Not in this Level' });
        expect(game.world.lines).toEqual([]);
        expect(game.world.objects[0]!.fill).toBeNull();
      });
    }

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

  describe('the Waves', () => {
    /** A Game with Waves on, in a Wave of one Crawler that waits a long while for the next. */
    function inAWave(
      inkCosts: boolean,
      build?: (world: SandboxWorld, input: DrawingInput) => void,
    ) {
      const game = createGame(inkCosts, { waves: true });
      game.defence.edit((table) => {
        table.counts = { crawler: 1, runner: 0, heavy: 0 };
        table.gap = 100;
      });
      const drawing = drawingOver(game);
      game.togglePause();
      expect(game.defence.reading.phase).toBe('wave');
      build?.(game.world, drawing.input);
      return { game, ...drawing };
    }

    /** A Crawler sent in by hand onto the ground at x = 800; 20 px above its head, and far from it. */
    const crawler = (world: SandboxWorld) => world.spawn('crawler', { x: 800, y: GROUND - 22 });
    const near = dragAlong([
      { x: 760, y: GROUND - 62 },
      { x: 840, y: GROUND - 62 },
    ]);
    const far = dragAlong([
      { x: 600, y: 200 },
      { x: 800, y: 200 },
    ]);

    it.each([false, true])(
      'flash "Too close to an Enemy" along a Stroke near one, and draw nothing (Ink costs %s)',
      (inkCosts) => {
        const { game, input } = inAWave(inkCosts);
        crawler(game.world);

        const flash = drag(input, near);

        expect(flash).toMatchObject({
          message: 'Too close to an Enemy',
          pointer: near[near.length - 1],
        });
        expect(flash!.path[0]!.x).toBeCloseTo(760, 0);
        expect(game.world.lines).toEqual([]);
      },
    );

    it('let a Stroke away from the Enemies be drawn anywhere', () => {
      const { game, input } = inAWave(false);
      crawler(game.world);

      expect(drag(input, far)).toBeNull();
      expect(game.world.lines).toHaveLength(1);
    });

    it('show a Stroke near an Enemy as refused while it is drawn', () => {
      const { game, input } = inAWave(false);
      crawler(game.world);

      input.press(near[0]!, 'left');
      for (const sample of near.slice(1)) input.move(sample);

      expect(input.preview()).toMatchObject({ kind: 'stroke', refused: true });
    });

    it('flash "Not now" in an Intermission, with building between Waves off, for a Stroke or a Fill', () => {
      const game = createGame(false, {
        waves: true,
        rules: { ...DEFAULT_RULES, buildBetweenWaves: false },
      });
      game.waves = false;
      const { input } = drawingOver(game);
      box(game.world, input);
      game.waves = true;
      expect(game.defence.reading.phase).toBe('intermission');

      expect(drag(input, far)).toMatchObject({ message: 'Not now' });
      const flash = click(input, inBox);
      expect(flash).toMatchObject({ message: 'Not now', pointer: inBox });
      expect(flash!.path[flash!.path.length - 1]).toEqual(flash!.path[0]);
      expect(game.world.lines).toEqual([]);
      expect(game.world.objects[0]!.fill).toBeNull();
    });

    it('flash "Ink Core destroyed: R or Clear" once it is, for a Stroke or a Fill', () => {
      const enemies = createEnemyTable();
      enemies.coreHp = 1;
      const game = createGame(false, { worldOptions: { seed: 1, enemies } });
      const { input } = drawingOver(game);
      box(game.world, input);
      const { minX, maxY } = game.world.arena.core;
      game.world.spawn('crawler', { x: minX - 60, y: maxY - 20 });
      game.togglePause();
      for (let k = 0; k < 600 && game.isRunning; k++) game.step();
      expect(game.defence.reading.coreDestroyed).toBe(true);

      const message = 'Ink Core destroyed: R or Clear';
      expect(drag(input, far)).toMatchObject({ message });
      expect(click(input, inBox)).toMatchObject({ message, pointer: inBox });
      expect(game.world.lines).toEqual([]);
      expect(game.world.objects[0]!.fill).toBeNull();
    });

    it('Release a Frozen Object with the right button', () => {
      const { game, input } = inAWave(false, box);
      const id = game.world.objects[0]!.id;
      for (let k = 0; k < 6; k++) game.step();
      expect(objectById(game.world, id).frozen).toBe(true);

      input.press(inBox, 'right');
      input.release();

      expect(objectById(game.world, id).frozen).toBe(false);
    });
  });

  describe('the refusal preview', () => {
    it('shows a closing Stroke over an Object as refused, worked out again only on new samples', () => {
      const game = createGame(false);
      const world = game.world;
      const { input, pipelineRuns } = drawingOver(game);
      box(world, input);
      const over = dragBox(390, 420, 60, 60);
      const half = over.length / 2;
      const before = pipelineRuns();

      input.press(over[0]!, 'left');
      for (const sample of over.slice(1, half)) input.move(sample);
      // Still open: nothing to refuse, and the Stroke pipeline doesn't run.
      expect(input.preview()).toMatchObject({ kind: 'stroke', closes: false, refused: false });
      expect(pipelineRuns()).toBe(before);

      for (const sample of over.slice(half)) input.move(sample);
      expect(input.preview()).toMatchObject({
        kind: 'stroke',
        samples: over,
        closes: true,
        refused: true,
      });
      expect(input.preview()).toMatchObject({ refused: true });
      expect(pipelineRuns()).toBe(before + 1);

      input.move(over[1]!);
      input.preview();
      expect(pipelineRuns()).toBe(before + 2);
    });

    it('shows a closing Stroke in the open as not refused', () => {
      const game = createGame(false);
      const { input } = drawingOver(game);

      input.press({ x: 600, y: 300 }, 'left');
      for (const sample of dragBox(600, 300, 60, 60).slice(1)) input.move(sample);

      expect(input.preview()).toMatchObject({
        kind: 'stroke',
        colour: 'grey',
        closes: true,
        refused: false,
      });
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
        closes: false,
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

    it('leaves out the part lying on another Line', () => {
      const game = createGame(true);
      const { input } = drawingOver(game);
      drawLine(game.world, [
        { x: 200, y: 300 },
        { x: 500, y: 300 },
      ]);
      input.press(line[0]!, 'left');
      for (const sample of line.slice(1, 140)) input.move(sample);
      const along = costOf(input)!;
      for (const sample of line.slice(140)) input.move(sample);

      expect(along.price).toBeCloseTo(0, 6);
      // Free as far as the Line's round end reaches, 4 px past it.
      expect(inLineLength(costOf(input)!.price)).toBeCloseTo(600 - 304, 0);
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

    it('looks at the Stroke again only on new samples, and prices it in a new Colour at once', () => {
      const game = createGame(true);
      const { input, asked } = drawingOver(game);
      input.press(line[0]!, 'left');
      input.move(line[1]!);
      input.preview();
      input.preview();
      expect(asked.strokeLooks).toBe(1);
      input.move(line[2]!);
      input.preview();
      expect(asked.strokeLooks).toBe(2);

      input.pick('red');
      expect(costOf(input)!.colour).toBe('red');
      expect(asked.strokeLooks).toBe(2);
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

    it('looks for the Fill under a still pointer again only when the pointer or the world changes', () => {
      const game = createGame(true);
      const { input, asked } = drawingOver(game);
      box(game.world, input);

      input.move(inBox);
      const grey = costOf(input)!;
      input.preview();
      expect(asked.fillLooks).toBe(1);

      // A new Colour, or a new price in F2, shows at once, without looking again.
      input.pick('black');
      expect(costOf(input)).toMatchObject({ colour: 'black', price: grey.price });
      game.editInk((table) => (table.fillPrice *= 2));
      expect(costOf(input)!.price).toBeCloseTo(2 * grey.price, 6);
      expect(asked.fillLooks).toBe(1);

      input.move({ x: 401, y: 430 });
      input.preview();
      expect(asked.fillLooks).toBe(2);
    });

    it('updates the Fill cost under a still pointer when an undo refunds Ink or takes the Object', () => {
      const game = createGame(true);
      const { input } = drawingOver(game);
      box(game.world, input);
      game.editInk((table) => (table.tanks.black = 200));
      input.pick('black');
      // 150 of the 200 in the black Tank: too little left for the box's Fill.
      drag(
        input,
        dragAlong([
          { x: 200, y: 700 },
          { x: 350, y: 700 },
        ]),
      );
      input.move(inBox);
      expect(costOf(input)).toMatchObject({ colour: 'black', over: true });

      input.undo();
      expect(costOf(input)).toMatchObject({ colour: 'black', over: false });

      input.undo();
      expect(costOf(input)).toBeNull();
    });

    it('follows a moving Object under a still pointer as the world steps', () => {
      const game = createGame(true);
      const { input, asked } = drawingOver(game);
      box(game.world, input);
      game.togglePause();
      input.press(inBox, 'right');
      input.release();
      // Below the box: it falls into the pointer.
      input.move({ x: 400, y: 540 });
      expect(costOf(input)).toBeNull();

      let steps = 0;
      while (costOf(input) === null && steps++ < 60) game.step();

      expect(costOf(input)).toMatchObject({ colour: 'grey' });
      expect(asked.fillLooks).toBeGreaterThan(steps);
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

    it('falls back to grey once a frame after it is put away while picked', () => {
      const game = createGame(false);
      const { input } = drawingOver(game);
      input.pick('eraser');

      game.sandboxTools = false; // a Campaign Level was loaded
      expect(input.tool).toBe('eraser');
      input.tick();

      expect(input.tool).toBe('grey');
    });

    it('cannot be picked while it is put away', () => {
      const game = createGame(false);
      const { input } = drawingOver(game);
      input.pick('blue');
      game.sandboxTools = false;

      input.pick('eraser');

      expect(input.tool).toBe('blue');
    });
  });

  describe('a refused Eraser or undo, over a fake Game', () => {
    /** Commands whose Eraser and undo answer as `answers` says now, and whose Eraser is on hand as it says. */
    function fakeOver(answers: { erase: EraseOutcome; undo: UndoOutcome; eraser: boolean }): {
      input: DrawingInput;
      erased: () => number;
    } {
      let erased = 0;
      const commands: DrawingCommands = {
        submitStroke: () => {
          throw new Error('not drawn here');
        },
        fillAt: () => {
          throw new Error('not filled here');
        },
        lookAtStroke: () => null,
        lookAtFill: () => null,
        prospect: () => {
          throw new Error('nothing to price');
        },
        world: { changes: 0 },
        releaseAt: () => {},
        eraseAlong: () => {
          erased++;
          return answers.erase;
        },
        undo: () => answers.undo,
        get allowed() {
          return { eraser: answers.eraser };
        },
      };
      return { input: new DrawingInput(commands), erased: () => erased };
    }
    const at = { x: 300, y: 200 };

    it('flashes an Eraser press refused once, not every frame it is held, and again on the next press', () => {
      const answers = {
        erase: { kind: 'refused', reason: 'not-now' } as EraseOutcome,
        undo: { kind: 'nothing' } as UndoOutcome,
        eraser: true,
      };
      const { input, erased } = fakeOver(answers);
      input.pick('eraser');

      expect(input.press(at, 'left')).toEqual({ path: [], message: 'Not now', pointer: at });
      input.move({ x: 320, y: 200 });
      expect(input.tick()).toBeNull();
      expect(input.tick()).toBeNull();
      expect(input.release()).toBeNull();
      expect(erased()).toBe(4);

      answers.erase = { kind: 'refused', reason: 'lost' };
      expect(input.press(at, 'left')).toMatchObject({ message: 'Ink Core destroyed: R or Clear' });
      expect(input.release()).toBeNull();
    });

    it('flashes once when erasing is barred partway through a press', () => {
      const answers = {
        erase: { kind: 'erased' } as EraseOutcome,
        undo: { kind: 'nothing' } as UndoOutcome,
        eraser: true,
      };
      const { input } = fakeOver(answers);
      input.pick('eraser');

      expect(input.press(at, 'left')).toBeNull();
      answers.erase = { kind: 'refused', reason: 'not-now' };
      input.move({ x: 320, y: 200 });
      expect(input.tick()).toEqual({ path: [], message: 'Not now', pointer: { x: 320, y: 200 } });
      expect(input.tick()).toBeNull();
      expect(input.release()).toBeNull();
    });

    it('never flashes an Eraser that erased or missed', () => {
      const { input } = fakeOver({
        erase: { kind: 'missed' },
        undo: { kind: 'nothing' },
        eraser: true,
      });
      input.pick('eraser');

      expect(input.press(at, 'left')).toBeNull();
      expect(input.tick()).toBeNull();
      expect(input.release()).toBeNull();
    });

    it('flashes a refused undo at the pointer, once per Ctrl+Z, and nothing for one that worked', () => {
      const answers = {
        erase: { kind: 'missed' } as EraseOutcome,
        undo: { kind: 'refused', reason: 'not-now' } as UndoOutcome,
        eraser: true,
      };
      const { input } = fakeOver(answers);
      input.move(at);

      expect(input.undo()).toEqual({ path: [], message: 'Not now', pointer: at });
      expect(input.undo()).toEqual({ path: [], message: 'Not now', pointer: at });
      answers.undo = { kind: 'refused', reason: 'lost' };
      expect(input.undo()).toMatchObject({ message: 'Ink Core destroyed: R or Clear' });
      answers.undo = { kind: 'nothing' };
      expect(input.undo()).toBeNull();
    });

    it('flashes a refused undo where the pointer last was, after it left the canvas', () => {
      const { input } = fakeOver({
        erase: { kind: 'missed' },
        undo: { kind: 'refused', reason: 'lost' },
        eraser: true,
      });
      input.move(at);
      input.leave();

      expect(input.undo()).toMatchObject({ pointer: at });
    });

    it('falls back to grey once a frame when the Eraser is no longer on hand, and cannot pick it then', () => {
      const answers = {
        erase: { kind: 'missed' } as EraseOutcome,
        undo: { kind: 'nothing' } as UndoOutcome,
        eraser: true,
      };
      const { input, erased } = fakeOver(answers);
      input.pick('eraser');

      answers.eraser = false; // a Campaign Level was loaded
      expect(input.tick()).toBeNull();
      expect(input.tool).toBe('grey');
      input.pick('eraser');
      expect(input.tool).toBe('grey');
      expect(erased()).toBe(0);
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
