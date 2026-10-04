import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../game/defence-loop';
import { Game } from '../game/game';
import { DEFAULT_INK_TABLE } from '../game/ink-table';
import { DEFAULT_WAVE_TABLE } from '../game/wave-table';
import { createEnemyTable, DEFAULT_ENEMY_TABLE } from '../materials/enemy-table';
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

    const pasted = JSON.parse(
      tablesAsJson({
        materials: createMaterialTable(),
        ink: game.ink,
        wave: DEFAULT_WAVE_TABLE,
        enemies: createEnemyTable(),
        rules: DEFAULT_RULES,
      }),
    );

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

    const pasted = JSON.parse(
      tablesAsJson({
        materials,
        ink: DEFAULT_INK_TABLE,
        wave: DEFAULT_WAVE_TABLE,
        enemies: createEnemyTable(),
        rules: DEFAULT_RULES,
      }),
    );

    expect(numberPaths(pasted.materials)).toEqual(numberPaths(DEFAULT_MATERIAL_TABLE));
    expect(pasted.materials).toEqual(materials);
  });

  it('holds the enemy table under `enemies`, in the shape of its defaults', () => {
    const enemies = createEnemyTable();
    enemies.types.crawler.walkingSpeed = 75;
    enemies.types.crawler.drop.red.max = 20;

    const pasted = JSON.parse(
      tablesAsJson({
        materials: createMaterialTable(),
        ink: DEFAULT_INK_TABLE,
        wave: DEFAULT_WAVE_TABLE,
        enemies,
        rules: DEFAULT_RULES,
      }),
    );

    expect(numberPaths(pasted.enemies)).toEqual(numberPaths(DEFAULT_ENEMY_TABLE));
    expect(pasted.enemies).toEqual(enemies);
  });

  it('holds the Wave table under `wave`, in the shape of its defaults', () => {
    const game = new Game({ inkCosts: false, worldOptions: { seed: 1 } });
    game.defence.edit((wave) => {
      wave.sends[1]!.count = 8;
      wave.gap = 1.5;
    });

    const pasted = JSON.parse(
      tablesAsJson({
        materials: createMaterialTable(),
        ink: DEFAULT_INK_TABLE,
        wave: game.defence.table,
        enemies: createEnemyTable(),
        rules: DEFAULT_RULES,
      }),
    );

    expect(numberPaths(pasted.wave)).toEqual(numberPaths(DEFAULT_WAVE_TABLE));
    expect(pasted.wave).toEqual({
      sends: [
        { type: 'crawler', count: 6 },
        { type: 'runner', count: 8 },
        { type: 'heavy', count: 2 },
      ],
      gap: 1.5,
    });
    game.dispose();
  });

  it('holds the rules switches under `rules`, as the Game has them', () => {
    const game = new Game({ inkCosts: false, worldOptions: { seed: 1 } });
    game.rules.undoDuringWave = false;

    const pasted = JSON.parse(
      tablesAsJson({
        materials: createMaterialTable(),
        ink: DEFAULT_INK_TABLE,
        wave: DEFAULT_WAVE_TABLE,
        enemies: createEnemyTable(),
        rules: game.rules,
      }),
    );

    expect(pasted.rules).toEqual({
      buildBetweenWaves: true,
      undoDuringWave: false,
      buildWhilePaused: true,
    });
    game.dispose();
  });
});
