import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { createMaterialTable } from '../materials/material-table';
import type { BodyId, ShapeId } from '../physics';
import type { Party } from './contact-ledger';
import type { Gluer } from './glue';
import type { Breakable } from './material-rules';
import { fakePatch, fakeRules, type FakeBody } from './rules-test-support';

describe('Glue drag', () => {
  const table = createMaterialTable();
  table.colours.green.line.glueDrag = 4;
  table.colours.green.line.glueWear = 2;
  table.colours.green.line.durability = 1000;

  type Piece = Gluer & Breakable;

  /**
   * The Material rules over `bodies` (body k is the k-th), where each gluer
   * touches the bodies listed for it in `touches`, through a shape numbered
   * like its body, or through the shape `through` gives for the pair.
   * Shapes above 100 are Patches': `patches` lists them.
   */
  function setup(
    bodies: Partial<FakeBody>[],
    touches: Map<number, number[]>,
    through: (gluer: number, other: number) => number = (gluer) => gluer,
    patches: ReturnType<typeof fakePatch>[] = [],
  ) {
    const fake = fakeRules<Piece>(table);
    bodies.forEach((body, k) => fake.physics.add(k, body));
    const party = (body: number): Party<never> => ({
      id: body,
      stroke: body,
      body: body as BodyId,
      target: null,
    });
    for (const [gluer, others] of touches) {
      fake.contacts.touches.set(
        gluer as BodyId,
        others.map((other) => ({
          party: party(other),
          pairs: [
            {
              bodyA: gluer as BodyId,
              bodyB: other as BodyId,
              shapeA: through(gluer, other) as ShapeId,
              shapeB: other as ShapeId,
            },
          ],
        })),
      );
    }
    for (const patch of patches) fake.arena.patches.set(patch.shape, patch);
    return fake;
  }

  const gluer = (body: number, colour: Colour = 'green'): Piece => ({
    colour,
    role: 'line',
    body: body as BodyId,
    damage: 0,
    impacts: 0,
  });
  const body = (mass: number, velocity: Vec2, free = true): Partial<FakeBody> => ({
    free,
    mass,
    inertia: 10 * mass,
    velocity,
    spin: 2,
  });
  const fixed = (): Partial<FakeBody> => body(0, { x: 0, y: 0 }, false);

  it('slows a moving body by c·dt/m of its motion, spin too, not scaled by mass', () => {
    const { rules, physics } = setup(
      [body(1, { x: 300, y: 0 }), body(4, { x: 300, y: 0 }), fixed()],
      new Map([[2, [0, 1]]]),
    );

    rules.glue([gluer(2)], 1 / 60);

    const [light, heavy] = [physics.body(0 as BodyId), physics.body(1 as BodyId)];
    expect(light.velocity.x).toBeCloseTo(300 * (1 - 4 / 60), 9);
    expect(light.spin).toBeCloseTo(2 * (1 - 4 / 60), 9);
    expect(heavy.velocity.x).toBeCloseTo(300 * (1 - 1 / 60), 9);
  });

  it('drags a body once however many green Pieces it touches, and shares the wear', () => {
    const { rules, physics } = setup(
      [body(1, { x: 0, y: 300 }), fixed(), fixed()],
      new Map([
        [1, [0]],
        [2, [0]],
      ]),
    );
    const left = gluer(1);
    const right = gluer(2);

    rules.glue([left, right], 1 / 60);

    expect(physics.body(0 as BodyId).velocity.y).toBeCloseTo(300 * (1 - 4 / 60), 9);
    // 20 units of momentum removed, times 2, shared.
    expect(left.damage).toBeCloseTo(20, 9);
    expect(right.damage).toBeCloseTo(20, 9);
    // Wear by use is not an impact.
    expect(left.impacts).toBe(0);
  });

  it('stops a light body rather than flinging it back', () => {
    const { rules, physics } = setup([body(0.01, { x: 500, y: 0 }), fixed()], new Map([[1, [0]]]));

    rules.glue([gluer(1)], 1 / 60);

    expect(physics.body(0 as BodyId).velocity.x).toBe(0);
    expect(physics.body(0 as BodyId).spin).toBe(0);
  });

  it('leaves alone what isn’t free, and what touches only glue-less Pieces', () => {
    const { rules, physics } = setup(
      [body(1, { x: 300, y: 0 }, false), body(1, { x: 300, y: 0 }), fixed(), fixed()],
      new Map([
        [2, [0]],
        [3, [1]],
      ]),
    );
    const green = gluer(2);

    rules.glue([green, gluer(3, 'grey')], 1 / 60);

    expect(physics.body(0 as BodyId).velocity.x).toBe(300);
    expect(physics.body(1 as BodyId).velocity.x).toBe(300);
    expect(green.damage).toBe(0);
  });

  it('drags through a Patch’s own shape, and uses it up, but not through a Patch on a green Piece', () => {
    // The first body touches a green Patch (shape 102) on body 2; the
    // second touches only a blue Patch (shape 103) lying on green Piece 3.
    const patch = fakePatch('green', 2, 102);
    const { rules, physics, arena } = setup(
      [body(1, { x: 300, y: 0 }), body(1, { x: 300, y: 0 }), fixed(), fixed()],
      new Map([
        [2, [0]],
        [3, [1]],
      ]),
      (gluer) => 100 + gluer,
      [patch, fakePatch('blue', 3, 103)],
    );
    const piece = gluer(3);

    rules.glue([piece, patch], 1 / 60);

    expect(physics.body(0 as BodyId).velocity.x).toBeCloseTo(300 * (1 - 4 / 60), 9);
    expect(physics.body(1 as BodyId).velocity.x).toBe(300);
    // 20 units of momentum removed, times 2: all of it used up from the Patch.
    expect(patch.used).toBeCloseTo(40, 9);
    expect(piece.damage).toBe(0);
    expect(arena.handed('use')).toEqual([{ patch, amount: patch.used }]);
    expect(arena.handed('break')).toEqual([]);
  });

  it('breaks a Piece once it has worn it out', () => {
    const { rules, arena } = setup([body(20, { x: 600, y: 0 }), fixed()], new Map([[1, [0]]]));
    const piece = gluer(1);

    // 40 units of momentum a step, 80 wear: the 13th step wears out 1000.
    const broken = Array.from({ length: 13 }, () => {
      rules.glue([piece], 1 / 60);
      return arena.handed('break').length;
    });

    expect(broken.slice(0, 12)).toEqual(Array(12).fill(0));
    expect(broken[12]).toBe(1);
    expect(arena.handed('break')).toEqual([piece]);
  });
});
