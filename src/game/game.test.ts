import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import { GALLERY } from '../gallery/gallery';
import { COLOURS, type Colour } from '../materials/colour';
import { dragAlong, dragBox, dragCircle } from '../stroke/pointer-paths';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../sandbox/arena';
import { STEP_SECONDS } from '../sandbox/sandbox-world';
import type { Game } from './game';
import { fromLineLength, inLineLength } from './ink-table';
import { games } from './test-support';

/** A Game over a new Sandbox world. Every test says whether Ink costs are on. */
const createGame = games();

/** What `colour`'s Tank has spent, in Line length. */
const spent = (game: Game, colour: Colour) =>
  inLineLength(game.maximum(colour) - game.tank(colour));

/** Every Tank, px². */
const tanks = (game: Game) => COLOURS.map((colour) => game.tank(colour));

/** Every Tank full. */
const full = (game: Game) => COLOURS.map((colour) => game.maximum(colour));

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
  const standing = game.world.lines.find((line) => line.id === shelf.id)!.pieces;
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

    expect(COLOURS.map((colour) => inLineLength(game.tank(colour)))).toEqual([
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
    expect(game.maximum('grey') - game.tank('grey')).toBeCloseTo(line.ink, 6);
    for (const colour of COLOURS.filter((c) => c !== 'grey')) {
      expect(game.tank(colour)).toBe(game.maximum(colour));
    }
  });

  it('takes 400 for a 100 × 100 box and about 310 for its Fill, each from its own Colour', () => {
    const game = createGame(true);

    drawBox(game, 300, 300, 100, 'blue');
    expect(spent(game, 'blue')).toBeCloseTo(400, 0);
    const filled = fill(game, { x: 350, y: 350 }, 'green');

    expect(spent(game, 'green')).toBeGreaterThan(300);
    expect(spent(game, 'green')).toBeLessThanOrEqual(312.5);
    expect(game.maximum('green') - game.tank('green')).toBeCloseTo(filled.ink * 0.25, 6);
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
    const before = game.tank('red');

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
    expect(game.tank('red')).toBe(before);
    expect(game.world.lines).toHaveLength(1);
    expect(game.world.objects).toHaveLength(0);
    expect(game.history).toHaveLength(1);
  });

  it('refuses a Fill that costs more than is left, and the Object stays hollow', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 500, 'red');
    const box = drawBox(game, 300, 500, 100, 'red'); // 100 of red left
    const before = game.tank('red');

    const outcome = game.fillAt({ x: 350, y: 550 }, 'red');

    expect(outcome).toMatchObject({ kind: 'refused', id: box, colour: 'red' });
    if (outcome.kind === 'refused') {
      expect(inLineLength(outcome.price)).toBeGreaterThan(300);
      expect(outcome.outline.length).toBeGreaterThan(3);
    }
    expect(game.tank('red')).toBe(before);
    expect(game.world.objects[0]!.fill).toBeNull();
    expect(game.history).toHaveLength(2);
  });
});

