import { describe, expect, it } from 'vitest';
import { rotate, type Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { dragBox, dragCircle } from '../stroke/pointer-paths';
import type { SandboxWorld } from './sandbox-world';
import { drawLine, drawObject, objectById, runFor, sandboxWorlds } from './test-support';

const createWorld = sandboxWorlds();

/** A horizontal Line at `y` from `x1` to `x2`. */
const floor = (world: SandboxWorld, y: number, x1: number, x2: number, colour: Colour) =>
  drawLine(
    world,
    [
      { x: x1, y },
      { x: x2, y },
    ],
    colour,
  );

/** A 20 px ball resting on a Line at y = 700, at `x`, filled with `fill` if given. */
function ballOnFloor(world: SandboxWorld, x: number, fill?: Colour): number {
  const id = drawObject(world, dragCircle({ x, y: 675 }, 20));
  if (fill) world.fillAt({ x, y: 675 }, fill);
  return id;
}

/** Starts physics if paused, and lets the Object go with `velocity`. */
function launch(world: SandboxWorld, id: number, velocity: Vec2): void {
  if (!world.isRunning) world.togglePause();
  world.release(id, velocity);
}

const stuck = (world: SandboxWorld, id: number) => world.bonds.some((b) => b.object === id);

describe('Glue drag', () => {
  it('slows a light ball crossing green more than a heavy one, and one on grey hardly at all', () => {
    const world = createWorld();
    floor(world, 700, 100, 900, 'green');
    floor(world, 700, 1000, 1800, 'grey');
    const light = ballOnFloor(world, 200);
    const heavy = ballOnFloor(world, 500, 'black');
    const onGrey = ballOnFloor(world, 1100);
    for (const ball of [light, heavy, onGrey]) launch(world, ball, { x: 400, y: 0 });

    runFor(world, 0.5);

    const speed = (id: number) => objectById(world, id).velocity.x;
    expect(speed(light)).toBeLessThan(0.5 * speed(heavy));
    expect(speed(heavy)).toBeLessThan(0.8 * speed(onGrey));
    expect(speed(onGrey)).toBeGreaterThan(200);
  });

  it('wears a green Line down from use, until its Pieces break', () => {
    const world = createWorld();
    world.materials.colours.green.line.durability = 250;
    const green = floor(world, 700, 100, 900, 'green');
    const grey = floor(world, 700, 1000, 1800, 'grey');
    const count = world.lines.map((line) => line.pieces.length);
    const onGreen = ballOnFloor(world, 200, 'black');
    ballOnFloor(world, 1100, 'black');
    for (const ball of world.objects) launch(world, ball.id, { x: 400, y: 0 });

    runFor(world, 0.2);
    const pieces = (id: number) => world.lines.find((l) => l.id === id)?.pieces ?? [];
    // Rolling starts no impact: the grey Line under the other ball is untouched.
    expect(pieces(grey).every((p) => p.wear === 0)).toBe(true);
    expect(pieces(green).some((p) => p.wear > 0.25)).toBe(true);

    runFor(world, 1);
    expect(pieces(green).length).toBeLessThan(count[0]!);
    expect(pieces(grey)).toHaveLength(count[1]!);
    expect(world.debrisParticles.length).toBeGreaterThan(0);
    expect(objectById(world, onGreen).velocity.x).toBeLessThan(100);
  });

  it('leaves a green Line that things rest on unworn', () => {
    const world = createWorld();
    const green = floor(world, 700, 100, 900, 'green');
    for (const x of [200, 400]) ballOnFloor(world, x, 'black');
    drawObject(world, dragBox(570, 636, 60, 60));
    for (const object of world.objects) launch(world, object.id, { x: 0, y: 0 });

    runFor(world, 3); // the balls rock onto a flat of their outline and settle
    const worn = () => world.lines[0]!.pieces.map((p) => p.durability);
    const before = worn();
    runFor(world, 20);

    expect(world.lines[0]!.id).toBe(green);
    expect(worn()).toEqual(before);
  });
});

describe('Sticking', () => {
  /**
   * A 40 px green box Frozen under a grey Line at y = 400, thrown up at it
   * gently: it sticks to the Line's underside and hangs there.
   */
  function hangUnderLine(world: SandboxWorld): number {
    const box = drawObject(world, dragBox(530, 460, 40, 40), 'green');
    floor(world, 400, 400, 700, 'grey'); // drawn last, so undo takes it
    launch(world, box, { x: 0, y: -400 });
    runFor(world, 1);
    return box;
  }

  it('sticks a green Object to its first new contact, fixed on a Line, and lets it fall free when that Piece breaks', () => {
    const world = createWorld();
    const box = hangUnderLine(world);

    expect(stuck(world, box)).toBe(true);
    const hanging = objectById(world, box).transform;
    runFor(world, 2);
    expect(objectById(world, box).transform.y).toBeCloseTo(hanging.y, 0);
    expect(objectById(world, box).transform.x).toBeCloseTo(hanging.x, 0);

    // A boulder drops on the Piece above it and smashes it.
    const boulder = drawObject(world, dragBox(520, 100, 60, 60), 'black');
    world.fillAt({ x: 550, y: 130 }, 'black');
    world.release(boulder);
    runFor(world, 1.5);

    expect(stuck(world, box)).toBe(false);
    expect(objectById(world, box).transform.y).toBeGreaterThan(hanging.y + 100);
  });

  it('doesn’t stick to what it rested on as it started moving', () => {
    const world = createWorld();
    floor(world, 700, 300, 700, 'grey');
    const box = drawObject(world, dragBox(480, 655, 40, 40), 'green');
    launch(world, box, { x: 0, y: 0 });

    runFor(world, 2);

    expect(objectById(world, box).frozen).toBe(false);
    expect(world.bonds).toEqual([]);
  });

  it('doesn’t stick to the next Pieces of a Line it rolls along, but to what it lands on', () => {
    const world = createWorld();
    floor(world, 700, 300, 700, 'grey');
    const ball = drawObject(world, dragCircle({ x: 450, y: 680 }, 15), 'green');
    launch(world, ball, { x: 600, y: 0 });

    runFor(world, 3);

    // It rolled across five Pieces and off the end, onto the ground.
    expect(world.bonds).toHaveLength(1);
    expect(world.bonds[0]!.point.x).toBeGreaterThan(700);
    expect(world.bonds[0]!.point.y).toBeGreaterThan(870);
  });

  it('keeps its bond when its Frozen host wakes, and the two move as one', () => {
    const world = createWorld();
    const host = drawObject(world, dragBox(520, 340, 60, 60), 'grey');
    const box = drawObject(world, dragBox(530, 420, 40, 40), 'green');
    // Gently up into the Frozen box, too gently to wake it.
    launch(world, box, { x: 0, y: -200 });
    runFor(world, 1);
    expect(stuck(world, box)).toBe(true);
    expect(objectById(world, host).frozen).toBe(true);
    /** Where the green box is, and how it is turned, relative to the host. */
    const offset = (id: number) => {
      const a = objectById(world, host).transform;
      const b = objectById(world, id).transform;
      const along = rotate({ x: b.x - a.x, y: b.y - a.y }, -a.angle);
      return { ...along, angle: b.angle - a.angle };
    };
    const before = offset(box);

    // A ball knocks the host awake.
    const ball = drawObject(world, dragCircle({ x: 440, y: 370 }, 20));
    world.release(ball, { x: 700, y: 0 });
    runFor(world, 0.6);

    expect(objectById(world, host).frozen).toBe(false);
    expect(objectById(world, host).transform.y).toBeGreaterThan(400); // falling
    expect(stuck(world, box)).toBe(true);
    expect(offset(box).x).toBeCloseTo(before.x, 0);
    expect(offset(box).y).toBeCloseTo(before.y, 0);
    expect(offset(box).angle).toBeCloseTo(before.angle, 2);
  });

  it('sticks to a Frozen Object it hits hard enough to wake, and the two fly on as one', () => {
    const world = createWorld();
    const host = drawObject(world, dragBox(520, 340, 60, 60), 'grey');
    const box = drawObject(world, dragBox(400, 350, 40, 40), 'green');
    launch(world, box, { x: 600, y: -50 });
    runFor(world, 0.3);

    expect(objectById(world, host).frozen).toBe(false);
    expect(stuck(world, box)).toBe(true);
    const gap = () => {
      const a = objectById(world, host).transform;
      const b = objectById(world, box).transform;
      return Math.hypot(b.x - a.x, b.y - a.y);
    };
    const before = gap();
    runFor(world, 0.5);
    expect(objectById(world, host).transform.x).toBeGreaterThan(560);
    expect(gap()).toBeCloseTo(before, 0);
  });

  it('doesn’t stick when paused and restarted while it rests against something', () => {
    const world = createWorld();
    floor(world, 700, 300, 700, 'grey');
    const box = drawObject(world, dragBox(480, 655, 40, 40), 'green');
    launch(world, box, { x: 0, y: 0 });
    runFor(world, 1);

    world.togglePause();
    world.togglePause();
    runFor(world, 1);
    world.reset();
    runFor(world, 1);

    expect(world.bonds).toEqual([]);
  });

  it('doesn’t stick to the Line it is squeezed off, but to what it lands on', () => {
    const world = createWorld();
    const box = drawObject(world, dragBox(480, 500, 40, 40), 'green');
    world.togglePause();
    // Across the box near its top: the shortest way off is down.
    floor(world, 506, 400, 600, 'grey');

    runFor(world, 3);

    expect(world.bonds).toHaveLength(1);
    expect(world.bonds[0]!.object).toBe(box);
    expect(world.bonds[0]!.point.y).toBeGreaterThan(870); // on the ground
  });

  it('falls free for good when its host is undone', () => {
    const world = createWorld();
    const box = hangUnderLine(world);
    expect(stuck(world, box)).toBe(true);

    world.undo(); // the Line
    runFor(world, 2);

    expect(world.bonds).toEqual([]);
    expect(objectById(world, box).transform.y).toBeGreaterThan(800); // it fell to the ground
  });

  it('sticks to a moving Object, and the two move as one', () => {
    const world = createWorld();
    const ball = ballOnFloor(world, 300);
    floor(world, 700, 200, 1200, 'grey');
    const box = drawObject(world, dragBox(380, 500, 40, 40), 'green');
    launch(world, ball, { x: 200, y: 0 });
    world.release(box, { x: 0, y: 0 });
    runFor(world, 1);

    expect(stuck(world, box)).toBe(true);
    const gap = () => objectById(world, box).transform.x - objectById(world, ball).transform.x;
    const before = gap();
    runFor(world, 1);
    expect(gap()).toBeCloseTo(before, 0);
  });

  it('comes back stuck with R, and fell free again the same way', () => {
    const world = createWorld();
    const box = hangUnderLine(world);
    world.togglePause();
    world.togglePause(); // the snapshot has it stuck
    const hanging = objectById(world, box).transform;
    world.undo(); // the Line
    runFor(world, 2);
    expect(world.bonds).toEqual([]);

    world.reset();

    expect(stuck(world, box)).toBe(true);
    runFor(world, 1);
    expect(objectById(world, box).transform.y).toBeCloseTo(hanging.y, 0);
  });

  it('never sticks again once it has fallen free, also after R', () => {
    const world = createWorld();
    const box = hangUnderLine(world);
    world.undo(); // the Line: it falls to the ground
    world.togglePause();
    world.togglePause(); // the snapshot has it falling, spent
    runFor(world, 2);
    expect(world.bonds).toEqual([]);

    world.reset();
    runFor(world, 2);

    expect(world.bonds).toEqual([]);
    expect(objectById(world, box).transform.y).toBeGreaterThan(800);
  });
});
