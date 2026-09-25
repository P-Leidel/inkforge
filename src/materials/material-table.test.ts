import { describe, expect, it } from 'vitest';
import { COLOURS } from './colour';
import { createMaterialTable, DEFAULT_MATERIAL_TABLE } from './material-table';

describe('Material table', () => {
  it('never lets a bounce gain energy: every restitution is below 1', () => {
    for (const colour of COLOURS) {
      const { line, outline } = DEFAULT_MATERIAL_TABLE.colours[colour];
      for (const surface of [line, outline]) {
        expect(surface.restitution, colour).toBeGreaterThanOrEqual(0);
        expect(surface.restitution, colour).toBeLessThan(1);
      }
    }
  });

  it('makes blue the bounciest and slipperiest Colour and black the grippiest', () => {
    const { colours } = DEFAULT_MATERIAL_TABLE;
    for (const colour of COLOURS) {
      if (colour !== 'blue') {
        expect(colours.blue.line.restitution).toBeGreaterThan(colours[colour].line.restitution);
        expect(colours.blue.line.friction).toBeLessThan(colours[colour].line.friction);
      }
      if (colour !== 'black') {
        expect(colours.black.line.friction).toBeGreaterThan(colours[colour].line.friction);
      }
    }
  });

  it('ranks Line durability as the spec does: black far toughest, red weakest, blue below grey', () => {
    const line = (colour: (typeof COLOURS)[number]) =>
      DEFAULT_MATERIAL_TABLE.colours[colour].line.durability;
    expect(line('black')).toBeGreaterThan(3 * line('grey'));
    expect(line('green')).toBe(line('grey'));
    expect(line('blue')).toBeLessThan(line('grey'));
    expect(line('red')).toBeLessThan(line('blue'));
    expect(DEFAULT_MATERIAL_TABLE.pieceLength).toBe(48);
  });

  it('hands out independent copies to edit', () => {
    const table = createMaterialTable();
    table.colours.blue.line.restitution = 0.5;

    expect(DEFAULT_MATERIAL_TABLE.colours.blue.line.restitution).toBe(0.9);
    expect(createMaterialTable().colours.blue.line.restitution).toBe(0.9);
  });
});
