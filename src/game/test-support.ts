import { afterEach } from 'vitest';
import { ENEMY_TYPES, type EnemyType } from '../materials/enemy-types';
import { Game, type GameOptions } from './game';
import type { WaveGroup } from './wave-table';

/**
 * Helpers for tests that drive the headless Game. Only test files import
 * this module.
 */

/**
 * A factory for Games over new Sandbox worlds, disposed after each test.
 * Every Game says whether Ink costs are on.
 */
export function games(): (inkCosts: boolean, options?: Omit<GameOptions, 'inkCosts'>) => Game {
  const created: Game[] = [];
  afterEach(() => {
    for (const game of created.splice(0)) game.dispose();
  });
  return (inkCosts, options = {}) => {
    const game = new Game({ inkCosts, worldOptions: { seed: 1 }, ...options });
    created.push(game);
    return game;
  };
}

/**
 * A Wave's groups from how many of each type it sends: one group a type, in
 * the catalogue's order, none for a type it sends none of.
 */
export function byType(counts: Partial<Record<EnemyType, number>>): WaveGroup[] {
  return ENEMY_TYPES.flatMap((type) => {
    const count = counts[type] ?? 0;
    return count === 0 ? [] : [{ type, count }];
  });
}
