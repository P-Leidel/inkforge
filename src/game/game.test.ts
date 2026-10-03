import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import { GALLERY, PIT_DEMO } from '../gallery/gallery';
import { COLOURS, type Colour } from '../materials/colour';
import { dragAlong, dragBox, dragCircle } from '../stroke/pointer-paths';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../sandbox/arena';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import type { Game } from './game';
import { fromLineLength, inLineLength } from './ink-table';
import { SANDBOX_LEVEL } from './level';
import { games } from './test-support';
import { FIXED_BODIES } from '../sandbox/test-support';

/** A Game over a new Sandbox world. Every test says whether Ink costs are on. */
const createGame = games();

/** What `colour`'s Tank has spent, in Line length. */
const spent = (game: Game, colour: Colour) =>
  inLineLength(game.tanks[colour].maximum - game.tanks[colour].spendable);

/** Every Tank, px². */
const tanks = (game: Game) => COLOURS.map((colour) => game.tanks[colour].spendable);

/** Every Tank full. */
const full = (game: Game) => COLOURS.map((colour) => game.tanks[colour].maximum);

/** Starts physics if paused, then steps it for `seconds`. */
function runFor(game: Game, seconds: number): void {
  if (!game.isRunning) game.togglePause();
  for (let t = 0; t < Math.round(seconds / STEP_SECONDS); t++) game.step();
}

/** A horizontal Line `length` px long at `y`, from `x`, that must be made. */
function drawLine(game: Game, y: number, x: number, length: number, colour: Colour = 'grey') {
  const outcome = game.submitStroke(
    dragAlong([
      { x, y },
      { x: x + length, y },
    ]),
    colour,
  );
  if (outcome.kind !== 'line') throw new Error(`expected a Line, got ${outcome.kind}`);
  return outcome;
}

/** A box that must be made; returns its id. */
function drawBox(game: Game, x: number, y: number, size: number, colour: Colour = 'grey') {
  const outcome = game.submitStroke(dragBox(x, y, size, size), colour);
  if (outcome.kind !== 'object') throw new Error(`expected an Object, got ${outcome.kind}`);
  return outcome.id;
}

/** Fills the Object under `point`, which must take the Fill. */
function fill(game: Game, point: Vec2, colour: Colour) {
  const outcome = game.fillAt(point, colour);
  if (outcome.kind !== 'filled') throw new Error(`expected a Fill, got ${outcome.kind}`);
  return outcome;
}

/** A 60 px black box filled black, drawn at price 0 below the Game. */
function boulder(game: Game, x: number, y: number): number {
  const outcome = game.world.submitStroke(dragBox(x - 30, y - 30, 60, 60), 'black');
  if (outcome.kind !== 'object') throw new Error('expected a boulder');
  game.world.fillAt({ x, y }, 'black');
  return outcome.id;
}

/**
 * A grey shelf at y = 700 from x = 200 to x = 680 (ten Pieces), broken in
 * the middle by a boulder made below the Game, which is then removed.
 */
function brokenShelf(game: Game) {
  const shelf = drawLine(game, 700, 200, 480);
  const rock = boulder(game, 440, 250);
  runFor(game, 0);
  game.world.release(rock);
  runFor(game, 1.5);
  game.world.remove(rock);
  const standing = game.world.lines.find((line) => line.id === shelf.id)!.runs[0]!.pieces;
  expect(standing.length).toBeLessThan(10);
  expect(standing.length).toBeGreaterThan(0);
  return { shelf, standing: standing.map((piece) => piece.index) };
}

/** Erases the whole Arena. */
function eraseEverything(game: Game): void {
  game.eraseAlong(
    [
      { x: 0, y: ARENA_HEIGHT / 2 },
      { x: ARENA_WIDTH, y: ARENA_HEIGHT / 2 },
    ],
    ARENA_HEIGHT,
  );
}

describe('Ink Tanks', () => {
  it('start full, at their maximums in Line length', () => {
    const game = createGame(true);

    expect(COLOURS.map((colour) => inLineLength(game.tanks[colour].spendable))).toEqual([
      4000, 3000, 3000, 1500, 1000,
    ]);
    expect(tanks(game)).toEqual(full(game));
  });
});

describe('Charging, with Ink costs on', () => {
  it('takes 400 from grey for a 400 px grey Line', () => {
    const game = createGame(true);

    const line = drawLine(game, 300, 200, 400);

    expect(spent(game, 'grey')).toBeCloseTo(400, 0);
    expect(game.tanks.grey.maximum - game.tanks.grey.spendable).toBeCloseTo(line.ink, 6);
    for (const colour of COLOURS.filter((c) => c !== 'grey')) {
      expect(game.tanks[colour].spendable).toBe(game.tanks[colour].maximum);
    }
  });

  it('takes 400 for a 100 × 100 box and about 310 for its Fill, each from its own Colour', () => {
    const game = createGame(true);

    drawBox(game, 300, 300, 100, 'blue');
    expect(spent(game, 'blue')).toBeCloseTo(400, 0);
    const filled = fill(game, { x: 350, y: 350 }, 'green');

    expect(spent(game, 'green')).toBeGreaterThan(300);
    expect(spent(game, 'green')).toBeLessThanOrEqual(312.5);
    expect(game.tanks.green.maximum - game.tanks.green.spendable).toBeCloseTo(filled.ink * 0.25, 6);
    expect(spent(game, 'blue')).toBeCloseTo(400, 0);
  });

  it('charges nothing for a rejected or dropped Stroke, a missed Fill or "Already filled"', () => {
    const game = createGame(true);
    drawBox(game, 300, 300, 100);
    fill(game, { x: 350, y: 350 }, 'grey');
    const before = tanks(game);

    expect(game.submitStroke(dragBox(320, 320, 60, 60), 'grey').kind).toBe('rejected');
    expect(game.submitStroke([{ x: 10, y: 10 }], 'grey').kind).toBe('dropped');
    expect(game.fillAt({ x: 900, y: 300 }, 'grey').kind).toBe('missed');
    expect(game.fillAt({ x: 350, y: 350 }, 'grey').kind).toBe('already-filled');

    expect(tanks(game)).toEqual(before);
    expect(game.history).toHaveLength(2);
  });
});

