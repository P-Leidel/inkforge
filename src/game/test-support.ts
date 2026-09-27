import { afterEach } from 'vitest';
import { Game, type GameOptions } from './game';

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