describe('Undo refunds exactly what was paid, with Ink costs on', () => {
  it('for a Line, an Object and a Fill, newest first', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400, 'blue');
    const box = drawBox(game, 300, 500, 100, 'black');
    fill(game, { x: 350, y: 550 }, 'grey');
    const black = game.tank('black');

    game.undo(); // the Fill
    expect(game.world.objects[0]!.fill).toBeNull();
    expect(game.tank('grey')).toBeCloseTo(game.maximum('grey'), 6);
    expect(game.tank('black')).toBe(black);

    game.undo(); // the box
    expect(game.world.objects.some((o) => o.id === box)).toBe(false);
    expect(game.tank('black')).toBeCloseTo(game.maximum('black'), 6);

    game.undo(); // the Line
    expect(game.world.lines).toEqual([]);
    expect(game.tank('blue')).toBeCloseTo(game.maximum('blue'), 6);

    game.undo(); // nothing left: does nothing
    for (const [k, tank] of tanks(game).entries()) expect(tank).toBeCloseTo(full(game)[k]!, 6);
    expect(game.world.bodyCount).toBe(1);
  });

  it("for a Line with broken Pieces, only the standing Pieces' share", () => {
    const game = createGame(true);
    const { shelf, standing } = brokenShelf(game);
    const brokenPrice = shelf.pieces
      .filter((_, index) => !standing.includes(index))
      .reduce((sum, ink) => sum + ink, 0);

    game.undo();

    expect(game.world.lines).toEqual([]);
    expect(game.tank('grey')).toBeCloseTo(game.maximum('grey') - brokenPrice, 6);
    expect(brokenPrice).toBeGreaterThan(0);
  });

  it('works while running, and refunds too', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400);
    game.togglePause();

    game.undo();

    expect(game.world.lines).toHaveLength(0);
    expect(game.tank('grey')).toBeCloseTo(game.maximum('grey'), 6);
  });

  it('skips a broken Object and its Fill, and takes back the latest Stroke that still exists', () => {
    const game = createGame(true);
    const box = drawBox(game, 600, 819, 60);
    const ball = game.submitStroke(dragCircle({ x: 300, y: 300 }, 20), 'red');
    if (ball.kind !== 'object') throw new Error('expected a ball');
    const filled = fill(game, { x: 300, y: 300 }, 'grey');
    const red = game.tank('red');
    runFor(game, 0);
    game.world.release(ball.id);
    runFor(game, 1.5);
    expect(game.world.objects.some((o) => o.id === ball.id)).toBe(false);
    expect(game.history).toEqual([{ kind: 'stroke', id: box }]);

    game.undo();

    expect(game.world.objects).toHaveLength(0);
    // The box is refunded; the broken ball's Outline and Fill are spent.
    expect(game.tank('grey')).toBeCloseTo(game.maximum('grey') - 0.25 * filled.ink, 6);
    expect(game.tank('red')).toBe(red);
  });

  it('skips a Line whose every Piece broke', () => {
    const game = createGame(true);
    const box = drawBox(game, 1200, 300, 40);
    const red = drawLine(game, 700, 420, 40, 'red'); // one Piece, which breaks at once
    const rock = boulder(game, 440, 250);
    runFor(game, 0);
    game.world.release(rock);
    runFor(game, 1.5);
    game.world.remove(rock);
    expect(game.world.lines.some((line) => line.id === red.id)).toBe(false);
    const redLeft = game.tank('red');

    game.undo();

    expect(game.world.objects.some((o) => o.id === box)).toBe(false);
    expect(game.tank('red')).toBe(redLeft);
  });
});

describe('The Eraser refunds what was paid, with Ink costs on', () => {
  it("for an Object, its Outline's and its Fill's prices, and it is gone from undo", () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 200);
    const box = drawBox(game, 500, 500, 100, 'black');
    fill(game, { x: 550, y: 550 }, 'blue');
    const grey = game.tank('grey');

    game.eraseAlong([{ x: 550, y: 550 }], 12);

    expect(game.world.objects.some((o) => o.id === box)).toBe(false);
    expect(game.tank('black')).toBeCloseTo(game.maximum('black'), 6);
    expect(game.tank('blue')).toBeCloseTo(game.maximum('blue'), 6);
    expect(game.tank('grey')).toBe(grey);
    expect(game.history.map((action) => action.id)).not.toContain(box);
  });

  it("for a Piece, its price, and undo later gives back only the rest's", () => {
    const game = createGame(true);
    const shelf = drawLine(game, 700, 200, 480, 'green');
    expect(shelf.pieces).toHaveLength(10);

    game.eraseAlong([{ x: 200 + 48 * 4 + 24, y: 700 }], 12); // Piece 4
    expect(game.maximum('green') - game.tank('green')).toBeCloseTo(shelf.ink - shelf.pieces[4]!, 6);

    game.undo();
    expect(game.tank('green')).toBeCloseTo(game.maximum('green'), 6);
    game.undo(); // nothing left
    expect(game.tank('green')).toBeCloseTo(game.maximum('green'), 6);
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
    expect(game.tank('grey')).toBeCloseTo(game.maximum('grey'), 6);
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
    expect(game.tank('grey')).toBeLessThan(game.maximum('grey'));
  });
});