describe('Not enough Ink, with Ink costs on', () => {
  it('refuses a Stroke that costs more than is left, whole, and leaves the Tank as it was', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 600, 'red'); // 400 of red's 1000 left
    const before = game.tanks.red.spendable;

    const line = game.submitStroke(
      dragAlong([
        { x: 200, y: 500 },
        { x: 700, y: 500 },
      ]),
      'red',
    );
    const box = game.submitStroke(dragBox(300, 600, 150, 150), 'red');

    expect(line).toMatchObject({ kind: 'refused', colour: 'red' });
    if (line.kind === 'refused') {
      expect(inLineLength(line.price)).toBeCloseTo(500, 0);
      expect(line.path[0]!.x).toBeCloseTo(200, 0);
      expect(line.path.at(-1)!.x).toBeCloseTo(700, 0);
    }
    expect(box.kind).toBe('refused');
    expect(game.tanks.red.spendable).toBe(before);
    expect(game.world.lines).toHaveLength(1);
    expect(game.world.objects).toHaveLength(0);
    expect(game.history).toHaveLength(1);
  });

  it('refuses a Fill that costs more than is left, and the Object stays hollow', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 500, 'red');
    const box = drawBox(game, 300, 500, 100, 'red'); // 100 of red left
    const before = game.tanks.red.spendable;

    const outcome = game.fillAt({ x: 350, y: 550 }, 'red');

    expect(outcome).toMatchObject({ kind: 'refused', id: box, colour: 'red' });
    if (outcome.kind === 'refused') {
      expect(inLineLength(outcome.price)).toBeGreaterThan(300);
      expect(outcome.outline.length).toBeGreaterThan(3);
    }
    expect(game.tanks.red.spendable).toBe(before);
    expect(game.world.objects[0]!.fill).toBeNull();
    expect(game.history).toHaveLength(2);
  });
});

describe("Colours a Level doesn't have", () => {
  /** A Game whose Level has no blue. */
  function withoutBlue(inkCosts: boolean): Game {
    const game = createGame(inkCosts);
    game.editInk((table) => (table.tanks.blue = 0));
    return game;
  }

  describe('with Ink costs on', () => {
    it('refuses a blue Stroke as not in this Level, and makes nothing', () => {
      const game = withoutBlue(true);

      const line = game.submitStroke(
        dragAlong([
          { x: 200, y: 500 },
          { x: 300, y: 500 },
        ]),
        'blue',
      );
      const box = game.submitStroke(dragBox(300, 600, 100, 100), 'blue');

      expect(game.has('blue')).toBe(false);
      expect(line).toMatchObject({ kind: 'refused', reason: 'not-in-level', colour: 'blue' });
      expect(box).toMatchObject({ kind: 'refused', reason: 'not-in-level' });
      expect(game.world.lines).toHaveLength(0);
      expect(game.world.objects).toHaveLength(0);
      expect(game.history).toHaveLength(0);
    });

    it('refuses a blue Fill as not in this Level, and the Object stays hollow', () => {
      const game = withoutBlue(true);
      const box = drawBox(game, 300, 500, 100, 'grey');

      const outcome = game.fillAt({ x: 350, y: 550 }, 'blue');

      expect(outcome).toMatchObject({ kind: 'refused', reason: 'not-in-level', id: box });
      expect(game.world.objects[0]!.fill).toBeNull();
    });

    it('says so of a look in blue, and nothing of one in grey', () => {
      const game = withoutBlue(true);
      const look = game.lookAtStroke(
        dragAlong([
          { x: 200, y: 500 },
          { x: 300, y: 500 },
        ]),
      )!;

      expect(game.prospect(look, 'blue').refusal).toBe('not-in-level');
      expect(game.prospect(look, 'grey').refusal).toBeNull();
    });
  });

  it('says not in this Level before not enough', () => {
    const game = withoutBlue(true);
    const huge = game.submitStroke(
      dragAlong([
        { x: 100, y: 500 },
        { x: 1500, y: 500 },
      ]),
      'blue',
    );
    expect(huge).toMatchObject({ kind: 'refused', reason: 'not-in-level' });
  });

  it('has every Colour with Ink costs off, a maximum of 0 or not, and draws and fills in it', () => {
    const game = withoutBlue(false);
    drawBox(game, 300, 500, 100, 'blue');

    fill(game, { x: 350, y: 550 }, 'blue');

    for (const colour of COLOURS) expect(game.has(colour)).toBe(true);
    expect(game.world.objects[0]!.fill).toBe('blue');
  });

  it('has every Colour in the sandbox', () => {
    const game = createGame(true);
    for (const colour of COLOURS) expect(game.has(colour)).toBe(true);
  });
});

