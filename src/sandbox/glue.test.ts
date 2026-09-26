import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../geometry/vec2';
import type { Colour } from '../materials/colour';
import { createMaterialTable } from '../materials/material-table';
import type { BodyId } from '../physics';
import type { Party, Touching } from './contact-ledger';
import { Glue, type Gluer } from './glue';

describe('Glue drag', () => {
  const table = createMaterialTable();
  table.colours.green.line.glueDrag = 4;
  table.colours.green.line.glueWear = 2;
  table.colours.green.line.durability = 1000;

  interface Body {
    readonly free: boolean;
    readonly mass: number;
    readonly inertia: number;
    velocity: Vec2;
    spin: number;
  }

  /** Glue over `bodies`, where each gluer touches the bodies listed for it in `touches`. */
  function setup(bodies: Body[], touches: Map<BodyId, BodyId[]>) {
    const at = (id: BodyId) => bodies[id]!;
    const physics = {
      isFree: (id: BodyId) => at(id).free,
      getMass: (id: BodyId) => at(id).mass,
      getInertia: (id: BodyId) => at(id).inertia,
      getVelocity: (id: BodyId) => at(id).velocity,
      getAngularVelocity: (id: BodyId) => at(id).spin,
      applyImpulse: (id: BodyId, j: Vec2) => {
        const body = at(id);
        body.velocity = {
          x: body.velocity.x + j.x / body.mass,
          y: body.velocity.y + j.y / body.mass,
        };
      },
      applyAngularImpulse: (id: BodyId, j: number) => {
        at(id).spin += j / at(id).inertia;
      },
    };
    const party = (body: BodyId): Party<never> => ({ id: body, stroke: body, body, target: null });
    const contacts = {
      touching: (body: BodyId): Iterable<Touching<unknown>> =>
        (touches.get(body) ?? []).map((other) => ({ party: party(other), pairs: [] })),
    };
    return new Glue(table, physics, contacts);
  }

  const gluer = (body: number, colour: Colour = 'green'): Gluer => ({
    colour,
    role: 'line',
    body: body as BodyId,
    damage: 0,
    impacts: 0,
  });
  const body = (mass: number, velocity: Vec2, free = true): Body => ({
    free,
    mass,
    inertia: 10 * mass,
    velocity,
    spin: 2,
  });
  const id = (n: number) => n as BodyId;

  it('slows a moving body by c·dt/m of its motion, spin too, not scaled by mass', () => {
    const light = body(1, { x: 300, y: 0 });
    const heavy = body(4, { x: 300, y: 0 });
    const glue = setup([light, heavy, body(0, { x: 0, y: 0 })], new Map([[id(2), [id(0), id(1)]]]));

    glue.apply([gluer(2)], 1 / 60);

    expect(light.velocity.x).toBeCloseTo(300 * (1 - 4 / 60), 9);
    expect(light.spin).toBeCloseTo(2 * (1 - 4 / 60), 9);
    expect(heavy.velocity.x).toBeCloseTo(300 * (1 - 1 / 60), 9);
  });

  it('drags a body once however many green Pieces it touches, and shares the wear', () => {
    const ball = body(1, { x: 0, y: 300 });
    const glue = setup(
      [ball, body(0, { x: 0, y: 0 }), body(0, { x: 0, y: 0 })],
      new Map([
        [id(1), [id(0)]],
        [id(2), [id(0)]],
      ]),
    );
    const left = gluer(1);
    const right = gluer(2);

    glue.apply([left, right], 1 / 60);

    expect(ball.velocity.y).toBeCloseTo(300 * (1 - 4 / 60), 9);
    // 20 units of momentum removed, times 2, shared.
    expect(left.damage).toBeCloseTo(20, 9);
    expect(right.damage).toBeCloseTo(20, 9);
  });

  it('stops a light body rather than flinging it back', () => {
    const pebble = body(0.01, { x: 500, y: 0 });
    const glue = setup([pebble, body(0, { x: 0, y: 0 })], new Map([[id(1), [id(0)]]]));

    glue.apply([gluer(1)], 1 / 60);

    expect(pebble.velocity.x).toBe(0);
    expect(pebble.spin).toBe(0);
  });

  it('leaves alone what isn’t free, and what touches only glue-less Pieces', () => {
    const frozen = body(1, { x: 300, y: 0 }, false);
    const onGrey = body(1, { x: 300, y: 0 });
    const glue = setup(
      [frozen, onGrey, body(0, { x: 0, y: 0 }), body(0, { x: 0, y: 0 })],
      new Map([
        [id(2), [id(0)]],
        [id(3), [id(1)]],
      ]),
    );
    const green = gluer(2);

    glue.apply([green, gluer(3, 'grey')], 1 / 60);

    expect(frozen.velocity.x).toBe(300);
    expect(onGrey.velocity.x).toBe(300);
    expect(green.damage).toBe(0);
  });

  it('returns the Pieces it wore out', () => {
    const boulder = body(20, { x: 600, y: 0 });
    const glue = setup([boulder, body(0, { x: 0, y: 0 })], new Map([[id(1), [id(0)]]]));
    const piece = gluer(1);

    // 40 units of momentum a step, 80 wear: the 13th step wears out 1000.
    const worn = Array.from({ length: 13 }, () => glue.apply([piece], 1 / 60).length);

    expect(worn.slice(0, 12)).toEqual(Array(12).fill(0));
    expect(worn[12]).toBe(1);
  });
});
