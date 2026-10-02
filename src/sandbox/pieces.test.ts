import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import { DEFAULT_MATERIAL_TABLE } from '../materials/material-table';
import { dragBox, dragCircle } from '../stroke/pointer-paths';
import type { LineView, SandboxWorld } from './sandbox-world';
import {
  drawLine,
  drawObject,
  drawPost,
  entriesOf,
  FIXED_BODIES,
  hear,
  objectById,
  runFor,
  sandboxWorlds,
  wentOf,
} from './test-support';

const createWorld = sandboxWorlds();

const GREY_LINE = DEFAULT_MATERIAL_TABLE.colours.grey.line.durability;
const BLUE_LINE = DEFAULT_MATERIAL_TABLE.colours.blue.line.durability;

function lineById(world: SandboxWorld, id: number): LineView {
  const line = world.lines.find((l) => l.id === id);
  if (!line) throw new Error(`no Line ${id}`);
  return line;
}

/** The index of the Piece of a Line whose capsules pass nearest `point`. */
function pieceAt(line: LineView, point: Vec2): number {
  let best = { index: -1, distance: Infinity };
  for (const piece of line.pieces) {
    for (const { a, b } of piece.segments) {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distance = Math.hypot(mid.x - point.x, mid.y - point.y);
      if (distance < best.distance) best = { index: piece.index, distance };
    }
  }
  return best.index;
}

const pieceIndexes = (world: SandboxWorld, id: number) =>
  lineById(world, id).pieces.map((p) => p.index);

/** A 60 px black box filled with black: the boulder. */
function boulder(world: SandboxWorld, x: number, y: number): number {
  const id = drawObject(world, dragBox(x - 30, y - 30, 60, 60), 'black');
  world.fillAt({ x, y }, 'black');
  return id;
}

/**
 * A horizontal Line at y = 700 from x = 200 to x = 680: ten Pieces of 48 px,
 * Grounded by a post under its left end.
 */
function shelf(world: SandboxWorld, colour: 'grey' | 'black' | 'blue' = 'grey'): number {
  drawPost(world, { x: 200, y: 700 });
  return drawLine(
    world,
    [
      { x: 200, y: 700 },
      { x: 680, y: 700 },
    ],
    colour,
  );
}

/** Starts physics, Releases the Object, and runs for `seconds`. */
function drop(world: SandboxWorld, id: number, seconds = 1.5): void {
  if (!world.isRunning) world.togglePause();
  world.release(id);
  runFor(world, seconds);
}