describe('What a Stroke or a Fill would do, with Ink costs on', () => {
  /** How far `estimate` is from `charged`, as a fraction of it. */
  const off = (estimate: number, charged: number) => Math.abs(estimate - charged) / charged;
  /** What a Stroke with these raw samples would do in `colour`. */
  const stroke = (game: Game, samples: readonly Vec2[], colour: Colour) =>
    game.prospect(game.lookAtStroke(samples)!, colour);
  /** What a Stroke with these raw samples would cost in `colour`. */
  const strokeCost = (game: Game, samples: readonly Vec2[], colour: Colour) =>
    stroke(game, samples, colour).cost!;

  it('estimates a straight Line within 5% of what it is charged', () => {
    const game = createGame(true);
    const samples = dragAlong([
      { x: 200, y: 300 },
      { x: 700, y: 420 },
    ]);
    const estimate = strokeCost(game, samples, 'blue');
    const before = game.tanks.blue.spendable;

    game.submitStroke(samples, 'blue');

    expect(off(estimate.price, before - game.tanks.blue.spendable)).toBeLessThan(0.05);
  });

  it('estimates a box within 5% of what it is charged', () => {
    const game = createGame(true);
    const samples = dragBox(400, 300, 120, 80);
    const estimate = strokeCost(game, samples, 'green');
    const before = game.tanks.green.spendable;

    expect(game.submitStroke(samples, 'green').kind).toBe('object');

    expect(off(estimate.price, before - game.tanks.green.spendable)).toBeLessThan(0.05);
  });

  it("estimates a Fill at what it is charged, and nothing once it's filled or over nothing", () => {
    const game = createGame(true);
    game.submitStroke(dragBox(400, 300, 100, 100), 'grey');
    const point = { x: 450, y: 350 };
    const prospect = game.prospect(game.lookAtFill(point)!, 'black');
    const before = game.tanks.black.spendable;

    game.fillAt(point, 'black');

    expect(prospect).toMatchObject({ kind: 'fill', refusal: null });
    expect(prospect.cost!.price).toBeCloseTo(before - game.tanks.black.spendable, 6);
    expect(game.lookAtFill(point)).toBeNull();
    expect(game.lookAtFill({ x: 900, y: 200 })).toBeNull();
  });

  it('estimates a Line drawn along another, or half along it, within 5% of what it is charged', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400);
    const exactly = dragAlong([
      { x: 200, y: 300 },
      { x: 600, y: 300 },
    ]);
    const half = dragAlong([
      { x: 200, y: 300 },
      { x: 1000, y: 300 },
    ]);
    const estimates = [strokeCost(game, exactly, 'blue'), strokeCost(game, half, 'green')];

    game.submitStroke(exactly, 'blue');
    game.submitStroke(half, 'green');

    // Drawn exactly along, it is charged next to nothing, and estimated so: within 5% of its length.
    const charged = game.tanks.blue.maximum - game.tanks.blue.spendable;
    expect(Math.abs(estimates[0]!.price - charged)).toBeLessThan(0.05 * fromLineLength(400));
    expect(
      off(estimates[1]!.price, game.tanks.green.maximum - game.tanks.green.spendable),
    ).toBeLessThan(0.05);
  });

  it('says a Stroke is over, and refused for it, when it costs more than its Tank holds', () => {
    const game = createGame(true);
    const long = dragAlong([
      { x: 200, y: 300 },
      { x: 1400, y: 300 },
    ]);
    expect(stroke(game, long, 'red')).toMatchObject({
      kind: 'line',
      refusal: 'not-enough',
      cost: { colour: 'red', over: true },
    });
    expect(stroke(game, long, 'grey')).toMatchObject({ refusal: null, cost: { over: false } });
  });

  it('says a closing Stroke makes an Object, refused first for overlapping one', () => {
    const game = createGame(true);
    drawBox(game, 400, 300, 100);
    const over = dragBox(420, 320, 100, 100);
    const clear = dragBox(700, 300, 100, 100);

    expect(stroke(game, clear, 'grey')).toMatchObject({ kind: 'object', refusal: null });
    expect(stroke(game, over, 'grey')).toMatchObject({ kind: 'object', refusal: 'overlaps' });
    game.editInk((table) => (table.tanks.grey = 10));
    expect(stroke(game, over, 'grey')).toMatchObject({
      refusal: 'overlaps',
      cost: { over: true },
    });
    expect(stroke(game, clear, 'grey').refusal).toBe('not-enough');
  });

  it('prices a look as the Tanks and the Ink table are now, not as they were when it was taken', () => {
    const game = createGame(true);
    const look = game.lookAtStroke(dragBox(400, 300, 100, 100))!;
    const before = game.prospect(look, 'grey').cost!.price;

    game.editInk((table) => (table.linePrice = 2));

    expect(game.prospect(look, 'grey').cost!.price).toBeCloseTo(2 * before, 6);
  });

  it('prices nothing with Ink costs off, and still says what it would make', () => {
    const game = createGame(false);
    expect(stroke(game, dragBox(400, 300, 100, 100), 'grey')).toEqual({
      kind: 'object',
      pinned: false,
      refusal: null,
      cost: null,
    });
  });

  it('says whether a Line would hang Frozen: one in mid-air does, one down to the ground doesn’t', () => {
    const game = createGame(true);
    const midAir = dragAlong([
      { x: 400, y: 300 },
      { x: 600, y: 300 },
    ]);
    const toGround = dragAlong([
      { x: 400, y: 700 },
      { x: 400, y: 880 },
    ]);

    expect(stroke(game, midAir, 'grey')).toMatchObject({ kind: 'line', pinned: true });
    expect(stroke(game, toGround, 'grey')).toMatchObject({ kind: 'line', pinned: false });
  });

  it('says a Line hangs Frozen as the Line it makes will, not as its raw samples do', () => {
    const game = createGame(true);
    // A shelf with a spike down to the ground, thinner than a Line: the Line it makes runs straight across.
    const spiked = dragAlong([
      { x: 400, y: 840 },
      { x: 500, y: 840 },
      { x: 501, y: 880 },
      { x: 502, y: 840 },
      { x: 600, y: 840 },
    ]);

    expect(stroke(game, spiked, 'grey')).toMatchObject({ kind: 'line', pinned: true });
    expect(game.submitStroke(spiked, 'grey')).toMatchObject({ kind: 'line', grounded: false });
  });

  it('doesn’t pin a Stroke begun on the ground before it is long enough to be a Line', () => {
    const game = createGame(true);
    const begun = dragAlong([
      { x: 400, y: 880 },
      { x: 400, y: 872 },
    ]);

    expect(game.submitStroke(begun, 'grey')).toEqual({ kind: 'dropped' });
    expect(stroke(game, begun, 'grey')).toMatchObject({ kind: 'line', pinned: false });
  });

  it('looks at nothing with too few samples to be anything', () => {
    const game = createGame(true);
    expect(game.lookAtStroke([{ x: 400, y: 300 }])).toBeNull();
  });
});

