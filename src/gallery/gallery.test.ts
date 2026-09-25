import { describe, expect, it } from 'vitest';
import { COLOURS } from '../materials/colour';
import { runFor, sandboxWorlds } from '../sandbox/test-support';
import { BOUNCE_DEMO, GALLERY, SLIDE_DEMO } from './gallery';

const createWorld = sandboxWorlds();

describe('Colour gallery', () => {
  for (const demo of GALLERY) {
    it(`${demo.name}: builds through the Sandbox world, starts physics and lets its Objects go`, () => {
      const world = createWorld();

      demo.build(world); // throws if any of its Strokes is refused

      expect(world.isRunning).toBe(true);
      expect(world.objects.length).toBeGreaterThan(0);
      expect(world.objects.every((o) => !o.frozen)).toBe(true);
    });
  }

  it('Bounce: puts a Line of each Colour side by side', () => {
    const world = createWorld();
    BOUNCE_DEMO.build(world);

    expect(world.lines.map((line) => line.colour)).toEqual([...COLOURS]);
  });

  it('Slide: the box races down blue and holds on black', () => {
    const world = createWorld();
    SLIDE_DEMO.build(world);
    const start = world.objects.map((o) => o.transform);

    runFor(world, 0.8);

    const moved = world.objects.map((o, k) =>
      Math.hypot(o.transform.x - start[k]!.x, o.transform.y - start[k]!.y),
    );
    const [grey, blue, , black] = moved;
    expect(blue).toBeGreaterThan(2 * grey!);
    expect(black).toBeLessThan(3);
  });
});