describe('Refunds never make Ink, with Ink costs on', () => {
  it('never fill a Tank beyond its maximum, when the maximum was lowered after the Ink was spent', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400);
    game.editInk((ink) => (ink.tanks.grey = 3900));

    game.undo();

    expect(game.tank('grey')).toBe(fromLineLength(3900));
  });

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
        expect(game.tank(colour)).toBeLessThanOrEqual(game.maximum(colour) + 1e-6);
        expect(game.tank(colour) + game.paid(colour)).toBeLessThanOrEqual(
          game.maximum(colour) + 1e-6,
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
    expect(game.maximum('red') - game.tank('red')).toBeCloseTo(filled.ink * 0.5, 6);

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
    const grey = game.tank('grey');

    game.editInk((ink) => (ink.fillPrice = 1));
    game.undo(); // the Fill: refunds its price at 0.25, not at 1

    expect(game.tank('grey') - grey).toBeCloseTo(filled.ink * 0.25, 6);
  });

  it('lowering a maximum empties the Tank down to it at once, and raising one leaves the Tank', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400); // grey holds 3600

    game.editInk((ink) => {
      ink.tanks.grey = 3800; // still above what grey holds
      ink.tanks.red = 600;
    });
    expect(inLineLength(game.tank('grey'))).toBeCloseTo(3600, 0);
    expect(game.tank('red')).toBe(fromLineLength(600));

    game.editInk((ink) => {
      ink.tanks.grey = 3000;
      ink.tanks.red = 1000;
    });
    expect(game.tank('grey')).toBe(fromLineLength(3000));
    expect(game.tank('red')).toBe(fromLineLength(600));
  });

  it("refuses what the lowered Tank can't pay for", () => {
    const game = createGame(true);
    game.editInk((ink) => (ink.tanks.black = 300));

    const outcome = game.submitStroke(dragBox(300, 300, 100, 100), 'black');

    expect(outcome.kind).toBe('refused');
    expect(game.tank('black')).toBe(fromLineLength(300));
  });

  it('a refund never fills a Tank beyond the lowered maximum, for undo, the Eraser or R', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400);
    drawBox(game, 300, 500, 100, 'grey');
    game.togglePause(); // the snapshot: grey holds 3200
    game.togglePause();
    game.editInk((ink) => (ink.tanks.grey = 3100));
    expect(game.tank('grey')).toBe(fromLineLength(3100));

    game.reset();
    expect(game.tank('grey')).toBe(fromLineLength(3100));
    game.undo(); // the box: 400 back, 100 of it fits
    expect(game.tank('grey')).toBe(fromLineLength(3100));
    eraseEverything(game); // the Line: 400 back, none of it fits
    expect(game.tank('grey')).toBe(fromLineLength(3100));
  });

  it('Clear fills every Tank to the edited maximums', () => {
    const game = createGame(true);
    game.editInk((ink) => (ink.tanks.blue = 5000));

    game.clear();

    expect(game.tank('blue')).toBe(fromLineLength(5000));
    expect(tanks(game)).toEqual(full(game));
  });
});

describe('R, with Ink costs on', () => {
  it('brings back the Tanks and the history as they were when physics last started', () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400);
    const box = drawBox(game, 500, 500, 100, 'blue');
    game.togglePause();
    const atStart = { tanks: tanks(game), history: [...game.history] };
    fill(game, { x: 550, y: 550 }, 'red');
    drawLine(game, 200, 200, 300, 'green');
    game.undo(); // the green Line
    game.undo(); // the red Fill
    game.undo(); // the blue box
    runFor(game, 0.5);

    game.reset();

    expect(tanks(game)).toEqual(atStart.tanks);
    expect(game.history).toEqual(atStart.history);
    expect(game.world.objects.map((o) => o.id)).toEqual([box]);
    game.undo(); // undo carries on from there: the box, refunded
    expect(game.tank('blue')).toBeCloseTo(game.maximum('blue'), 6);
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

    game.clear();

    expect(tanks(game)).toEqual(full(game));
    expect(game.history).toEqual([]);
    game.reset(); // nothing to go back to
    expect(game.world.lines).toEqual([]);
  });

  it("a demo's Strokes and Fills fill no Tank, can be undone and refund nothing", () => {
    const game = createGame(true);
    drawLine(game, 300, 200, 400);
    const boulder = GALLERY.find((demo) => demo.name === 'Boulder')!;

    game.clear((world) => boulder.build(world));

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
    game.clear((world) => boulder.build(world));
    const history = [...game.history];
    const objects = game.world.objects.map((o) => o.transform);
    runFor(game, 1);

    game.reset();

    expect(game.history).toEqual(history);
    expect(game.world.objects.map((o) => o.transform)).toEqual(objects);
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
    const spentOn = game.tank('grey');

    game.inkCosts = false;
    drawLine(game, 400, 200, 400);
    expect(game.tank('grey')).toBe(spentOn);
    game.undo(); // refunds the nothing it cost
    expect(game.tank('grey')).toBe(spentOn);

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