describe('Overlap charging, with Ink costs on', () => {
  it('charges nothing for a Line drawn exactly along another, and half for one half along it', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400); // grey, from x = 200 to x = 600

    const exactly = drawLine(game, 300, 200, 400, 'blue');
    drawLine(game, 300, 200, 800, 'green');

    expect(spent(game, 'blue')).toBeCloseTo(0, 6);
    expect(inLineLength(exactly.ink)).toBeCloseTo(400, 0); // it holds its Ink all the same
    // Free as far as the grey Line's round end reaches, 4 px past it.
    expect(spent(game, 'green')).toBeCloseTo(800 - 404, 0);
  });

  it('prices each Piece by its own part: one lying wholly on another Line costs nothing', () => {
    const game = createGame(true);
    drawLine(game, 700, 200, 240); // five grey Pieces, from x = 200 to x = 440
    const shelf = drawLine(game, 700, 200, 480, 'green'); // ten green Pieces, five on the grey
    expect(shelf.pieces).toHaveLength(10);
    const green = game.tanks.green.spendable;

    game.eraseAlong([{ x: 200 + 48 * 2 + 24, y: 700 }], 12); // Piece 2 of each
    expect(game.tanks.green.spendable).toBeCloseTo(green, 6);
    expect(spent(game, 'grey')).toBeCloseTo(4 * 48, 0);

    game.eraseAlong([{ x: 200 + 48 * 7 + 24, y: 700 }], 12); // green Piece 7, on nothing
    expect(game.tanks.green.spendable - green).toBeCloseTo(shelf.pieces[7]!, 6);
  });

  it('charges full along the Terrain and an Outline, and across an Object along the Object', () => {
    const game = createGame(true);
    drawBox(game, 300, 400, 100); // grey, its top edge along y = 400
    drawLine(game, 600, 200, 300); // grey, from x = 200 to x = 500
    drawBox(game, 700, 550, 100); // grey, from x = 700 to x = 800

    drawLine(game, 880, 200, 400, 'blue'); // along the ground
    drawLine(game, 400, 300, 100, 'green'); // along the box's top edge
    drawLine(game, 600, 200, 700, 'red'); // along the grey Line, then across the box

    expect(spent(game, 'blue')).toBeCloseTo(400, 0);
    expect(spent(game, 'green')).toBeCloseTo(100, 0);
    // Free as far as x = 504; the 100 px across the box cost like the rest.
    expect(spent(game, 'red')).toBeCloseTo(900 - 504, 0);
  });

  it('keeps the free part free after the Line underneath is gone, and refunds only what was paid', () => {
    const game = createGame(true);
    const under = drawLine(game, 500, 200, 480); // grey, along y = 500
    drawLine(game, 503, 200, 480, 'green'); // 3 px below it: inside its band
    expect(spent(game, 'green')).toBeCloseTo(0, 6);

    // A thin brush above the grey Line, out of the green one's reach, erases the grey.
    game.eraseAlong(
      [
        { x: 150, y: 496.5 },
        { x: 750, y: 496.5 },
      ],
      0.5,
    );
    expect(game.world.lines.map((line) => line.id)).not.toContain(under.id);
    expect(game.world.lines).toHaveLength(1);
    expect(game.tanks.grey.spendable).toBeCloseTo(game.tanks.grey.maximum, 6);
    expect(game.tanks.green.spendable).toBeCloseTo(game.tanks.green.maximum, 6);

    game.undo(); // the green Line: it paid nothing, and gets nothing back
    expect(game.world.lines).toEqual([]);
    expect(game.tanks.green.spendable).toBeCloseTo(game.tanks.green.maximum, 6);
    expect(game.history).toEqual([]);
  });

  it('refunds only what was paid on undoing a Line that was half free', () => {
    const game = createGame(true);
    drawLine(game, 700, 200, 500, 'green'); // 500 spent elsewhere, so a refund can show
    drawLine(game, 300, 200, 400); // grey, from x = 200 to x = 600
    drawLine(game, 300, 200, 800, 'green');
    const paid = game.paid('green') - fromLineLength(500);
    expect(inLineLength(paid)).toBeCloseTo(800 - 404, 0);

    game.undo();

    expect(spent(game, 'green')).toBeCloseTo(500, 6);
    expect(game.paid('green')).toBeCloseTo(fromLineLength(500), 6);
  });
});

describe('Undo refunds exactly what was paid, with Ink costs on', () => {
  it('for a Line, an Object and a Fill, newest first', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400, 'blue');
    const box = drawBox(game, 300, 500, 100, 'black');
    fill(game, { x: 350, y: 550 }, 'grey');
    const black = game.tanks.black.spendable;

    game.undo(); // the Fill
    expect(game.world.objects[0]!.fill).toBeNull();
    expect(game.tanks.grey.spendable).toBeCloseTo(game.tanks.grey.maximum, 6);
    expect(game.tanks.black.spendable).toBe(black);

    game.undo(); // the box
    expect(game.world.objects.some((o) => o.id === box)).toBe(false);
    expect(game.tanks.black.spendable).toBeCloseTo(game.tanks.black.maximum, 6);

    game.undo(); // the Line
    expect(game.world.lines).toEqual([]);
    expect(game.tanks.blue.spendable).toBeCloseTo(game.tanks.blue.maximum, 6);

    game.undo(); // nothing left: does nothing
    for (const [k, tank] of tanks(game).entries()) expect(tank).toBeCloseTo(full(game)[k]!, 6);
    expect(game.world.bodyCount).toBe(FIXED_BODIES);
  });

  it("for a Line with broken Pieces, only the standing Pieces' share", () => {
    const game = createGame(true);
    const { shelf, standing } = brokenShelf(game);
    const brokenPrice = shelf.pieces
      .filter((_, index) => !standing.includes(index))
      .reduce((sum, ink) => sum + ink, 0);

    game.undo();

    expect(game.world.lines).toEqual([]);
    expect(game.tanks.grey.spendable).toBeCloseTo(game.tanks.grey.maximum - brokenPrice, 6);
    expect(brokenPrice).toBeGreaterThan(0);
  });

  it('works while running, and refunds too', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400);
    game.togglePause();

    game.undo();

    expect(game.world.lines).toHaveLength(0);
    expect(game.tanks.grey.spendable).toBeCloseTo(game.tanks.grey.maximum, 6);
  });

  it('skips a broken Object and its Fill, and takes back the latest Stroke that still exists', () => {
    const game = createGame(true);
    const box = drawBox(game, 600, 819, 60);
    const ball = game.submitStroke(dragCircle({ x: 300, y: 300 }, 20), 'red');
    if (ball.kind !== 'object') throw new Error('expected a ball');
    const filled = fill(game, { x: 300, y: 300 }, 'grey');
    const red = game.tanks.red.spendable;
    runFor(game, 0);
    game.world.release(ball.id);
    runFor(game, 1.5);
    expect(game.world.objects.some((o) => o.id === ball.id)).toBe(false);
    expect(game.history).toEqual([{ kind: 'stroke', id: box }]);

    game.undo();

    expect(game.world.objects).toHaveLength(0);
    // The box is refunded; the broken ball's Outline and Fill are spent.
    expect(game.tanks.grey.spendable).toBeCloseTo(game.tanks.grey.maximum - 0.25 * filled.ink, 6);
    expect(game.tanks.red.spendable).toBe(red);
  });

  it('skips a Line whose every Piece broke', () => {
    const game = createGame(true);
    // A grey prop, made below the Game, Grounds the red Line drawn onto its top.
    game.world.submitStroke(
      dragAlong([
        { x: 420, y: 700 },
        { x: 300, y: 880 },
      ]),
      'grey',
    );
    const box = drawBox(game, 1200, 300, 40);
    const red = drawLine(game, 700, 420, 40, 'red'); // one Piece, which breaks at once
    expect(game.world.lines.find((line) => line.id === red.id)!.runs[0]!.grounded).toBe(true);
    const rock = boulder(game, 440, 250);
    runFor(game, 0);
    game.world.release(rock);
    runFor(game, 1.5);
    game.world.remove(rock);
    expect(game.world.lines.some((line) => line.id === red.id)).toBe(false);
    const redLeft = game.tanks.red.spendable;

    game.undo();

    expect(game.world.objects.some((o) => o.id === box)).toBe(false);
    expect(game.tanks.red.spendable).toBe(redLeft);
  });
});

