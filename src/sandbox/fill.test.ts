import { describe, expect, it } from 'vitest';
import { COLOURS, type Colour } from '../materials/colour';
import { dragBox, dragCircle } from '../stroke/pointer-paths';
import type { SandboxWorld } from './sandbox-world';
import { drawLine, drawObject, objectById, runFor, sandboxWorlds } from './test-support';

const createWorld = sandboxWorlds();

/** A 60 px box with its top-left corner at (x, y). */
const box60 = (world: SandboxWorld, x: number, y: number, colour: Colour = 'grey') =>
  drawObject(world, dragBox(x, y, 60, 60), colour);

describe('Fill', () => {
  it('fills the Object under the point with the given Colour', () => {
    const world = createWorld();
    const box = box60(world, 300, 300);

    const outcome = world.fillAt({ x: 330, y: 330 }, 'black');

    expect(outcome).toEqual({ kind: 'filled', id: box });
    expect(objectById(world, box).fill).toBe('black');
  });

  it('does nothing when the point is outside every Object', () => {
    const world = createWorld();
    const box = box60(world, 300, 300);

    expect(world.fillAt({ x: 400, y: 330 }, 'grey')).toEqual({ kind: 'missed' });
    expect(objectById(world, box).fill).toBeNull();
  });

  it('makes the Object heavier at once: a grey Fill takes a 60 px box from 1.44 to 4.14', () => {
    const world = createWorld();
    const box = box60(world, 300, 300);
    expect(objectById(world, box).mass).toBeCloseTo(1.44, 1);

    world.fillAt({ x: 330, y: 330 }, 'grey');

    expect(objectById(world, box).mass).toBeCloseTo(4.14, 1);
  });

  it('refuses a second Fill: the Object is already filled', () => {
    const world = createWorld();
    const box = box60(world, 300, 300);
    world.fillAt({ x: 330, y: 330 }, 'grey');

    const outcome = world.fillAt({ x: 320, y: 340 }, 'black');

    expect(outcome).toEqual({ kind: 'already-filled', id: box });
    expect(objectById(world, box).fill).toBe('grey');
    expect(objectById(world, box).mass).toBeCloseTo(4.14, 1);
  });

  it('allows every Outline and Fill pair, the same Colour twice included', () => {
    const world = createWorld();
    for (const [row, outline] of COLOURS.entries()) {
      for (const [column, fill] of COLOURS.entries()) {
        const x = 100 + column * 80;
        const y = 100 + row * 80;
        const box = box60(world, x, y, outline);
        expect(world.fillAt({ x: x + 30, y: y + 30 }, fill)).toEqual({ kind: 'filled', id: box });
        expect(objectById(world, box).fill).toBe(fill);
      }
    }
  });

  it('fills a moving Object where it is now, while running', () => {
    const world = createWorld();
    const box = box60(world, 300, 300);
    world.togglePause();
    world.release(box);
    runFor(world, 2); // falls onto the ground at y = 880

    expect(world.fillAt({ x: 330, y: 330 }, 'grey').kind).toBe('missed');
    expect(world.fillAt({ x: 330, y: 850 }, 'grey')).toEqual({ kind: 'filled', id: box });
  });

  it('fills a Frozen Object without waking it, paused or running', () => {
    const world = createWorld();
    const paused = box60(world, 300, 300);
    const running = box60(world, 500, 300);

    const drawnAt = [paused, running].map((id) => objectById(world, id).transform);

    world.fillAt({ x: 330, y: 330 }, 'black');
    world.togglePause();
    world.fillAt({ x: 530, y: 330 }, 'black');
    runFor(world, 1);

    for (const [k, id] of [paused, running].entries()) {
      expect(objectById(world, id).frozen).toBe(true);
      expect(objectById(world, id).transform).toEqual(drawnAt[k]);
    }
  });

  it('is undone on its own: Ctrl+Z takes out the Fill and leaves the Object', () => {
    const world = createWorld();
    const box = box60(world, 300, 300);
    world.fillAt({ x: 330, y: 330 }, 'black');

    world.undo();

    expect(objectById(world, box).fill).toBeNull();
    expect(objectById(world, box).mass).toBeCloseTo(1.44, 1);
    world.undo();
    expect(world.objects).toHaveLength(0);
  });

  it('undoes Strokes and Fills in the order they were made', () => {
    const world = createWorld();
    const first = box60(world, 300, 300);
    const second = box60(world, 500, 300);
    world.fillAt({ x: 330, y: 330 }, 'grey');

    world.undo(); // the Fill of the first box
    expect(objectById(world, first).fill).toBeNull();
    world.undo(); // the second box
    expect(world.objects.map((o) => o.id)).toEqual([first]);
    expect(second).not.toBe(first);
  });
});

