import { describe, expect, it } from 'vitest';
import { Game } from '../game/game';
import { DEFAULT_INK_TABLE } from '../game/ink-table';
import { createMaterialTable, DEFAULT_MATERIAL_TABLE } from '../materials/material-table';
import { numberPaths } from '../materials/table-paths';
import { tablesAsJson } from './tuning-copy';

describe("The tuning panel's Copy as JSON", () => {
  it('holds the Ink table, in the shape of its defaults, so pasting it back gives the same table', () => {
    const game = new Game({ inkCosts: true, worldOptions: { seed: 1 } });
    game.editInk((ink) => {
      ink.linePrice = 1.5;
      ink.tanks.red = 800;
    });

    const pasted = JSON.parse(tablesAsJson({ materials: createMaterialTable(), ink: game.ink }));

    expect(numberPaths(pasted.ink)).toEqual(numberPaths(DEFAULT_INK_TABLE));
    expect(pasted.ink).toEqual(game.ink);
    expect(pasted.ink).toEqual({
      ...DEFAULT_INK_TABLE,
      linePrice: 1.5,
      tanks: { ...DEFAULT_INK_TABLE.tanks, red: 800 },
    });
    game.dispose();
  });

  it('holds the material table as before, next to it', () => {
    const materials = createMaterialTable();
    materials.colours.blue.line.restitution = 0.5;

    const pasted = JSON.parse(tablesAsJson({ materials, ink: DEFAULT_INK_TABLE }));

    expect(numberPaths(pasted.materials)).toEqual(numberPaths(DEFAULT_MATERIAL_TABLE));
    expect(pasted.materials).toEqual(materials);
  });
});