describe('A Line Grounded after it was drawn', () => {
  it('keeps what it cost: undo refunds it in full', () => {
    const game = createGame(true);
    const full = game.tanks.blue.spendable;
    const shelf = drawLine(game, 700, 400, 200, 'blue');
    expect(shelf.grounded).toBe(false);
    const paid = full - game.tanks.blue.spendable;
    expect(paid).toBeGreaterThan(0);
    const post = game.submitStroke(
      dragAlong([
        { x: 400, y: 700 },
        { x: 400, y: 880 },
      ]),
      'grey',
    );
    expect(post.kind).toBe('line');
    expect(game.world.lines.find((line) => line.id === shelf.id)!.runs[0]!.grounded).toBe(true);

    game.undo(); // the post
    game.undo(); // the shelf

    expect(game.world.lines).toEqual([]);
    expect(game.tanks.blue.spendable).toBeCloseTo(full, 6);
    expect(game.history).toEqual([]);
  });
});

describe('A Line cut off where it stood', () => {
  /** A blue wall standing on the ground at x = 400, five Pieces tall, drawn up from the ground. */
  function blueWall(game: Game) {
    const outcome = game.submitStroke(
      dragAlong([
        { x: 400, y: 880 },
        { x: 400, y: 880 - 240 },
      ]),
      'blue',
    );
    if (outcome.kind !== 'line') throw new Error('expected a Line');
    expect(outcome.grounded).toBe(true);
    return outcome;
  }

  it('is still the Stroke it was drawn as: one undo takes back every part, refunding them', () => {
    const game = createGame(true);
    const wall = blueWall(game);

    game.eraseAlong([{ x: 400, y: 880 - 2.5 * 48 }], 4); // Piece 2: the top two fall
    expect(game.world.lines.map((line) => line.id)).toEqual([wall.id]);
    expect(game.world.lines[0]!.runs).toHaveLength(2);
    expect(game.tanks.blue.maximum - game.tanks.blue.spendable).toBeCloseTo(
      wall.ink - wall.pieces[2]!,
      6,
    );

    game.undo();

    expect(game.world.lines).toEqual([]);
    expect(game.tanks.blue.spendable).toBeCloseTo(game.tanks.blue.maximum, 6);
    expect(game.history).toEqual([]);
  });

  it('refunds a fallen run’s Pieces when they are erased', () => {
    const game = createGame(true);
    const wall = blueWall(game);
    game.eraseAlong([{ x: 400, y: 880 - 2.5 * 48 }], 4);

    game.eraseAlong(
      [
        { x: 400, y: 880 - 3.5 * 48 },
        { x: 400, y: 880 - 4.5 * 48 },
      ],
      4,
    );

    expect(game.world.lines[0]!.runs).toMatchObject([{ grounded: true }]);
    expect(game.tanks.blue.maximum - game.tanks.blue.spendable).toBeCloseTo(
      wall.pieces[0]! + wall.pieces[1]!,
      6,
    );
    game.undo(); // the standing rest
    expect(game.tanks.blue.spendable).toBeCloseTo(game.tanks.blue.maximum, 6);
    expect(game.history).toEqual([]);
  });

  it('is undone with the Stroke even once what still stood is gone', () => {
    const game = createGame(true);
    const wall = blueWall(game);
    game.eraseAlong([{ x: 400, y: 880 - 2.5 * 48 }], 4);
    game.eraseAlong(
      [
        { x: 400, y: 880 - 0.5 * 48 },
        { x: 400, y: 880 - 1.5 * 48 },
      ],
      4,
    );
    expect(game.world.lines.map((line) => line.id)).toEqual([wall.id]);
    expect(game.world.lines[0]!.runs).toMatchObject([{ grounded: false }]);

    game.undo();

    expect(game.world.lines).toEqual([]);
    expect(game.tanks.blue.spendable).toBeCloseTo(game.tanks.blue.maximum, 6);
  });

  it('comes back from R as it was when physics started, with what it paid', () => {
    const game = createGame(true);
    blueWall(game);
    runFor(game, 0.1);
    game.eraseAlong([{ x: 400, y: 880 - 2.5 * 48 }], 4);
    runFor(game, 1);

    game.reset();
    expect(game.world.lines).toHaveLength(1);
    expect(game.world.lines[0]!.runs[0]!.pieces).toHaveLength(5);
    game.undo();
    expect(game.tanks.blue.spendable).toBeCloseTo(game.tanks.blue.maximum, 6);
  });
});

