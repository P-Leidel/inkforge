import { describe, expect, it } from 'vitest';
import { COLOURS } from '../materials/colour';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { runFor, sandboxWorlds } from '../sandbox/test-support';
import {
  BOULDER_DEMO,
  BOUNCE_DEMO,
  DROP_DEMO,
  GALLERY,
  KNOCK_DEMO,
  SLIDE_DEMO,
  THIRD_BOUNCE_DEMO,
} from './gallery';

const createWorld = sandboxWorlds();

/** Where every Object is and what is left of every Line. */
const played = (world: SandboxWorld) => ({
  objects: world.objects.map((o) => o.transform),
  pieces: world.lines.map((l) => l.pieces.map((p) => [p.index, p.durability])),
});

describe('Colour gallery', () => {
  for (const demo of GALLERY) {
    it(`${demo.name}: builds through the Sandbox world and starts physics`, () => {
      const world = createWorld();

      demo.build(world); // throws if any of its Strokes is refused

      expect(world.isRunning).toBe(true);
      expect(world.objects.some((o) => !o.frozen)).toBe(true);
    });

    it(`${demo.name}: plays the same again after R and Space`, () => {
      const world = createWorld();
      demo.build(world);
      runFor(world, 1);
      const first = played(world);

      world.reset();
      runFor(world, 1);

      expect(played(world)).toEqual(first);
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

  it('Drop: red breaks, grey, blue and green crack, black is barely scratched', () => {
    const world = createWorld();
    DROP_DEMO.build(world);

    runFor(world, 3);

    const wear = Object.fromEntries(world.objects.map((o) => [o.colour, o.wear]));
    expect(Object.keys(wear)).toEqual(['grey', 'blue', 'green', 'black']);
    for (const colour of ['grey', 'blue', 'green'] as const) {
      expect(wear[colour]).toBeGreaterThan(0.25); // cracked
      expect(wear[colour]).toBeLessThan(1);
    }
    expect(wear.black).toBeLessThan(0.25);
  });

  it('Third bounce: the blue ball breaks on its third bounce', () => {
    const world = createWorld();
    THIRD_BOUNCE_DEMO.build(world);
    let impacts = 0;

    for (let step = 0; step < 600 && world.objects.length > 0; step++) {
      impacts = world.objects[0]!.impacts;
      world.step();
    }

    expect(world.objects).toHaveLength(0);
    expect(impacts).toBe(2); // the third impact broke it
  });

  it('Boulder: breaks the grey Line and falls through; the black Line cracks and holds it', () => {
    const world = createWorld();
    BOULDER_DEMO.build(world);

    runFor(world, 2);

    const [grey, black] = world.lines;
    expect(grey!.pieces.length).toBeLessThan(5);
    expect(black!.pieces).toHaveLength(5);
    expect(black!.pieces.some((p) => p.wear > 0.25)).toBe(true);
    const [fallen, held] = world.objects;
    expect(fallen!.transform.y).toBeGreaterThan(700);
    expect(held!.transform.y + 30).toBeCloseTo(616, 0);
  });
});
