import { describe, expect, it } from 'vitest';
import { add, scale, type Vec2 } from '../geometry/vec2';
import { COLOURS, type Colour } from '../materials/colour';
import { dragAlong, dragBox, dragCircle, dragPolygon } from '../stroke/pointer-paths';
import type { SandboxWorld } from './sandbox-world';
import {
  drawLine,
  drawObject,
  objectById,
  reboundHeight,
  runFor,
  sandboxWorlds,
} from './test-support';

const createWorld = sandboxWorlds();

describe('Colours: Lines', () => {
  function bounceOffLine(colour: Colour): number {
    const world = createWorld();
    drawLine(
      world,
      [
        { x: 300, y: 600 },
        { x: 500, y: 600 },
      ],
      colour,
    );
    const ball = drawObject(world, dragCircle({ x: 400, y: 400 }, 15));
    world.togglePause();
    world.release(ball);
    return reboundHeight(world, ball);
  }

  it('bounces a ball higher off a blue Line than off a grey one', () => {
    const blue = bounceOffLine('blue');
    const grey = bounceOffLine('grey');

    // Dropped 181 px: blue gives most of it back, grey barely any.
    expect(blue).toBeGreaterThan(100);
    expect(grey).toBeLessThan(10);
  });

  /** A 40 px box resting on a 27° ramp of the given Colour; returns how far it slid in 1 s. */
  function slideDownRamp(colour: Colour): number {
    const world = createWorld();
    const top = { x: 200, y: 400 };
    const along = { x: 400 / Math.hypot(400, 200), y: 200 / Math.hypot(400, 200) };
    const up = { x: along.y, y: -along.x };
    drawLine(world, [top, add(top, scale(along, 447))], colour);
    const corner = add(add(top, scale(along, 150)), scale(up, 5)); // 1 px above the Line's surface
    const box = drawObject(
      world,
      dragPolygon([
        corner,
        add(corner, scale(along, 40)),
        add(add(corner, scale(along, 40)), scale(up, 40)),
        add(corner, scale(up, 40)),
      ]),
    );
    const start = objectById(world, box).transform;
    world.togglePause();
    world.release(box);
    runFor(world, 1);
    const end = objectById(world, box).transform;
    return Math.hypot(end.x - start.x, end.y - start.y);
  }

  it('lets a box slide down a slippery blue ramp that holds it in black', () => {
    expect(slideDownRamp('blue')).toBeGreaterThan(50);
    expect(slideDownRamp('black')).toBeLessThan(3);
  });

  it('remembers the Colour each Line was drawn in', () => {
    const world = createWorld();
    for (const [k, colour] of COLOURS.entries()) {
      drawLine(
        world,
        [
          { x: 200, y: 200 + 50 * k },
          { x: 600, y: 200 + 50 * k },
        ],
        colour,
      );
    }

    expect(world.lines.map((line) => line.colour)).toEqual([...COLOURS]);
  });
});