describe('Lines break Piece by Piece', () => {
  it('splits a drawn Line into Pieces of about 48 px, each whole to start with', () => {
    const world = createWorld();
    const id = shelf(world);

    const line = lineById(world, id);
    expect(line.pieces.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const piece of line.pieces) {
      expect(piece.durability).toBe(GREY_LINE);
      expect(piece.wear).toBe(0);
    }
    // Every Piece of a Grounded Line is a fixed body of its own: the shelf's and its post's.
    const pieces = world.lines.reduce((sum, l) => sum + l.pieces.length, 0);
    expect(world.bodyCount).toBe(FIXED_BODIES + pieces);
  });

  it('breaks a grey Piece after hard hits; the Grounded rest of the Line stays fixed, and what it held falls', () => {
    const world = createWorld();
    // A vertical grey wall, hit by heavy balls thrown at the same Piece.
    const wall = drawLine(world, [
      { x: 600, y: 300 },
      { x: 600, y: 780 },
    ]);
    const post = drawPost(world, { x: 600, y: 780 });
    const target = pieceAt(lineById(world, wall), { x: 600, y: 564 });
    const throwBall = () => {
      const ball = drawObject(world, dragCircle({ x: 540, y: 560 }, 20));
      world.fillAt({ x: 540, y: 560 }, 'black');
      if (!world.isRunning) world.togglePause();
      world.release(ball, { x: 800, y: 0 });
      runFor(world, 1);
    };
    const before = lineById(world, wall).pieces;

    throwBall();
    throwBall();
    const cracked = lineById(world, wall).pieces.find((p) => p.index === target)!;
    expect(cracked.durability).toBeLessThan(GREY_LINE);
    expect(cracked.wear).toBeGreaterThan(0.5);

    // The balls break too, into Rubble: count the other bodies.
    const bodiesBesidesRubble = () => world.bodyCount - world.rubble.length;
    const bodies = bodiesBesidesRubble();
    const heard = hear(world);
    throwBall();
    expect(pieceIndexes(world, wall)).not.toContain(target);
    expect(bodiesBesidesRubble()).toBeLessThan(bodies);
    expect(wentOf(heard())).toContain(`piece ${wall}.${target} broke`);
    expect(entriesOf(heard(), 'burst').length).toBeGreaterThanOrEqual(2); // the Piece and the ball
    // Every Piece below it, on the post, is still there, exactly where it was drawn.
    expect(lineById(world, wall).pieces.map((p) => p.segments)).toEqual(
      before.filter((p) => p.index > target).map((p) => p.segments),
    );
    // Those above it fell, as a Line of their own.
    const above = world.lines.find((l) => l.id !== wall && l.id !== post)!;
    expect(above.grounded).toBe(false);
    expect(above.pieces.map((p) => p.index)).toEqual(
      before.filter((p) => p.index < target).map((p) => p.index),
    );
  });

  it('splits a Line when a Piece in the middle breaks: the Grounded side stays and the other falls', () => {
    const world = createWorld();
    const id = shelf(world);
    const rock = boulder(world, 440, 250);
    drop(world, rock, 1.5);

    expect(pieceIndexes(world, id)).toEqual([0, 1, 2, 3]);
    expect(lineById(world, id).grounded).toBe(true);
    const right = world.lines.find((l) => l.pieces.some((p) => p.index > 5))!;
    expect(right.id).toBeGreaterThan(id);
    expect(right.grounded).toBe(false);
    expect(right.pieces.map((p) => p.index)).toEqual([6, 7, 8, 9]);
    expect(right.transform.y).toBeGreaterThan(100); // well below where it stood
  });

  it('keeps both halves of a Line fixed when a Piece in the middle breaks and each is still Grounded', () => {
    const world = createWorld();
    const id = shelf(world);
    drawPost(world, { x: 680, y: 700 });
    const rock = boulder(world, 440, 250);
    drop(world, rock, 1.5);

    const left = lineById(world, id).pieces.filter((p) => p.index < 4);
    const right = lineById(world, id).pieces.filter((p) => p.index > 5);
    expect(pieceIndexes(world, id)).not.toContain(4);
    expect(pieceIndexes(world, id)).not.toContain(5);
    expect(left).toHaveLength(4);
    expect(right).toHaveLength(4);

    // Both halves still hold a box, at the Line's height.
    world.togglePause();
    const onLeft = drawObject(world, dragBox(230, 640, 40, 40));
    const onRight = drawObject(world, dragBox(610, 640, 40, 40));
    world.togglePause();
    world.release(onLeft);
    world.release(onRight);
    runFor(world, 2);
    expect(objectById(world, onLeft).transform.y + 20).toBeCloseTo(696, 0);
    expect(objectById(world, onRight).transform.y + 20).toBeCloseTo(696, 0);
  });

  it('breaks the grey Line under a boulder, while the same boulder only cracks a black Line', () => {
    const world = createWorld();
    const grey = shelf(world, 'grey');
    drawPost(world, { x: 1000, y: 700 });
    const black = drawLine(
      world,
      [
        { x: 1000, y: 700 },
        { x: 1480, y: 700 },
      ],
      'black',
    );
    const onGrey = boulder(world, 440, 250);
    const onBlack = boulder(world, 1240, 250);
    world.togglePause();
    world.release(onGrey);
    world.release(onBlack);
    runFor(world, 2);

    expect(lineById(world, grey).pieces.length).toBeLessThan(10);
    expect(pieceIndexes(world, black)).toHaveLength(10);
    const worn = lineById(world, black).pieces.filter((p) => p.wear > 0);
    expect(worn.length).toBeGreaterThan(0);
    for (const piece of worn) expect(piece.wear).toBeLessThan(1);
    // The boulder rests on the black Line.
    expect(objectById(world, onBlack).transform.y + 30).toBeCloseTo(696, 0);
  });

  it('never wears a Line an Object rests on', () => {
    const world = createWorld();
    const id = shelf(world);
    const box = drawObject(world, dragBox(410, 635, 60, 60)); // 1 px above the Line
    world.fillAt({ x: 440, y: 665 }, 'black');
    drop(world, box, 60);

    for (const piece of lineById(world, id).pieces) expect(piece.durability).toBe(GREY_LINE);
  });

  it('wears a blue Line down through bounces that beat its threshold', () => {
    const world = createWorld();
    const id = shelf(world, 'blue');
    const ball = drawObject(world, dragCircle({ x: 440, y: 300 }, 20));
    drop(world, ball, 3);

    const worn = lineById(world, id).pieces.filter((p) => p.durability < BLUE_LINE);
    expect(worn.length).toBeGreaterThan(0);
  });

  it('makes a Line shorter than one Piece a single Piece', () => {
    const world = createWorld();
    const id = drawLine(world, [
      { x: 300, y: 500 },
      { x: 330, y: 500 },
    ]);

    expect(lineById(world, id).pieces).toHaveLength(1);
  });
});