describe('The Eraser refunds what was paid, with Ink costs on', () => {
  it("for an Object, its Outline's and its Fill's prices, and it is gone from undo", () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 200);
    const box = drawBox(game, 500, 500, 100, 'black');
    fill(game, { x: 550, y: 550 }, 'blue');
    const grey = game.tanks.grey.spendable;

    game.eraseAlong([{ x: 550, y: 550 }], 12);

    expect(game.world.objects.some((o) => o.id === box)).toBe(false);
    expect(game.tanks.black.spendable).toBeCloseTo(game.tanks.black.maximum, 6);
    expect(game.tanks.blue.spendable).toBeCloseTo(game.tanks.blue.maximum, 6);
    expect(game.tanks.grey.spendable).toBe(grey);
    expect(game.history.map((action) => action.id)).not.toContain(box);
  });

  it("for a Piece, its price, and undo later gives back only the rest's", () => {
    const game = createGame(true);
    const shelf = drawLine(game, 700, 200, 480, 'green');
    expect(shelf.pieces).toHaveLength(10);

    game.eraseAlong([{ x: 200 + 48 * 4 + 24, y: 700 }], 12); // Piece 4
    expect(game.tanks.green.maximum - game.tanks.green.spendable).toBeCloseTo(
      shelf.ink - shelf.pieces[4]!,
      6,
    );

    game.undo();
    expect(game.tanks.green.spendable).toBeCloseTo(game.tanks.green.maximum, 6);
    game.undo(); // nothing left
    expect(game.tanks.green.spendable).toBeCloseTo(game.tanks.green.maximum, 6);
  });

  it('takes erased Strokes out of the undo history', () => {
    const game = createGame(true);
    drawBox(game, 270, 818, 60);
    drawBox(game, 470, 818, 60);
    drawLine(game, 700, 200, 480);

    game.eraseAlong([{ x: 500, y: 848 }], 12);
    game.eraseAlong([{ x: 224, y: 700 }], 12);
    game.undo(); // what is left of the Line
    expect(game.world.lines).toEqual([]);
    game.undo(); // not the erased box, but the one before it
    expect(game.world.objects).toEqual([]);
    expect(game.history).toEqual([]);
    expect(game.tanks.grey.spendable).toBeCloseTo(game.tanks.grey.maximum, 6);
  });

  it('for Rubble, Droplets and Patches, nothing', () => {
    const game = createGame(true);
    const { blue } = game.world.materials.colours;
    blue.outline.durability = 1; // a blue box breaks on the first thing it touches
    blue.outline.damageThreshold = 0;
    const pebbles = drawBox(game, 300, 700, 60, 'blue');
    fill(game, { x: 330, y: 730 }, 'grey');
    const spill = drawBox(game, 900, 600, 60, 'blue');
    fill(game, { x: 930, y: 630 }, 'blue');
    game.togglePause();
    game.world.release(pebbles);
    game.world.release(spill);
    let steps = 0;
    while (!(game.world.patches.length > 0 && game.world.droplets.length > 0) && steps++ < 300) {
      game.step();
    }
    expect(game.world.objects).toEqual([]);
    expect(game.world.rubble.length).toBeGreaterThan(0);
    expect(game.world.droplets.length).toBeGreaterThan(0);
    expect(game.world.patches.length).toBeGreaterThan(0);
    const before = tanks(game);

    eraseEverything(game);

    expect(game.world.rubble).toEqual([]);
    expect(game.world.droplets).toEqual([]);
    expect(game.world.patches).toEqual([]);
    expect(tanks(game)).toEqual(before);
    expect(game.tanks.grey.spendable).toBeLessThan(game.tanks.grey.maximum);
  });
});

describe('Refunds never make Ink, with Ink costs on', () => {
  it('draw, run, break, undo, erase and R in any order never leave a Tank above what it held before', () => {
    const game = createGame(true);
    const random = seeded(7);
    const at = () => ({ x: 150 + random() * 1500, y: 150 + random() * 650 });
    const colour = () => COLOURS[Math.floor(random() * COLOURS.length)]!;
    const actions: (() => void)[] = [
      () => {
        const { x, y } = at();
        game.submitStroke(
          dragAlong([
            { x, y },
            { x: x + 50 + random() * 300, y: y + random() * 100 },
          ]),
          colour(),
        );
      },
      () => {
        const { x, y } = at();
        game.submitStroke(dragBox(x, y, 30 + random() * 80, 30 + random() * 80), colour());
      },
      () => {
        const object = game.world.objects[Math.floor(random() * game.world.objects.length)];
        if (object) game.fillAt({ x: object.transform.x, y: object.transform.y }, colour());
      },
      () => game.togglePause(),
      () => {
        for (const object of game.world.objects) game.world.release(object.id);
        runFor(game, 0.5 + random());
      },
      () => game.undo(),
      () => game.eraseAlong([at(), at()], 12 + random() * 40),
      () => game.reset(),
    ];
    const check = () => {
      for (const colour of COLOURS) {
        expect(game.tanks[colour].spendable).toBeLessThanOrEqual(game.tanks[colour].maximum + 1e-6);
        expect(game.tanks[colour].spendable + game.paid(colour)).toBeLessThanOrEqual(
          game.tanks[colour].maximum + 1e-6,
        );
      }
    };

    for (let k = 0; k < 150; k++) {
      actions[Math.floor(random() * actions.length)]!();
      check();
    }
    while (game.history.length > 0) {
      game.undo();
      check();
    }
    eraseEverything(game);
    check();
  });
});

