import { add, scale, type Vec2 } from '../geometry/vec2';
import { COLOURS, type Colour } from '../materials/colour';
import type { SandboxWorld, StrokeId } from '../sandbox/sandbox-world';
import { dragAlong, dragBox, dragCircle, dragPolygon } from '../stroke/pointer-paths';

/**
 * The Colour gallery: ready-made demos that show each Colour's behaviour
 * without building it first. Each demo sets itself up on a cleared Arena
 * through the Sandbox world's commands, then starts physics and lets its
 * Objects go, so that R and Space replay it.
 */
export interface Demo {
  readonly name: string;
  build(world: SandboxWorld): void;
}

/** Horizontal centre of the k-th of five side-by-side stations. */
const station = (k: number) => 250 + 300 * k;

function drawLine(world: SandboxWorld, path: Vec2[], colour: Colour): void {
  const outcome = world.submitStroke(dragAlong(path), colour);
  if (outcome.kind !== 'line') throw new Error(`demo Line became ${outcome.kind}`);
}

function drawObject(world: SandboxWorld, samples: Vec2[], colour: Colour): StrokeId {
  const outcome = world.submitStroke(samples, colour);
  if (outcome.kind !== 'object') throw new Error(`demo Object became ${outcome.kind}`);
  return outcome.id;
}

/**
 * Starts physics and Releases the given Objects, each with its velocity if
 * given. Then pauses and starts again at once, so the snapshot R returns to
 * has them let go and R, Space replays the demo.
 */
function letGo(world: SandboxWorld, objects: readonly (StrokeId | [StrokeId, Vec2])[]): void {
  if (!world.isRunning) world.togglePause();
  for (const object of objects) {
    if (typeof object === 'number') world.release(object);
    else world.release(...object);
  }
  world.togglePause();
  world.togglePause();
}

/** The same grey ball dropped onto a Line of each Colour: blue bounces it back up. */
export const BOUNCE_DEMO: Demo = {
  name: 'Bounce',
  build(world) {
    const balls = COLOURS.map((colour, k) => {
      const x = station(k);
      drawLine(
        world,
        [
          { x: x - 90, y: 620 },
          { x: x + 90, y: 620 },
        ],
        colour,
      );
      return drawObject(world, dragCircle({ x, y: 300 }, 20), 'grey');
    });
    letGo(world, balls);
  },
};

/** The same grey box on a 35° ramp of each Colour: it races down blue and holds on black. */
export const SLIDE_DEMO: Demo = {
  name: 'Slide',
  build(world) {
    const run = { x: 200, y: 140 };
    const length = Math.hypot(run.x, run.y);
    const along = scale(run, 1 / length);
    const up = { x: along.y, y: -along.x };
    const boxes = COLOURS.map((colour, k) => {
      const top = { x: station(k) - 100, y: 360 };
      drawLine(world, [top, add(top, run)], colour);
      // A 40 px box resting on the ramp, 1 px above the Line's surface.
      const corner = add(add(top, scale(along, 30)), scale(up, 5));
      const side = scale(along, 40);
      const height = scale(up, 40);
      return drawObject(
        world,
        dragPolygon([
          corner,
          add(corner, side),
          add(add(corner, side), height),
          add(corner, height),
        ]),
        'grey',
      );
    });
    letGo(world, boxes);
  },
};

/**
 * The same ball thrown at a Frozen hollow box, a grey-filled one and a
 * black-filled one: the heavier the Fill, the less the box moves, and the
 * black-filled one is too heavy for the ball to wake.
 */
export const KNOCK_DEMO: Demo = {
  name: 'Knock',
  build(world) {
    const balls = ([null, 'grey', 'black'] as const).map((fill, k) => {
      const x = 250 + 450 * k;
      drawObject(world, dragBox(x, 560, 60, 60), 'grey');
      if (fill) world.fillAt({ x: x + 30, y: 590 }, fill);
      // Aimed a little high: it drops 8 px on its way to the box.
      return drawObject(world, dragCircle({ x: x - 80, y: 582 }, 20), 'grey');
    });
    letGo(
      world,
      balls.map((ball): [StrokeId, Vec2] => [ball, { x: 600, y: 0 }]),
    );
  },
};

/**
 * A 60 px box of each Outline Colour dropped from high up: red breaks, grey
 * and green crack, black barely notices, and blue cracks and bounces until
 * its third impact breaks it. F1 shows what durability each has left.
 */
export const DROP_DEMO: Demo = {
  name: 'Drop',
  build(world) {
    const boxes = COLOURS.map((colour, k) =>
      drawObject(world, dragBox(90 + 170 * k, 100, 60, 60), colour),
    );
    letGo(world, boxes);
  },
};

