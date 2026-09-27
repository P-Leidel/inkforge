import { describe, expect, it } from 'vitest';
import { COLOURS } from './colour';
import { enemyMass } from './mass';
import { createEnemyTable, DEFAULT_ENEMY_TABLE, ENEMY_TYPES } from './enemy-table';
import { DEFAULT_MATERIAL_TABLE } from './material-table';

describe('Enemy table', () => {
  it('starts the Crawler as the spec does', () => {
    expect(DEFAULT_ENEMY_TABLE.types.crawler).toMatchObject({
      width: 40,
      height: 40,
      walkingSpeed: 60,
      push: 1,
      pressing: 300,
      hp: 3000,
      damageThreshold: 300,
      coreDamage: 1,
    });
    expect(DEFAULT_ENEMY_TABLE.types.crawler.drop).toEqual({
      grey: { min: 40, max: 100 },
      blue: { min: 0, max: 40 },
      green: { min: 0, max: 40 },
      black: { min: 0, max: 15 },
      red: { min: 0, max: 10 },
    });
  });

  it('shares floor wear, the Ink Core’s HP and the Core Zone’s size', () => {
    const { floorWear, coreHp, coreZone } = DEFAULT_ENEMY_TABLE;
    expect({ floorWear, coreHp, coreZone }).toEqual({ floorWear: 1, coreHp: 10, coreZone: 480 });
  });

  it('never lets a bounce gain energy, and walks by its push, not its grip', () => {
    for (const type of ENEMY_TYPES) {
      const { restitution, friction } = DEFAULT_ENEMY_TABLE.types[type];
      expect(restitution, type).toBeGreaterThanOrEqual(0);
      expect(restitution, type).toBeLessThan(1);
      expect(friction, type).toBe(0);
    }
  });

  it('keeps every Drop range the right way round', () => {
    for (const type of ENEMY_TYPES) {
      for (const colour of COLOURS) {
        const { min, max } = DEFAULT_ENEMY_TABLE.types[type].drop[colour];
        expect(min, `${type} ${colour}`).toBeGreaterThanOrEqual(0);
        expect(max, `${type} ${colour}`).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('weighs a Crawler a little less than a 60 px hollow grey box', () => {
    const crawler = enemyMass(DEFAULT_ENEMY_TABLE.types.crawler, DEFAULT_MATERIAL_TABLE);
    expect(crawler).toBeCloseTo(1.2, 9);
  });

  it('gives an editable copy that leaves the defaults alone', () => {
    const table = createEnemyTable();
    table.types.crawler.walkingSpeed = 1;
    expect(DEFAULT_ENEMY_TABLE.types.crawler.walkingSpeed).toBe(60);
  });
});
