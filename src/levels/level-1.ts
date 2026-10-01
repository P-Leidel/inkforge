import { DEFAULT_INK_TABLE } from '../game/ink-table';
import type { Level } from '../game/level';

/**
 * The Campaign's Level 1. A stand-in until its own slice: the sandbox Arena
 * with every Colour and two short Waves of Crawlers.
 */
export const LEVEL_1: Level = {
  name: 'Level 1',
  tanks: DEFAULT_INK_TABLE.tanks,
  waves: [
    { counts: { crawler: 2, runner: 0, heavy: 0 }, gap: 2 },
    { counts: { crawler: 3, runner: 0, heavy: 0 }, gap: 2 },
  ],
};
