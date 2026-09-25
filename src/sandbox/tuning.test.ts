import { describe, expect, it } from 'vitest';
import { dragBox, dragCircle } from '../stroke/pointer-paths';
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

/** A blue Line with a grey ball dropped onto it from 181 px up; returns the ball. */
function ballOverBlueLine(world: SandboxWorld): number {
  drawLine(
    world,
    [
      { x: 300, y: 600 },
      { x: 500, y: 600 },
    ],
    'blue',
  );
  const ball = drawObject(world, dragCircle({ x: 400, y: 400 }, 15));
  world.togglePause();
  world.release(ball);
  // Pause and start again, so R comes back to the ball let go.
  world.togglePause();
  world.togglePause();
  return ball;
}

describe('Tuning the material table while the sandbox runs', () => {
  it('changes the very next bounce when a restitution changes', () => {
    const world = createWorld();
    const ball = ballOverBlueLine(world);
    const first = reboundHeight(world, ball);

    world.materials.colours.blue.line.restitution = 0.3;
    const second = reboundHeight(world, ball);

    // Unchanged, the second bounce would climb about 0.9² as high as the first.
    expect(first).toBeGreaterThan(100);
    expect(second).toBeLessThan(0.25 * first);
  });

  it('applies a new minimum bounce speed from the next step', () => {
    const world = createWorld();
    const ball = ballOverBlueLine(world);

    world.materials.minBounceSpeed = 2000; // faster than the ball will fall

    expect(reboundHeight(world, ball)).toBeLessThan(1);
  });

  it('applies a new wake speed from the next step', () => {
    const woken = (wakeSpeed: number) => {
      const world = createWorld();
      const box = drawObject(world, dragBox(600, 400, 60, 60));
      const ball = drawObject(world, dragCircle({ x: 580, y: 430 }, 15));
      world.togglePause();
      world.materials.wakeSpeed = wakeSpeed;
      world.release(ball, { x: 300, y: 0 });
      runFor(world, 0.3);
      return !objectById(world, box).frozen;
    };

    expect(woken(50)).toBe(true);
    expect(woken(500)).toBe(false);
  });

  it('applies a density change only to Objects drawn or filled afterwards', () => {
    const world = createWorld();
    const before = drawObject(world, dragBox(300, 300, 60, 60));
    const mass = objectById(world, before).mass;

    world.materials.colours.grey.outline.density = 2;
    const after = drawObject(world, dragBox(500, 300, 60, 60));
    world.materials.colours.black.fill.density = 10;
    world.fillAt({ x: 330, y: 330 }, 'black');
    runFor(world, 0.1);

    expect(objectById(world, after).mass).toBeCloseTo(2 * mass, 6);
    // Its Outline keeps the mass it was drawn with; about 3600 px² of Fill at
    // density 10 and 0.00075 per px² adds about 27.
    expect(objectById(world, before).mass).toBeCloseTo(mass + 27, 0);
  });

  it('keeps edits through R and Clear: they are tuning, not simulation', () => {
    const world = createWorld();
    const ball = ballOverBlueLine(world);
    world.materials.colours.blue.line.restitution = 0.3;
    runFor(world, 0.5);

    world.reset();
    expect(world.materials.colours.blue.line.restitution).toBe(0.3);
    expect(reboundHeight(world, ball)).toBeLessThan(0.25 * 181);

    world.clear();
    expect(world.materials.colours.blue.line.restitution).toBe(0.3);
  });
});