describe('Editing the Ink table, with Ink costs on', () => {
  it('a price edit changes the next charge, and not the refund of what was already made', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400);
    const box = drawBox(game, 300, 500, 100, 'blue');

    game.editInk((ink) => {
      ink.linePrice = 2;
      ink.fillPrice = 0.5;
    });
    expect(spent(game, 'grey')).toBeCloseTo(400, 0);
    drawLine(game, 200, 200, 400, 'green');
    expect(spent(game, 'green')).toBeCloseTo(800, 0);
    const filled = fill(game, { x: 350, y: 550 }, 'red');
    expect(game.tanks.red.maximum - game.tanks.red.spendable).toBeCloseTo(filled.ink * 0.5, 6);

    game.undo(); // the red Fill: what it paid at 0.5
    game.undo(); // the green Line: what it paid at 2
    game.undo(); // the blue box: what it paid at 1
    game.undo(); // the grey Line: likewise
    expect(game.world.objects.some((o) => o.id === box)).toBe(false);
    for (const [k, tank] of tanks(game).entries()) expect(tank).toBeCloseTo(full(game)[k]!, 6);
  });

  it('a Fill price edit charges nothing more for a Fill already made', () => {
    const game = createGame(true);
    drawBox(game, 300, 500, 100, 'blue');
    const filled = fill(game, { x: 350, y: 550 }, 'grey');
    const grey = game.tanks.grey.spendable;

    game.editInk((ink) => (ink.fillPrice = 1));
    game.undo(); // the Fill: refunds its price at 0.25, not at 1

    expect(game.tanks.grey.spendable - grey).toBeCloseTo(filled.ink * 0.25, 6);
  });

  it('a lowered maximum empties the Tank down to it as soon as it is edited', () => {
    const game = createGame(true);

    game.editInk((ink) => (ink.tanks.red = 600));

    expect(game.tanks.red).toMatchObject({ spendable: fromLineLength(600), units: 600 });
  });

  it("refuses what the lowered Tank can't pay for", () => {
    const game = createGame(true);
    game.editInk((ink) => (ink.tanks.black = 300));

    const outcome = game.submitStroke(dragBox(300, 300, 100, 100), 'black');

    expect(outcome.kind).toBe('refused');
    expect(game.tanks.black.spendable).toBe(fromLineLength(300));
  });

  it('a refund never fills a Tank beyond the lowered maximum, for undo, the Eraser or R', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400);
    drawBox(game, 300, 500, 100, 'grey');
    game.togglePause(); // the snapshot: grey holds 3200
    game.togglePause();
    game.editInk((ink) => (ink.tanks.grey = 3100));
    expect(game.tanks.grey.spendable).toBe(fromLineLength(3100));

    game.reset();
    expect(game.tanks.grey.spendable).toBe(fromLineLength(3100));
    game.undo(); // the box: 400 back, 100 of it fits
    expect(game.tanks.grey.spendable).toBe(fromLineLength(3100));
    eraseEverything(game); // the Line: 400 back, none of it fits
    expect(game.tanks.grey.spendable).toBe(fromLineLength(3100));
  });

  it('Clear fills every Tank to the edited maximums', () => {
    const game = createGame(true);
    game.editInk((ink) => (ink.tanks.blue = 5000));

    game.load(SANDBOX_LEVEL);

    expect(game.tanks.blue.spendable).toBe(fromLineLength(5000));
    expect(tanks(game)).toEqual(full(game));
  });
});

describe('R, with Ink costs on', () => {
  it('brings back the Tanks and what undo takes back as they were when physics last started', () => {
    const game = createGame(true);
    const line = drawLine(game, 300, 200, 400);
    const box = drawBox(game, 500, 500, 100, 'blue');
    game.togglePause();
    const atStart = tanks(game);
    fill(game, { x: 550, y: 550 }, 'red');
    drawLine(game, 200, 200, 300, 'green');
    game.undo(); // the green Line
    game.undo(); // the red Fill
    game.undo(); // the blue box
    runFor(game, 0.5);

    game.reset();

    expect(tanks(game)).toEqual(atStart);
    expect(game.world.objects.map((o) => o.id)).toEqual([box]);
    expect(game.world.lines.map((l) => l.id)).toEqual([line.id]);
    game.undo(); // undo carries on from there: the box, refunded
    expect(game.world.objects).toEqual([]);
    expect(game.world.lines).toHaveLength(1);
    expect(game.tanks.blue.spendable).toBeCloseTo(game.tanks.blue.maximum, 6);
    game.undo(); // then the grey Line, refunded
    expect(game.world.lines).toEqual([]);
    expect(tanks(game)).toEqual(full(game));
    game.undo(); // and nothing more: the Fill and the green Line came after the start
    expect(game.world.bodyCount).toBe(FIXED_BODIES);
    expect(tanks(game)).toEqual(full(game));
  });

  it('does nothing before physics has first started', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400);
    const before = tanks(game);

    game.reset();

    expect(tanks(game)).toEqual(before);
    expect(game.history).toHaveLength(1);
  });
});

