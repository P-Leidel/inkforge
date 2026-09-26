import { describe, expect, it } from 'vitest';
import type { Colour } from '../materials/colour';
import { createMaterialTable } from '../materials/material-table';
import type { BodyId, ShapeId } from '../physics';
import { TERRAIN_PARTY, type Party, type PartyHit } from './contact-ledger';
import { impactDamage, MaterialRules, wear, type Breakable } from './material-rules';

describe('The damage rule', () => {
  it('deals the impulse above the threshold, times k', () => {
    expect(impactDamage(1000, 400, 1)).toBe(600);
    expect(impactDamage(1000, 400, 0.5)).toBe(300);
  });

  it('deals nothing at or below the threshold', () => {
    expect(impactDamage(400, 400, 1)).toBe(0);
    expect(impactDamage(100, 400, 1)).toBe(0);
  });
});

describe('Material rules', () => {
  const table = createMaterialTable();
  table.colours.grey.outline.damageThreshold = 400;
  table.colours.black.outline.damageThreshold = 2000;
  table.colours.blue.outline.damageThreshold = 200;
  table.colours.blue.outline.impactLimit = 3;
  table.damagePerImpulse = 1;

  const breakable = (colour: Colour): Breakable => ({
    colour,
    role: 'outline',
    damage: 0,
    impacts: 0,
  });
  /** A Party with the given id, of its own Stroke unless one is given. */
  const party = (id: number, target: Breakable | null, stroke: number = id): Party<Breakable> => ({
    id,
    stroke,
    body: (id + 100) as BodyId,
    target,
  });
  const TERRAIN = party(TERRAIN_PARTY, null);

  /** Hits between the parties by their place in `parties`, as the Contact ledger gives them. */
  function setup(parties: Party<Breakable>[]) {
    const hit = (a: number, b: number, impulse: number): PartyHit<Breakable> => ({
      a: parties[a]!,
      b: parties[b]!,
      hit: {
        bodyA: parties[a]!.body,
        bodyB: parties[b]!.body,
        shapeA: (a * 10) as ShapeId,
        shapeB: (b * 10) as ShapeId,
        point: { x: 0, y: 0 },
        normal: { x: 0, y: 1 },
        speed: 500,
        impulse,
      },
    });
    return { hit };
  }

  it('checks both sides against their own threshold', () => {
    const grey = breakable('grey');
    const black = breakable('black');
    const rules = new MaterialRules(table);
    const { hit } = setup([party(1, grey), party(2, black)]);

    rules.applyStep([hit(0, 1, 1000)]);

    expect(grey.damage).toBe(600);
    expect(black.damage).toBe(0);
  });

  it('never damages Terrain, and Terrain damages what hits it', () => {
    const grey = breakable('grey');
    const rules = new MaterialRules(table);
    const { hit } = setup([TERRAIN, party(1, grey)]);

    rules.applyStep([hit(0, 1, 900)]);

    expect(grey.damage).toBe(500);
  });

  it('counts two shapes of the same two bodies hitting in one step as one impact', () => {
    const blue = breakable('blue');
    const rules = new MaterialRules(table);
    const { hit } = setup([TERRAIN, party(1, blue)]);

    rules.applyStep([hit(0, 1, 500), hit(0, 1, 300)]);

    expect(blue.impacts).toBe(1);
    expect(blue.damage).toBe(300);
  });

  it('breaks a blue Breakable on its third impact above the threshold', () => {
    const blue = breakable('blue');
    const rules = new MaterialRules(table);
    const { hit } = setup([TERRAIN, party(1, blue)]);

    const broken = [250, 150, 250, 250].map(
      (impulse) => rules.applyStep([hit(0, 1, impulse)]).length,
    );

    expect(broken).toEqual([0, 0, 0, 1]);
    expect(blue.impacts).toBe(3);
    expect(wear(blue, table)).toBe(1);
  });

  it('breaks a Breakable when its damage reaches its durability', () => {
    const grey = breakable('grey');
    const rules = new MaterialRules(table);
    const { hit } = setup([TERRAIN, party(1, grey)]);
    const durability = table.colours.grey.outline.durability;

    const first = rules.applyStep([hit(0, 1, 400 + durability - 1)]);
    const second = rules.applyStep([hit(0, 1, 401)]);

    expect(first).toEqual([]);
    expect(second).toEqual([grey]);
  });

  it("damages a Piece against its Line's numbers, not its Outline's", () => {
    const lines = createMaterialTable();
    lines.colours.grey.line.damageThreshold = 100;
    lines.colours.grey.line.durability = 500;
    const piece: Breakable = { colour: 'grey', role: 'line', damage: 0, impacts: 0 };
    const rules = new MaterialRules(lines);
    const { hit } = setup([party(2, piece, 1), TERRAIN]);

    expect(rules.applyStep([hit(0, 1, 350)])).toEqual([]);
    expect(piece.damage).toBe(250);
    expect(wear(piece, lines)).toBe(0.5);

    expect(rules.applyStep([hit(0, 1, 350)])).toEqual([piece]);
  });

  it('never breaks a blue Piece by counting impacts: only damage wears it', () => {
    const piece: Breakable = { colour: 'blue', role: 'line', damage: 0, impacts: 0 };
    const rules = new MaterialRules(table);
    const { hit } = setup([party(2, piece, 1), TERRAIN]);
    const threshold = table.colours.blue.line.damageThreshold;

    for (let k = 0; k < 4; k++) rules.applyStep([hit(0, 1, threshold + 10)]);

    expect(piece.damage).toBe(40);
    expect(wear(piece, table)).toBeLessThan(1);
  });

  it("counts one Line's Pieces hit in one step as one impact on what hit them", () => {
    const grey = breakable('grey');
    const left: Breakable = { colour: 'grey', role: 'line', damage: 0, impacts: 0 };
    const right: Breakable = { colour: 'grey', role: 'line', damage: 0, impacts: 0 };
    const rules = new MaterialRules(table);
    // Line 2 has no body; Pieces 3 and 4 are its Pieces.
    const { hit } = setup([party(1, grey), party(3, left, 2), party(4, right, 2)]);

    rules.applyStep([hit(0, 1, 1000), hit(0, 2, 900)]);

    expect(grey.damage).toBe(600);
    expect(grey.impacts).toBe(1);
    expect(left.damage).toBe(600);
    expect(right.damage).toBe(500);
  });
});
