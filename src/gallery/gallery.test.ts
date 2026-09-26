import { describe, expect, it } from 'vitest';
import { COLOURS } from '../materials/colour';
import type { SandboxWorld } from '../sandbox/sandbox-world';
import { objectById, runFor, sandboxWorlds } from '../sandbox/test-support';
import {
  BOULDER_DEMO,
  BOUNCE_DEMO,
  CHAIN_DEMO,
  DEMOLITION_DEMO,
  DROP_DEMO,
  GALLERY,
  GLUE_DEMO,
  KNOCK_DEMO,
  RUBBLE_DEMO,
  SHRAPNEL_DEMO,
  SLIDE_DEMO,
  STICK_DEMO,
  THIRD_BOUNCE_DEMO,
} from './gallery';

const createWorld = sandboxWorlds();

/** A copy of `value` with every `id` left out. */
function withoutIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'id')
      .map(([key, field]) => [key, withoutIds(field)]),
  );
}

/**
 * Everything in the Arena, of every kind: what a replay must play out the
 * same. Ids are left out: ids are never reused, so what a run makes (Rubble
 * from a broken Fill) gets new ones each time it is played.
 */
const played = (world: SandboxWorld) => withoutIds(world.contents);

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

    it(`${demo.name}: R brings back the Arena contents as they were at Space`, () => {
      const world = createWorld();
      demo.build(world);
      runFor(world, 1);
      const running = world.contents;

      world.togglePause();
      world.togglePause(); // takes a snapshot and rebuilds the world from it
      const started = world.contents;
      runFor(world, 1);
      world.reset();

      expect(started).toEqual(running);
      expect(world.contents).toEqual(started);
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

  it('Drop: red explodes, grey, blue and green crack, black is barely scratched', () => {
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

  it('Rubble: pebbles and stones spill onto the grey Line, and the stones crack it', () => {
    const world = createWorld();
    RUBBLE_DEMO.build(world);

    runFor(world, 3);

    expect(world.objects).toHaveLength(0);
    const pebbles = world.rubble.filter((r) => r.colour === 'grey');
    const stones = world.rubble.filter((r) => r.colour === 'black');
    expect(pebbles.length).toBeGreaterThan(stones.length);
    expect(stones.length).toBeGreaterThan(0);
    // The grey Lines under the pebbles and under the stones; the anvils between.
    const [underPebbles, , underStones] = world.lines;
    const worn = (line: typeof underPebbles) => Math.max(...line!.pieces.map((p) => p.wear));
    expect(worn(underStones)).toBeGreaterThan(0.25); // cracked
    expect(worn(underPebbles)).toBeLessThan(worn(underStones));
  });

  it('Glue: green stops the hollow ball soonest and the black-filled one last; the one on grey rolls furthest', () => {
    const world = createWorld();
    GLUE_DEMO.build(world);

    runFor(world, 3);

    const [onGrey, hollow, greyFilled, blackFilled] = world.objects.map((o) => o.transform.x - 230);
    expect(hollow).toBeLessThan(2 * 48);
    expect(greyFilled).toBeGreaterThan(hollow!);
    expect(blackFilled).toBeGreaterThan(greyFilled!);
    expect(onGrey).toBeGreaterThan(1.5 * blackFilled!);
    const [, ...green] = world.lines;
    for (const line of green) expect(line.pieces.some((p) => p.wear > 0)).toBe(true);
  });

  it('Stick: each green Object glues itself to the first new thing it touches', () => {
    const world = createWorld();
    STICK_DEMO.build(world);

    runFor(world, 2);

    const green = world.objects.filter((o) => o.colour === 'green');
    expect(world.bonds.map((b) => b.object).sort()).toEqual(green.map((o) => o.id).sort());
    const [hanger] = green;
    expect(hanger!.transform.y).toBeLessThan(340); // hanging under the Line
    const knocked = world.objects.find((o) => o.colour === 'grey')!;
    expect(knocked.frozen).toBe(false);
  });

  it('Chain: the bombs go off one by one; the one beyond reach stays', () => {
    const world = createWorld();
    CHAIN_DEMO.build(world);
    const bombs = world.objects.filter((o) => o.colour === 'red');
    const lone = bombs.find((o) => Math.abs(o.transform.x - 230) < 1); // hanging above the chain

    let most = 0;
    for (let step = 0; step < 180; step++) {
      world.step();
      most = Math.max(most, world.blasts.length);
    }

    expect(world.objects.filter((o) => o.colour === 'red').map((o) => o.id)).toEqual([lone!.id]);
    expect(objectById(world, lone!.id)).toMatchObject({ frozen: true, wear: 0 });
    expect(most).toBeGreaterThan(1); // rings spreading at once, each started later
    expect(most).toBeLessThan(bombs.length - 1);
    expect(world.objects.filter((o) => o.colour === 'grey').every((o) => !o.frozen)).toBe(true);
  });

  it('Shrapnel: the Blast throws the pebbles, which knock loose posts it can’t reach', () => {
    const world = createWorld();
    SHRAPNEL_DEMO.build(world);

    let fastest = 0;
    for (let step = 0; step < 90; step++) {
      world.step();
      for (const { velocity } of world.rubble) {
        fastest = Math.max(fastest, Math.hypot(velocity.x, velocity.y));
      }
    }

    expect(world.rubble.length).toBeGreaterThan(10);
    expect(fastest).toBeGreaterThan(1000); // the Fill's kick alone is 200 px/s
    const posts = world.objects.filter((o) => o.colour === 'grey');
    expect(posts).toHaveLength(2);
    expect(posts.every((o) => !o.frozen)).toBe(true);
  });

  it('Demolition: the chain plays out, with 5 Blasts, about 60 Rubble and about 30 Droplets', () => {
    const world = createWorld();
    DEMOLITION_DEMO.build(world);
    const { rubbleCap } = world.materials;
    // By distinct ids: a Droplet turns into a Patch as it lands, and ids are never reused.
    const blasts = new Set<number>();
    const rubble = new Set<number>();
    const droplets = new Set<number>();

    for (let step = 0; step < 300; step++) {
      world.step();
      const { contents } = world;
      for (const { id } of contents.blasts) blasts.add(id);
      for (const { id } of contents.rubble) rubble.add(id);
      for (const { id } of contents.droplets) droplets.add(id);
      expect(contents.rubble.length).toBeLessThan(rubbleCap);
    }

    expect(blasts.size).toBe(5);
    expect(world.blasts).toHaveLength(0);
    expect(rubble.size).toBeGreaterThanOrEqual(55);
    expect(rubble.size).toBeLessThanOrEqual(65);
    expect(droplets.size).toBeGreaterThanOrEqual(20); // two Spills of 10 to 15
    expect(droplets.size).toBeLessThanOrEqual(30);
    expect(world.objects).toHaveLength(0); // every bomb, box and Spill went
  });
});
