import { add, scale, type Vec2 } from '../geometry/vec2';
import { COLOURS, type Colour } from '../materials/colour';
import type { SandboxWorld, StrokeId } from '../sandbox/sandbox-world';
import { dragAlong, dragBox, dragCircle, dragPolygon } from '../stroke/pointer-paths';

/**
 * The Colour gallery: ready-made demos that show each Colour's behaviour
 * without building it first. Each demo sets itself up on a cleared Arena
 * through the Sandbox world's commands, then starts physics and lets its
 * Objects go.
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

/** Starts physics and Releases the given Objects. */
function letGo(world: SandboxWorld, objects: readonly StrokeId[]): void {
  if (!world.isRunning) world.togglePause();
  for (const id of objects) world.release(id);
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
    if (!world.isRunning) world.togglePause();
    for (const ball of balls) world.release(ball, { x: 600, y: 0 });
  },
};

export const GALLERY: readonly Demo[] = [BOUNCE_DEMO, SLIDE_DEMO, KNOCK_DEMO];