/** A blue ball bouncing on the ground: it cracks on each bounce and breaks on the third. */
export const THIRD_BOUNCE_DEMO: Demo = {
  name: 'Third bounce',
  build(world) {
    letGo(world, [drawObject(world, dragCircle({ x: 480, y: 250 }, 20), 'blue')]);
  },
};

/**
 * The same boulder, a black box filled with black, dropped onto a grey and a
 * black Line: the grey Pieces under it break and it falls through, while
 * the black Line cracks and holds it. F1 shows each Piece's durability.
 */
export const BOULDER_DEMO: Demo = {
  name: 'Boulder',
  build(world) {
    const boulders = (['grey', 'black'] as const).map((colour, k) => {
      const x = 560 + 800 * k;
      drawLine(
        world,
        [
          { x: x - 120, y: 620 },
          { x: x + 120, y: 620 },
        ],
        colour,
      );
      const boulder = drawObject(world, dragBox(x - 30, 150, 60, 60), 'black');
      world.fillAt({ x, y: 180 }, 'black');
      return boulder;
    });
    letGo(world, boulders);
  },
};

/**
 * A grey-filled and a black-filled box dropped side by side onto a short
 * black Line, an anvil: both break, the grey one into a shower of pebbles
 * and the black one into fewer, heavier stones. The Rubble spills onto a
 * grey Line below, where the stones crack it and the pebbles barely do.
 */
export const RUBBLE_DEMO: Demo = {
  name: 'Rubble',
  build(world) {
    const boxes = (['grey', 'black'] as const).map((fill, k) => {
      const x = 640 + 620 * k;
      drawLine(
        world,
        [
          { x: x - 160, y: 850 },
          { x: x + 160, y: 850 },
        ],
        'grey',
      );
      drawLine(
        world,
        [
          { x: x - 20, y: 364 },
          { x: x + 20, y: 364 },
        ],
        'black',
      );
      const box = drawObject(world, dragBox(x - 50, 180, 100, 100), 'grey');
      world.fillAt({ x, y: 230 }, fill);
      return box;
    });
    letGo(world, boxes);
  },
};

/**
 * Three balls of different weights rolled at the same speed across green
 * floors, above one rolled across grey: glue stops the hollow ball within a
 * Piece or two and the grey-filled one soon after, while the black-filled
 * one, heaviest, is slowed least. The green Pieces wear as they work; F1
 * shows their durability.
 */
export const GLUE_DEMO: Demo = {
  name: 'Glue',
  build(world) {
    const lanes = (['grey', 'green', 'green', 'green'] as const).map((colour, k) => {
      const y = 250 + 180 * k;
      drawLine(
        world,
        [
          { x: 150, y },
          { x: 1500, y },
        ],
        colour,
      );
      const ball = drawObject(world, dragCircle({ x: 230, y: y - 25 }, 20), 'grey');
      const fill = ([null, null, 'grey', 'black'] as const)[k];
      if (fill) world.fillAt({ x: 230, y: y - 25 }, fill);
      return ball;
    });
    letGo(
      world,
      lanes.map((ball): [StrokeId, Vec2] => [ball, { x: 500, y: 0 }]),
    );
  },
};

/**
 * Green Objects sticking to the first new thing they touch: a box thrown up
 * at a Line glues itself under it and hangs there, a ball thrown at a wall
 * glues itself to it, and a box thrown at a Frozen box knocks it loose and
 * the two tumble down as one.
 */
export const STICK_DEMO: Demo = {
  name: 'Stick',
  build(world) {
    drawLine(
      world,
      [
        { x: 200, y: 300 },
        { x: 500, y: 300 },
      ],
      'grey',
    );
    const hanger = drawObject(world, dragBox(330, 520, 40, 40), 'green');
    drawLine(
      world,
      [
        { x: 1000, y: 200 },
        { x: 1000, y: 600 },
      ],
      'grey',
    );
    const ball = drawObject(world, dragCircle({ x: 750, y: 500 }, 20), 'green');
    drawObject(world, dragBox(1450, 300, 60, 60), 'grey');
    const thrown = drawObject(world, dragBox(1250, 320, 40, 40), 'green');
    letGo(world, [
      [hanger, { x: 0, y: -750 }],
      [ball, { x: 600, y: -400 }],
      [thrown, { x: 700, y: -150 }],
    ]);
  },
};

export const GALLERY: readonly Demo[] = [
  BOUNCE_DEMO,
  SLIDE_DEMO,
  KNOCK_DEMO,
  DROP_DEMO,
  THIRD_BOUNCE_DEMO,
  BOULDER_DEMO,
  RUBBLE_DEMO,
  GLUE_DEMO,
  STICK_DEMO,
];