describe('Mass', () => {
  it("keeps milestone 1's 60 px box at its milestone 1 mass", () => {
    const world = createWorld();
    const box = box60(world, 300, 300);

    // 3600 px² at 1 kg/m² and 50 px per metre.
    expect(objectById(world, box).mass).toBeCloseTo(1.44, 1);
  });

  /** Ways a Frozen box can be set moving while physics runs. */
  const unfreezings: [string, (world: SandboxWorld, box: number) => void][] = [
    ['Released', (world, box) => world.release(box)],
    [
      'woken by a hit',
      (world) => {
        const heavy = drawObject(world, dragBox(290, 420, 40, 40), 'black');
        world.fillAt({ x: 310, y: 440 }, 'black');
        world.release(heavy, { x: 600, y: 0 });
      },
    ],
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
    it(`keeps a Fill's mass after the Object is ${how}`, () => {
      const world = createWorld();
      const box = drawObject(world, dragBox(380, 410, 40, 60));
      world.fillAt({ x: 400, y: 440 }, 'black');
      const mass = objectById(world, box).mass;
      world.togglePause();

      unfreeze(world, box);
      runFor(world, 0.2);

      expect(objectById(world, box).frozen).toBe(false);
      expect(objectById(world, box).mass).toBeCloseTo(mass, 3);
    });
  }

  it('makes a filled Object harder to knock away', () => {
    const knock = (fill: Colour | null) => {
      const world = createWorld();
      const box = box60(world, 400, 400);
      if (fill) world.fillAt({ x: 430, y: 430 }, fill);
      const ball = drawObject(world, dragCircle({ x: 370, y: 430 }, 25), 'black');
      world.fillAt({ x: 370, y: 430 }, 'black');
      world.togglePause();
      world.release(ball, { x: 500, y: 0 });
      runFor(world, 0.15);
      return objectById(world, box).velocity.x;
    };

    const hollow = knock(null);
    const grey = knock('grey');
    const black = knock('black');
    expect(hollow).toBeGreaterThan(grey);
    expect(grey).toBeGreaterThan(black);
  });
});

describe('Mass-aware waking', () => {
  /** A Frozen black-filled 60 px box in mid-air, hit from the left at 300 px/s. */
  function hitBlackBox(drawHitter: (world: SandboxWorld) => number) {
    const world = createWorld();
    const target = box60(world, 600, 400);
    world.fillAt({ x: 630, y: 430 }, 'black');
    const hitter = drawHitter(world);
    world.togglePause();
    world.release(hitter, { x: 300, y: 0 });
    runFor(world, 0.3);
    return objectById(world, target).frozen;
  }

  it('lets an Object as heavy as a Frozen black-filled box wake it, but not a light ball at the same speed', () => {
    const sameMass = hitBlackBox((world) => {
      const id = box60(world, 530, 400);
      world.fillAt({ x: 560, y: 430 }, 'black');
      return id;
    });
    const lightBall = hitBlackBox((world) => drawObject(world, dragCircle({ x: 580, y: 430 }, 15)));

    expect(sameMass).toBe(false);
    expect(lightBall).toBe(true);
  });

  it('wakes a grey Object hit by one of equal mass from 150 px/s on, as in milestone 1', () => {
    const woken = (speed: number) => {
      const world = createWorld();
      const target = box60(world, 600, 400);
      const hitter = box60(world, 535, 400);
      world.togglePause();
      world.release(hitter, { x: speed, y: 0 });
      runFor(world, 0.3);
      return !objectById(world, target).frozen;
    };

    expect(woken(120)).toBe(false);
    expect(woken(180)).toBe(true);
  });
});