describe('Taking back, Clear and Reset after a Piece has broken', () => {
  /** A grey shelf broken in the middle by a boulder that then falls away. */
  function brokenShelf(world: SandboxWorld) {
    const id = shelf(world);
    drawPost(world, { x: 680, y: 700 }); // so both halves stay
    const rock = boulder(world, 440, 250);
    world.togglePause();
    world.release(rock);
    world.togglePause();
    world.togglePause(); // the snapshot: the boulder let go, the shelf whole
    runFor(world, 1.5);
    expect(lineById(world, id).pieces.length).toBeLessThan(10);
    return { id, rock };
  }

  it("taking back a Line removes what's left of it", () => {
    const world = createWorld();
    const earlier = drawPost(world, { x: 100, y: 400 });
    const { id, rock } = brokenShelf(world);
    world.remove(rock);
    const others = world.lines.filter((l) => l.id !== id);

    world.removeStroke(id);

    expect(world.lines.map((l) => l.id)).toEqual(others.map((l) => l.id));
    expect(world.lines[0]!.id).toBe(earlier);
    const pieces = others.reduce((sum, l) => sum + l.pieces.length, 0);
    expect(world.bodyCount).toBe(FIXED_BODIES + pieces);
    expect(world.lines.some((l) => l.id === id)).toBe(false);
  });

  it('taking back a Line whose every Piece broke finds it gone', () => {
    const world = createWorld();
    // A short red Line under a boulder: one Piece, which breaks at once. A
    // grey prop under its left end, slanting away, Grounds it.
    drawLine(world, [
      { x: 420, y: 700 },
      { x: 300, y: 880 },
    ]);
    const red = drawLine(
      world,
      [
        { x: 420, y: 700 },
        { x: 460, y: 700 },
      ],
      'red',
    );
    const rock = boulder(world, 440, 250);
    drop(world, rock, 1.5);
    expect(world.lines.some((l) => l.id === red)).toBe(false);
    world.remove(rock);

    expect(world.removeStroke(red)).toEqual({ kind: 'gone', id: red });
  });

  it('Reset brings broken Pieces back, with the damage they had', () => {
    const world = createWorld();
    const id = shelf(world);
    const ball = drawObject(world, dragCircle({ x: 440, y: 300 }, 20));
    // Grey-filled, it cracks the shelf without breaking and leaving Rubble.
    world.fillAt({ x: 440, y: 300 }, 'grey');
    drop(world, ball, 1.5); // cracks the shelf
    expect(world.objects.map((o) => o.id)).toContain(ball);
    const cracked = lineById(world, id).pieces.map((p) => p.durability);
    expect(cracked.some((d) => d < GREY_LINE)).toBe(true);
    world.togglePause();
    world.remove(ball);
    const rock = boulder(world, 440, 250);
    world.togglePause();
    world.release(rock);
    world.togglePause();
    world.togglePause(); // the snapshot: shelf cracked, boulder let go
    runFor(world, 1.5);
    expect(lineById(world, id).pieces.length).toBeLessThan(10);
    const heard = hear(world);

    world.reset();

    expect(lineById(world, id).pieces.map((p) => p.durability)).toEqual(cracked);
    // It starts over, and every Piece comes back as added.
    const [start, ...added] = heard();
    expect(start!.kind).toBe('start-over');
    expect(
      entriesOf(added, 'added').filter(({ what }) => what.thing === 'piece' && what.id === id),
    ).toHaveLength(10);
  });

  it('Reset replays a Piece breaking exactly', () => {
    const world = createWorld();
    const { id } = brokenShelf(world);
    const first = {
      pieces: pieceIndexes(world, id),
      objects: world.objects.map((o) => o.transform),
    };

    world.reset();
    runFor(world, 1.5);

    expect({
      pieces: pieceIndexes(world, id),
      objects: world.objects.map((o) => o.transform),
    }).toEqual(first);
  });

  it('Clear removes a broken Line with everything else', () => {
    const world = createWorld();
    brokenShelf(world);

    const heard = hear(world);

    world.clear();

    expect(world.lines).toHaveLength(0);
    expect(world.bodyCount).toBe(FIXED_BODIES);
    expect(heard().map((entry) => entry.kind)).toEqual(['start-over']);
  });
});
