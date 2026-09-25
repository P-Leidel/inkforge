import { describe, expect, it } from 'vitest';
import { COLOURS } from '../materials/colour';
import { runFor, sandboxWorlds } from '../sandbox/test-support';
import { BOUNCE_DEMO, GALLERY, KNOCK_DEMO, SLIDE_DEMO } from './gallery';

const createWorld = sandboxWorlds();

describe('Colour gallery', () => {
  for (const demo of GALLERY) {
    it(`${demo.name}: builds through the Sandbox world and starts physics`, () => {
      const world = createWorld();

      demo.build(world); // throws if any of its Strokes is refused

      expect(world.isRunning).toBe(true);
      expect(world.objects.some((o) => !o.frozen)).toBe(true);
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

  it('Knock: the hollow box flies, the grey-filled one is nudged, the black-filled one holds', () => {
    const world = createWorld();
    KNOCK_DEMO.build(world);

    runFor(world, 0.3);

    const boxes = world.objects.filter((o) => o.mass > 1); // the balls weigh 0.75
    const [hollow, grey, black] = boxes;
    expect(boxes.map((b) => b.fill)).toEqual([null, 'grey', 'black']);
    expect(hollow!.velocity.x).toBeGreaterThan(1.5 * grey!.velocity.x);
    expect(grey!.frozen).toBe(false);
    expect(black!.frozen).toBe(true);
  });
});