describe('Colours: Objects', () => {
  it('remembers the Colour each Object was drawn in', () => {
    const world = createWorld();
    for (const [k, colour] of COLOURS.entries()) {
      drawObject(world, dragBox(100 + 100 * k, 300, 60, 60), colour);
    }

    expect(world.objects.map((object) => object.colour)).toEqual([...COLOURS]);
  });

  /** Ways a Frozen 40 px box at (380, 480) can be set moving while physics runs. */
  const unfreezings: [string, (world: SandboxWorld, box: number) => void][] = [
    ['Released', (world, box) => world.release(box)],
    [
      'squeezed off a Line',
      (world) =>
        drawLine(world, [
          { x: 415, y: 300 },
          { x: 415, y: 700 },
        ]),
    ],
  ];

  for (const [how, unfreeze] of unfreezings) {
    it(`keeps its bounce after it is ${how}`, () => {
      const rebound = (colour: Colour) => {
        const world = createWorld();
        const box = drawObject(world, dragBox(380, 480, 40, 40), colour);
        world.togglePause();
        unfreeze(world, box);
        runFor(world, 0.1);
        expect(objectById(world, box).frozen).toBe(false);
        return reboundHeight(world, box);
      };

      // Falling about 360 px onto the Terrain, which has no bounce of its own.
      expect(rebound('blue')).toBeGreaterThan(150);
      expect(rebound('grey')).toBeLessThan(15);
    });
  }

  it('keeps its bounce after it is woken by a hit', () => {
    /** Knocked sideways into a grey wall: how fast it comes back, relative to how fast it hit. */
    const bounceOffWall = (colour: Colour) => {
      const world = createWorld();
      const box = drawObject(world, dragBox(380, 480, 40, 40), colour);
      const ball = drawObject(world, dragCircle({ x: 360, y: 500 }, 15));
      drawLine(world, [
        { x: 520, y: 300 },
        { x: 520, y: 860 },
      ]);
      world.togglePause();
      world.release(ball, { x: 300, y: 0 });
      let hit = 0;
      let back = 0;
      for (let step = 0; step < 90; step++) {
        world.step();
        const vx = objectById(world, box).velocity.x;
        hit = Math.max(hit, vx);
        back = Math.max(back, -vx);
      }
      return back / hit;
    };

    // The hit leaves it spinning a little, so it meets the wall corner first.
    expect(bounceOffWall('blue')).toBeGreaterThan(0.6);
    expect(bounceOffWall('grey')).toBeLessThan(0.2);
  });

  it('bounces the waking hit off a Frozen blue Object', () => {
    /** How fast the two part after the hit, relative to how fast they met. */
    const restitution = (colour: Colour) => {
      const world = createWorld();
      const box = drawObject(world, dragBox(380, 480, 40, 40), colour);
      const ball = drawObject(world, dragCircle({ x: 360, y: 500 }, 15));
      world.togglePause();
      world.release(ball, { x: 300, y: 0 });
      runFor(world, 3 / 60);
      return (objectById(world, box).velocity.x - objectById(world, ball).velocity.x) / 300;
    };

    expect(restitution('blue')).toBeCloseTo(0.9, 1);
    expect(restitution('grey')).toBeCloseTo(0.1, 1);
  });
});

describe('Colours: drawing rules', () => {
  /** Strokes covering every milestone 1 outcome: Line, Object and each rejection. */
  const strokes: Vec2[][] = [
    dragAlong([
      { x: 200, y: 500 },
      { x: 600, y: 700 },
      { x: 700, y: 950 }, // into the ground: cut at the Terrain
    ]),
    dragBox(300, 200, 80, 60),
    dragBox(600, 200, 30, 10), // too small
    dragPolygon([
      { x: 800, y: 200 },
      { x: 900, y: 300 },
      { x: 900, y: 200 },
      { x: 800, y: 300 },
    ]), // crosses itself
    dragBox(300, 850, 60, 60), // overlaps the ground
    dragBox(320, 220, 40, 20), // overlaps the box above
    [{ x: 100, y: 100 }], // a mis-click
  ];

  function outcomes(colour: Colour) {
    const world = createWorld();
    const results = strokes.map((samples) => {
      const outcome = world.submitStroke(samples, colour);
      return outcome.kind === 'rejected' ? `rejected: ${outcome.reason}` : outcome.kind;
    });
    const shapes = {
      lines: world.lines.map((line) => line.segments),
      objects: world.objects.map((object) => object.outline),
    };
    return { results, shapes };
  }

  it('turns the same Strokes into the same Lines, Objects and rejections in every Colour', () => {
    const grey = outcomes('grey');
    expect(grey.results).toEqual([
      'line',
      'object',
      'rejected: too-small',
      'rejected: self-crossing',
      'rejected: overlaps',
      'rejected: overlaps',
      'dropped',
    ]);

    for (const colour of COLOURS) expect(outcomes(colour), colour).toEqual(grey);
  });
});
