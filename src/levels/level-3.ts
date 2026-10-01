import { DEFAULT_INK_TABLE } from '../game/ink-table';
import type { Level } from '../game/level';

/**
 * The Campaign's Level 3. A stand-in until its own slice: the sandbox Arena
 * with every Colour and three short Waves of all three Enemy types.
 */
export const LEVEL_3: Level = {
  name: 'Level 3',
  tanks: DEFAULT_INK_TABLE.tanks,
  waves: [
    { counts: { crawler: 3, runner: 1, heavy: 0 }, gap: 2 },
    { counts: { crawler: 3, runner: 2, heavy: 1 }, gap: 1.5 },
    { counts: { crawler: 4, runner: 2, heavy: 2 }, gap: 1.5 },
  ],
};
