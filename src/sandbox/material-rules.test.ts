import { describe, expect, it } from 'vitest';
import type { Colour } from '../materials/colour';
import { createMaterialTable } from '../materials/material-table';
import type { BodyId, ContactHit, ShapeId, StepReport } from '../physics';
import { impactDamage, MaterialRules, wear, type Breakable, type Party } from './material-rules';

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
  const TERRAIN: Party = { key: 'terrain', target: null, sliding: false };

  /** A world of parties by body id, and a report of hits between them. */
  function setup(parties: Party[]) {
    const partyOf = (body: BodyId) => parties[body] ?? null;
    const hit = (a: number, b: number, impulse: number): ContactHit => ({
      bodyA: a as BodyId,
      bodyB: b as BodyId,
      shapeA: (a * 10) as ShapeId,
      shapeB: (b * 10) as ShapeId,
      point: { x: 0, y: 0 },
      normal: { x: 0, y: 1 },
      speed: 500,
      impulse,
    });
    const report = (...hits: ContactHit[]): StepReport => ({ hits, begins: [], ends: [] });
    return { partyOf, hit, report };
  }

  it('checks both sides against their own threshold', () => {
    const grey = breakable('grey');
    const black = breakable('black');
    const rules = new MaterialRules(table);
    const { partyOf, hit, report } = setup([
      { key: 'a', target: grey, sliding: false },
      { key: 'b', target: black, sliding: false },
    ]);

    rules.applyStep(report(hit(0, 1, 1000)), () => [], partyOf);

    expect(grey.damage).toBe(600);
    expect(black.damage).toBe(0);
  });

  it('never damages Terrain, and Terrain damages what hits it', () => {
    const grey = breakable('grey');
    const rules = new MaterialRules(table);
    const { partyOf, hit, report } = setup([TERRAIN, { key: 'a', target: grey, sliding: false }]);

    rules.applyStep(report(hit(0, 1, 900)), () => [], partyOf);

    expect(grey.damage).toBe(500);
  });

  it('counts two shapes of the same two bodies hitting in one step as one impact', () => {
    const blue = breakable('blue');
    const rules = new MaterialRules(table);
    const { partyOf, hit, report } = setup([TERRAIN, { key: 'a', target: blue, sliding: false }]);

    rules.applyStep(report(hit(0, 1, 500), hit(0, 1, 300)), () => [], partyOf);

    expect(blue.impacts).toBe(1);
    expect(blue.damage).toBe(300);
  });

  it('breaks a blue Breakable on its third impact above the threshold', () => {
    const blue = breakable('blue');
    const rules = new MaterialRules(table);
    const { partyOf, hit, report } = setup([TERRAIN, { key: 'a', target: blue, sliding: false }]);

    const broken = [250, 150, 250, 250].map(
      (impulse) => rules.applyStep(report(hit(0, 1, impulse)), () => [], partyOf).length,
    );

    expect(broken).toEqual([0, 0, 0, 1]);
    expect(blue.impacts).toBe(3);
    expect(wear(blue, table)).toBe(1);
  });

  it('breaks a Breakable when its damage reaches its durability', () => {
    const grey = breakable('grey');
    const rules = new MaterialRules(table);
    const { partyOf, hit, report } = setup([TERRAIN, { key: 'a', target: grey, sliding: false }]);
    const durability = table.colours.grey.outline.durability;

    const first = rules.applyStep(report(hit(0, 1, 400 + durability - 1)), () => [], partyOf);
    const second = rules.applyStep(report(hit(0, 1, 401)), () => [], partyOf);

    expect(first).toEqual([]);
    expect(second).toEqual([grey]);
  });

  it('ignores hits where either side is sliding', () => {
    const grey = breakable('grey');
    const other = breakable('grey');
    const rules = new MaterialRules(table);
    const { partyOf, hit, report } = setup([
      { key: 'a', target: grey, sliding: true },
      { key: 'b', target: other, sliding: false },
    ]);

    rules.applyStep(report(hit(0, 1, 5000)), () => [], partyOf);

    expect(grey.damage).toBe(0);
    expect(other.damage).toBe(0);
  });

  it('ignores pairs settled at the start until they stop touching', () => {
    const grey = breakable('grey');
    const rules = new MaterialRules(table);
    const { partyOf, hit, report } = setup([TERRAIN, { key: 'a', target: grey, sliding: false }]);
    const touching = [hit(0, 1, 0)];
    rules.settle(rules.pairKeys(touching, partyOf));

    rules.applyStep(report(hit(0, 1, 1000)), () => touching, partyOf);
    expect(grey.damage).toBe(0);

    rules.applyStep(report(), () => [], partyOf); // they separated
    rules.applyStep(report(hit(0, 1, 1000)), () => touching, partyOf);
    expect(grey.damage).toBe(600);
  });

  it("damages a Piece against its Line's numbers, not its Outline's", () => {
    const lines = createMaterialTable();
    lines.colours.grey.line.damageThreshold = 100;
    lines.colours.grey.line.durability = 500;
    const piece: Breakable = { colour: 'grey', role: 'line', damage: 0, impacts: 0 };
    const rules = new MaterialRules(lines);
    const { partyOf, hit, report } = setup([{ key: 'a', target: piece, sliding: false }, TERRAIN]);

    expect(rules.applyStep(report(hit(0, 1, 350)), () => [], partyOf)).toEqual([]);
    expect(piece.damage).toBe(250);
    expect(wear(piece, lines)).toBe(0.5);

    expect(rules.applyStep(report(hit(0, 1, 350)), () => [], partyOf)).toEqual([piece]);
  });

  it('never breaks a blue Piece by counting impacts: only damage wears it', () => {
    const piece: Breakable = { colour: 'blue', role: 'line', damage: 0, impacts: 0 };
    const rules = new MaterialRules(table);
    const { partyOf, hit, report } = setup([{ key: 'a', target: piece, sliding: false }, TERRAIN]);
    const threshold = table.colours.blue.line.damageThreshold;

    for (let k = 0; k < 4; k++)
      rules.applyStep(report(hit(0, 1, threshold + 10)), () => [], partyOf);

    expect(piece.damage).toBe(40);
    expect(wear(piece, table)).toBeLessThan(1);
  });

  it("counts one Line's Pieces hit in one step as one impact on what hit them", () => {
    const grey = breakable('grey');
    const left: Breakable = { colour: 'grey', role: 'line', damage: 0, impacts: 0 };
    const right: Breakable = { colour: 'grey', role: 'line', damage: 0, impacts: 0 };
    const rules = new MaterialRules(table);
    const { partyOf, hit, report } = setup([
      { key: 'a', target: grey, sliding: false },
      { key: 'line piece 0', stroke: 'line', target: left, sliding: false },
      { key: 'line piece 1', stroke: 'line', target: right, sliding: false },
    ]);

    rules.applyStep(report(hit(0, 1, 1000), hit(0, 2, 900)), () => [], partyOf);

    expect(grey.damage).toBe(600);
    expect(grey.impacts).toBe(1);
    expect(left.damage).toBe(600);
    expect(right.damage).toBe(500);
  });
});