describe('Clear, demos and stress tests', () => {
  it('Clear fills every Tank and empties the history', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400);
    drawBox(game, 500, 500, 100, 'red');
    fill(game, { x: 550, y: 550 }, 'black');
    game.togglePause();

    game.load(SANDBOX_LEVEL);

    expect(tanks(game)).toEqual(full(game));
    expect(game.history).toEqual([]);
    game.reset(); // nothing to go back to
    expect(game.world.lines).toEqual([]);
  });

  it("a demo's Strokes and Fills fill no Tank, can be undone and refund nothing", () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400);
    const boulder = GALLERY.find((demo) => demo.name === 'Boulder')!;

    game.load(boulder);

    expect(tanks(game)).toEqual(full(game));
    const made = game.world.lines.length + game.world.objects.length;
    const filled = game.world.objects.filter((o) => o.fill).length;
    expect(game.history).toHaveLength(made + filled);
    for (let k = 0; k < made + filled; k++) game.undo();
    expect(game.world.lines).toEqual([]);
    expect(game.world.objects).toEqual([]);
    expect(tanks(game)).toEqual(full(game));
  });

  it('R goes back to how a demo left the world, which started physics', () => {
    const game = createGame(true);
    const boulder = GALLERY.find((demo) => demo.name === 'Boulder')!;
    game.load(boulder);
    const made = game.world.lines.length + game.world.objects.length;
    const filled = game.world.objects.filter((o) => o.fill).length;
    const objects = game.world.objects.map((o) => o.transform);
    runFor(game, 1);

    game.reset();

    expect(game.world.objects.map((o) => o.transform)).toEqual(objects);
    // Undo takes back every Stroke and Fill the demo made, and refunds nothing.
    for (let k = 0; k < made + filled; k++) game.undo();
    expect(game.world.lines).toEqual([]);
    expect(game.world.objects).toEqual([]);
    expect(tanks(game)).toEqual(full(game));
  });

  it("a demo's own Arena stays through R; Clear and another demo bring the sandbox Arena back", () => {
    const game = createGame(true);
    const sandbox = game.world.arena;
    const bounce = GALLERY.find((demo) => demo.name === 'Bounce')!;

    game.load(PIT_DEMO);
    expect(game.world.arena).toBe(PIT_DEMO.arena);
    runFor(game, 1);
    game.reset();
    expect(game.world.arena).toBe(PIT_DEMO.arena);

    game.load(bounce);
    expect(game.world.arena).toBe(sandbox);

    game.load(PIT_DEMO);
    game.load(SANDBOX_LEVEL);
    expect(game.world.arena).toBe(sandbox);
  });

  it('a clear or an R made below the Game fills every Tank, as Clear does', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400);
    drawBox(game, 500, 500, 100, 'red');
    game.togglePause();
    drawLine(game, 200, 200, 300, 'green');

    game.world.reset();
    game.step(); // the Game reads what happened

    expect(tanks(game)).toEqual(full(game));
    game.undo(); // what came back is the world's now, and refunds nothing
    expect(tanks(game)).toEqual(full(game));

    drawLine(game, 100, 200, 300, 'blue');
    game.world.clear();
    game.step();

    expect(tanks(game)).toEqual(full(game));
    expect(game.history).toEqual([]);
  });
});

describe('With Ink costs off', () => {
  it('draws and fills an Object bigger than a whole Tank, charges nothing, and undoing it refunds nothing', () => {
    const game = createGame(false);
    // A red Outline of 1600 and a Fill of 40,000 px²: more than red's 1000 each.
    const box = drawBox(game, 300, 200, 400, 'red');
    fill(game, { x: 500, y: 400 }, 'red');

    expect(tanks(game)).toEqual(full(game));
    expect(game.paid('red')).toBe(0);
    game.undo();
    game.undo();
    expect(game.world.objects.some((o) => o.id === box)).toBe(false);
    expect(tanks(game)).toEqual(full(game));
  });

  it('leaves the Tanks as they are when turned off, and goes on from there when turned on', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400);
    const spentOn = game.tanks.grey.spendable;

    game.inkCosts = false;
    drawLine(game, 400, 200, 400);
    expect(game.tanks.grey.spendable).toBe(spentOn);
    game.undo(); // refunds the nothing it cost
    expect(game.tanks.grey.spendable).toBe(spentOn);

    game.inkCosts = true;
    drawLine(game, 500, 200, 400);
    expect(spent(game, 'grey')).toBeCloseTo(800, 0);
  });
});

/** A small seeded random number generator, for a repeatable sequence of actions. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

describe('Enemies in the Game', () => {
  it('sends a Crawler in for free, paused or running, and undo leaves it be', () => {
    const game = createGame(true);
    const before = game.tanks;

    game.spawn('crawler');
    game.togglePause();
    game.spawn('crawler');
    game.undo();

    expect(game.world.enemies).toHaveLength(2);
    expect(game.tanks).toEqual(before);
    expect(game.history).toEqual([]);
  });

  it('lets R bring back the Enemies and the Ink Core’s HP, and Clear remove them', () => {
    const game = createGame(true);
    game.spawn('crawler');
    game.togglePause();
    for (let step = 0; step < 40 * 60; step++) game.step();
    expect(game.world.enemies).toEqual([]);
    expect(game.world.inkCore.hp).toBe(9);

    game.reset();
    expect(game.world.enemies).toHaveLength(1);
    expect(game.world.inkCore.hp).toBe(10);

    game.load(SANDBOX_LEVEL);
    expect(game.world.enemies).toEqual([]);
  });

  /** A Crawler walked in past x = 400 and paused there; where it is. */
  function pausedCrawler(game: Game): Vec2 {
    game.spawn('crawler');
    game.togglePause();
    for (let step = 0; step < 20 * 60 && game.world.enemies[0]!.transform.x <= 400; step++) {
      game.step();
    }
    game.togglePause();
    const { x, y } = game.world.enemies[0]!.transform;
    return { x, y };
  }

  it('charges only the cut Line for one drawn across a paused Crawler, as it estimates', () => {
    const game = createGame(true);
    const { x, y } = pausedCrawler(game);
    const samples = dragAlong([
      { x: x - 150, y },
      { x: x + 150, y },
    ]);
    const estimate = game.prospect(game.lookAtStroke(samples)!, 'grey').cost!.price;
    const before = game.tanks.grey.spendable;

    expect(game.submitStroke(samples, 'grey').kind).toBe('line');

    const charged = before - game.tanks.grey.spendable;
    expect(inLineLength(charged)).toBeCloseTo(260, -1);
    expect(Math.abs(estimate - charged) / charged).toBeLessThan(0.05);
  });

  it('refuses an Object drawn over a paused Crawler or the Ink Core, and charges nothing', () => {
    const game = createGame(true);
    const { x, y } = pausedCrawler(game);
    const core = game.world.inkCore.bounds;
    const before = game.tanks;

    const onCrawler = game.submitStroke(dragBox(x - 25, y - 60, 50, 50), 'grey');
    const onCore = game.submitStroke(
      dragBox(core.minX - 30, (core.minY + core.maxY) / 2 - 25, 50, 50),
      'grey',
    );

    expect(onCrawler).toMatchObject({ kind: 'rejected', reason: 'overlaps' });
    expect(onCore).toMatchObject({ kind: 'rejected', reason: 'overlaps' });
    expect(game.tanks).toEqual(before);
  });
});
