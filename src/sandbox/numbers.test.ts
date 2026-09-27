import { describe, expect, it } from 'vitest';
import { createEnemyTable } from '../materials/enemy-table';
import { createMaterialTable } from '../materials/material-table';
import { Numbers, type Breakable } from './numbers';

describe("What a thing's numbers are", () => {
  it("gives a Piece its Colour's Line numbers, fixed, with no impact limit", () => {
    const table = createMaterialTable();
    const { line } = table.colours.blue;

    const numbers = new Numbers(table).of({ kind: 'piece', colour: 'blue' });

    expect(numbers.surface).toBe(line);
    expect(numbers.fixed).toBe(true);
    expect(numbers.toughness).toMatchObject({
      damageThreshold: line.damageThreshold,
      durability: line.durability,
      impactLimit: 0,
    });
  });

  it("gives an Object its Colour's Outline numbers, not fixed, impact limit and all", () => {
    const table = createMaterialTable();
    const { outline } = table.colours.blue;

    const numbers = new Numbers(table).of({ kind: 'object', colour: 'blue' });

    expect(numbers.surface).toBe(outline);
    expect(numbers.fixed).toBe(false);
    expect(numbers.toughness).toMatchObject({
      damageThreshold: outline.damageThreshold,
      durability: outline.durability,
      impactLimit: outline.impactLimit,
    });
  });

  it("gives Rubble its Fill Colour's Outline surface, and Droplets and Patches their Line surface; none breaks", () => {
    const table = createMaterialTable();
    const numbers = new Numbers(table);

    const rubble = numbers.of({ kind: 'rubble', colour: 'black' });
    const droplet = numbers.of({ kind: 'droplet', colour: 'blue' });
    const patch = numbers.of({ kind: 'patch', colour: 'green' });

    expect(rubble).toEqual({ surface: table.colours.black.outline, fixed: false, toughness: null });
    expect(droplet).toEqual({ surface: table.colours.blue.line, fixed: false, toughness: null });
    expect(patch).toEqual({ surface: table.colours.green.line, fixed: false, toughness: null });
  });

  it('reads the table as it is now, so an edit counts at the next question', () => {
    const table = createMaterialTable();
    const numbers = new Numbers(table);
    const piece = { kind: 'piece', colour: 'grey' } as const;

    table.colours.grey.line.friction = 0.25;
    table.colours.grey.line.durability = 123;

    expect(numbers.surface(piece).friction).toBe(0.25);
    expect(numbers.of(piece).toughness.durability).toBe(123);
  });

  it('wears a Breakable by damage or impacts, whichever is further, and says what durability is left', () => {
    const table = createMaterialTable();
    table.colours.blue.outline.durability = 1000;
    table.colours.blue.outline.impactLimit = 3;
    const numbers = new Numbers(table);
    const object: Breakable = { kind: 'object', colour: 'blue', damage: 200, impacts: 2 };

    expect(numbers.wear(object)).toBeCloseTo(2 / 3);
    expect(numbers.durabilityLeft(object)).toBe(800);

    object.damage = 1500;
    expect(numbers.wear(object)).toBe(1);
    expect(numbers.durabilityLeft(object)).toBe(0);
  });

  it('never wears a Piece by impacts', () => {
    const table = createMaterialTable();
    table.colours.blue.line.durability = 1000;
    const piece: Breakable = { kind: 'piece', colour: 'blue', damage: 100, impacts: 50 };

    expect(new Numbers(table).wear(piece)).toBeCloseTo(0.1);
  });

  it("gives an Enemy its type's surface from the enemy table; it is not fixed, and never breaks", () => {
    const enemies = createEnemyTable();
    enemies.types.crawler.restitution = 0.3;

    const numbers = new Numbers(createMaterialTable(), enemies);

    expect(numbers.of({ kind: 'enemy', type: 'crawler' })).toMatchObject({
      surface: { friction: 0, restitution: 0.3 },
      fixed: false,
      toughness: null,
    });
    expect(numbers.enemy('crawler')).toBe(enemies.types.crawler);
  });
});
