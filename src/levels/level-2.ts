import { DEFAULT_INK_TABLE } from '../game/ink-table';
import type { Level } from '../game/level';

/**
 * The Campaign's Level 2. A stand-in until its own slice: the sandbox Arena
 * with every Colour and three short Waves, Runners joining the Crawlers.
 */
export const LEVEL_2: Level = {
  name: 'Level 2',
  tanks: DEFAULT_INK_TABLE.tanks,
  waves: [
    { counts: { crawler: 3, runner: 0, heavy: 0 }, gap: 2 },
    { counts: { crawler: 2, runner: 2, heavy: 0 }, gap: 1.5 },
    { counts: { crawler: 3, runner: 2, heavy: 0 }, gap: 1.5 },
  ],
};
