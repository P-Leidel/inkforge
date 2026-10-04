import { describe, expect, it } from 'vitest';
import { COLOURS } from './colour';
import { enemyMass } from './mass';
import { createEnemyTable, DEFAULT_ENEMY_TABLE } from './enemy-table';
import { ENEMY_TYPES } from './enemy-types';
import { DEFAULT_MATERIAL_TABLE } from './material-table';

describe('Enemy table', () => {
  it('starts the Crawler as the spec does', () => {
    expect(DEFAULT_ENEMY_TABLE.types.crawler).toMatchObject({
      width: 40,
      height: 40,
      walkingSpeed: 60,
      walkForce: 1,
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

  it('starts the Runner and the Heavy as the spec does', () => {
    expect(DEFAULT_ENEMY_TABLE.types.runner).toMatchObject({
      width: 32,
      height: 44,
      walkingSpeed: 180,
      walkForce: 0.6,
      pressing: 150,
      hp: 1500,
      damageThreshold: 200,
      coreDamage: 1,
    });
    expect(DEFAULT_ENEMY_TABLE.types.heavy).toMatchObject({
      width: 64,
      height: 64,
      walkingSpeed: 40,
      walkForce: 3,
      pressing: 1500,
      hp: 12000,
      damageThreshold: 1500,
      coreDamage: 3,
    });
  });

  it('weighs a Heavy about four Crawlers and a Runner about half of one', () => {
    const weigh = (type: (typeof ENEMY_TYPES)[number]) => {
      const numbers = DEFAULT_ENEMY_TABLE.types[type];
      return enemyMass(numbers, numbers.width * numbers.height, DEFAULT_MATERIAL_TABLE);
    };
    expect(weigh('heavy') / weigh('crawler')).toBeCloseTo(4, 1);
    expect(weigh('runner') / weigh('crawler')).toBeCloseTo(0.5, 1);
  });

  it('shares floor wear, the climbing step, stack wear and the Ink Core’s HP', () => {
    const { floorWear, climbStep, stackWear, coreHp } = DEFAULT_ENEMY_TABLE;
    expect({ floorWear, climbStep, stackWear, coreHp }).toEqual({
      floorWear: 1,
      climbStep: 1.2,
      stackWear: 0.5,
      coreHp: 10,
    });
  });

  it('lets Crawlers and Runners climb, by more than their weight, and never Heavies', () => {
    const { crawler, runner, heavy } = DEFAULT_ENEMY_TABLE.types;
    expect(crawler.climb).toBeGreaterThan(1);
    expect(runner.climb).toBeGreaterThan(1);
    expect(heavy.climb).toBe(0);
  });

  it('never lets a bounce gain energy, and walks by its walkForce, not its grip', () => {
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
    const numbers = DEFAULT_ENEMY_TABLE.types.crawler;
    const crawler = enemyMass(numbers, numbers.width * numbers.height, DEFAULT_MATERIAL_TABLE);
    expect(crawler).toBeCloseTo(1.2, 9);
  });

  it('gives an editable copy that leaves the defaults alone', () => {
    const table = createEnemyTable();
    table.types.crawler.walkingSpeed = 1;
    expect(DEFAULT_ENEMY_TABLE.types.crawler.walkingSpeed).toBe(60);
  });
});
